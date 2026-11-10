"""Фоновая автосборка книги. Этапы — для экрана «Собираем книгу»."""
import asyncio
import uuid

from sqlalchemy import case, select

from app import ai, db
from app.ai.quality import add_crop_warning, dpi_limit_for_format, page_aspect_for_format, quality_report
from app.config import settings
from app.models import BuildJob, Photo, ProductOption, Project, ProjectPage, ProjectPhoto, ProjectStatus

STAGES = ["selecting", "layout", "faces", "captions"]


async def _lock_project_job(s, job_id: uuid.UUID, project_id: uuid.UUID):
    project = (await s.execute(
        select(Project).where(Project.id == project_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one()
    job = (await s.execute(
        select(BuildJob).where(BuildJob.id == job_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one()
    return project, job


async def run_build(job_id: uuid.UUID) -> None:
    async with db.SessionLocal() as s:
        queued_job = await s.get(BuildJob, job_id)
        if queued_job is None:
            return
        project, job = await _lock_project_job(s, job_id, queued_job.project_id)
        if job.status != "queued":
            await s.rollback()
            return
        if project.status == ProjectStatus.ordered:
            job.status, job.stage = "cancelled", None
            await s.commit()
            return
        project_id = project.id
        job.status = "running"
        project.status = ProjectStatus.building
        await s.commit()
        pages = project.page_count or 24
        option = await s.get(ProductOption, project.option_id) if project.option_id else None
        format = option.format if option else None
        dpi_limit = dpi_limit_for_format(format)
        page_aspect = page_aspect_for_format(format)
        min_pages = option.min_pages if option and option.min_pages else 2
        try:
            rows = (await s.execute(
                select(
                    ProjectPhoto.photo_id, Photo.id,
                    case((Photo.owner_id == Project.owner_id, Photo.path)),
                    Photo.owner_id, Project.owner_id, Photo.width, Photo.height,
                    Photo.sharpness, Photo.faces, Photo.taken_at,
                )
                .join(Project, Project.id == ProjectPhoto.project_id)
                .outerjoin(Photo, Photo.id == ProjectPhoto.photo_id)
                .where(Project.id == project_id)
            )).all()
            photos = []
            for row in rows:
                (project_photo_id, photo_id, path, photo_owner_id, current_owner_id,
                 width, height, sharpness, faces, taken_at) = row
                if photo_id is None or photo_owner_id != current_owner_id:
                    raise ValueError(f"Project photo {project_photo_id} is missing or has mismatched ownership")
                photos.append({"photo_id": photo_id, "path": path, "width": width, "height": height,
                               "sharpness": sharpness, "faces": faces or [], "taken_at": taken_at})
            ids = [photo["photo_id"] for photo in photos]
            selected: list[uuid.UUID] = []
            for stage in STAGES:
                await s.refresh(job)
                if job.status != "running":
                    return
                job.stage = stage
                await s.commit()
                await asyncio.sleep(settings.build_stage_delay)

                hashes = None
                if stage == "selecting":
                    hashes = {}
                    # Hashing may take time; cancellation and manual edits must remain unblocked here.
                    await asyncio.to_thread(ai.select_photos, photos, pages, hashes=hashes,
                                            dpi_limit=dpi_limit)

                project, job = await _lock_project_job(s, job_id, project_id)
                if job.status != "running":
                    await s.rollback()
                    return
                if project.status == ProjectStatus.ordered:
                    job.status, job.stage = "cancelled", None
                    await s.commit()
                    return

                prog = dict(job.progress or {})
                if stage == "selecting":
                    pps = (await s.execute(
                        select(ProjectPhoto).where(ProjectPhoto.project_id == project_id)
                        .execution_options(populate_existing=True)
                    )).scalars().all()
                    if {pp.photo_id for pp in pps} != set(ids):
                        raise ValueError("Project photos changed during build")
                    excluded_ids = {pp.photo_id for pp in pps if pp.user_override and not pp.selected}
                    included_ids = {pp.photo_id for pp in pps if pp.user_override and pp.selected}
                    decisions = ai.select_photos(
                        photos, pages, excluded_ids, included_ids, hashes=hashes, dpi_limit=dpi_limit,
                    )
                    decided = {d["photo_id"]: d for d in decisions}
                    for pp in pps:
                        if pp.user_override:
                            if not pp.selected:
                                pp.reject_reason = None
                            continue
                        d = decided[pp.photo_id]
                        pp.selected, pp.reject_reason = d["selected"], d["reject_reason"]
                    selected = [pp.photo_id for pp in pps if pp.selected]
                    prog["selecting"] = [len(selected), len(ids)]
                elif stage == "layout":
                    pps = (await s.execute(
                        select(ProjectPhoto).where(ProjectPhoto.project_id == project_id)
                        .execution_options(populate_existing=True)
                    )).scalars().all()
                    selected = [pp.photo_id for pp in pps if pp.selected]
                    selected_ids = set(selected)
                    selected_photos = [photo for photo in photos if photo["photo_id"] in selected_ids]
                    for old in (await s.execute(select(ProjectPage).where(
                        ProjectPage.project_id == project.id,
                    ))).scalars():
                        await s.delete(old)
                    layouts = ai.layout(selected_photos, pages, min_pages, page_aspect,
                                        source=project.source.value, theme=project.theme)
                    if len(layouts) < pages:
                        project.page_count = len(layouts)
                        prog["suggested_pages"] = len(layouts)
                    for pg in layouts:
                        s.add(ProjectPage(project_id=project.id, position=pg["position"], layout=pg))
                    prog["layout"] = [len(layouts), pages]
                elif stage == "faces":
                    by_id = {photo["photo_id"]: photo for photo in photos}
                    layouts = (await s.execute(select(ProjectPage).where(
                        ProjectPage.project_id == project_id,
                    ))).scalars().all()
                    crop_warnings = {frame["photo_id"]: frame["warning"]
                                     for page in layouts for frame in page.layout["frames"]
                                     if frame.get("warning")}
                    reports = {str(photo_id): add_crop_warning(
                        quality_report(by_id[photo_id], dpi_limit), crop_warnings.get(str(photo_id)))
                        for photo_id in selected if photo_id in by_id}
                    prog["faces"] = [len(reports), len(selected)]
                    prog["quality"] = reports
                job.progress = prog
                await s.commit()

            project, job = await _lock_project_job(s, job_id, project_id)
            if job.status == "running":
                if project.status == ProjectStatus.building:
                    job.status, job.stage = "done", None
                    project.status = ProjectStatus.ready
                else:
                    job.status, job.stage = "cancelled", None
                await s.commit()
            else:
                await s.rollback()
        except Exception as e:  # сборка не должна оставлять проект в «building»
            await s.rollback()
            project, job = await _lock_project_job(s, job_id, project_id)
            if job.status == "running":
                job.status, job.progress = "failed", {**(job.progress or {}), "error": str(e)}
                if project.status == ProjectStatus.building:
                    project.status = ProjectStatus.draft
                await s.commit()
            else:
                await s.rollback()
            raise
