"""Фоновая автосборка книги. Этапы — для экрана «Собираем книгу»."""
import asyncio
import uuid

from sqlalchemy import select

from app import ai, db
from app.config import settings
from app.models import BuildJob, Project, ProjectPage, ProjectPhoto, ProjectStatus

STAGES = ["selecting", "layout", "faces", "captions"]


async def run_build(job_id: uuid.UUID) -> None:
    async with db.SessionLocal() as s:
        job = await s.get(BuildJob, job_id)
        project = await s.get(Project, job.project_id)
        pps = (await s.execute(select(ProjectPhoto).where(ProjectPhoto.project_id == project.id))).scalars().all()
        ids = [p.photo_id for p in pps]
        pages = project.page_count or 24
        job.status = "running"
        project.status = ProjectStatus.building
        await s.commit()
        try:
            selected: list[uuid.UUID] = []
            for stage in STAGES:
                await s.refresh(job)
                if job.status == "cancelled":
                    project.status = ProjectStatus.draft
                    await s.commit()
                    return
                job.stage = stage
                await s.commit()
                await asyncio.sleep(settings.build_stage_delay)
                prog = dict(job.progress or {})
                if stage == "selecting":
                    decided = {d["photo_id"]: d for d in ai.select_photos(ids, pages)}
                    for pp in pps:
                        if pp.user_override:
                            continue
                        d = decided[pp.photo_id]
                        pp.selected, pp.reject_reason = d["selected"], d["reject_reason"]
                    selected = [pp.photo_id for pp in pps if pp.selected]
                    prog["selecting"] = [len(selected), len(ids)]
                elif stage == "layout":
                    selected = [pp.photo_id for pp in pps if pp.selected]
                    for old in (await s.execute(select(ProjectPage).where(ProjectPage.project_id == project.id))).scalars():
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
            job.status, job.stage = "done", None
            project.status = ProjectStatus.ready
            await s.commit()
        except Exception as e:  # сборка не должна оставлять проект в «building»
            job.status, job.progress = "failed", {**(job.progress or {}), "error": str(e)}
            project.status = ProjectStatus.draft
            await s.commit()
            raise
