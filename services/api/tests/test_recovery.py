"""Сборка, оборванная перезапуском сервера, не висит вечно (план notes/30-audit, п. 1.12)."""
from app import db
from app.jobs import recover_stale_jobs
from app.models import BuildJob, Project, ProjectStatus
from tests.test_flow import _ready_registered_project


async def test_restart_marks_stale_build_failed_and_allows_new_build(client):
    headers, project_id = await _ready_registered_project(client, "+375298880101")
    # как будто сервер упал посреди сборки: задача «идёт», книга «собирается»
    async with db.SessionLocal() as s:
        project = await s.get(Project, project_id)
        project.status = ProjectStatus.building
        job = BuildJob(project_id=project.id, status="running", stage="layout")
        s.add(job)
        await s.commit()
        stale_id = job.id

    assert await recover_stale_jobs() >= 1

    async with db.SessionLocal() as s:
        assert (await s.get(BuildJob, stale_id)).status == "failed"
        assert (await s.get(Project, project_id)).status == ProjectStatus.draft
    st = (await client.get(f"/jobs/{stale_id}", headers=headers)).json()
    assert st["status"] == "failed"
    # новая сборка — новая задача, а не старая зависшая
    r = await client.post(f"/projects/{project_id}/build", headers=headers)
    assert r.status_code == 200 and r.json()["job_id"] != str(stale_id)
