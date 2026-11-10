"""Фоновая автосборка книги. Этапы — для экрана «Собираем книгу»."""
import asyncio
import uuid

from sqlalchemy import case, select

from app import ai, db
from app.config import settings
from app.models import BuildJob, Photo, Project, ProjectPage, ProjectPhoto, ProjectStatus

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
        try:
            rows = (await s.execute(
                select(
                    ProjectPhoto.photo_id, Photo.id,
                    case((Photo.owner_id == Project.owner_id, Photo.path)),
                    Photo.owner_id, Project.owner_id,
                )
                .join(Project, Project.id == ProjectPhoto.project_id)
                .outerjoin(Photo, Photo.id == ProjectPhoto.photo_id)
                .where(Project.id == project_id)
            )).all()
            photos = []
            for project_photo_id, photo_id, path, photo_owner_id, current_owner_id in rows:
                if photo_id is None or photo_owner_id != current_owner_id:
                    raise ValueError(f"Project photo {project_photo_id} is missing or has mismatched ownership")
                photos.append((photo_id, path))
            ids = [photo_id for photo_id, _ in photos]
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
                    await asyncio.to_thread(ai.select_photos, photos, pages, hashes=hashes)

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
                        photos, pages, excluded_ids, included_ids, hashes=hashes
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
                    for old in (await s.execute(select(ProjectPage).where(
                        ProjectPage.project_id == project.id,
                    ))).scalars():
                        await s.delete(old)
                    for pg in ai.layout(selected, pages):
                        s.add(ProjectPage(project_id=project.id, position=pg["position"], layout=pg))
                    prog["layout"] = [pages, pages]
                elif stage == "faces":
                    q = ai.check_quality(selected)
                    prog["faces"] = [q["checked"], len(selected)]
                    prog["quality"] = q
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
