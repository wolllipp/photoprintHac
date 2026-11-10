import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.ai.quality import add_crop_warning, dpi_limit_for_format, quality_report
from app.db import get_session
from app.jobs import run_build
from app.models import (BuildJob, Photo, Product, ProductOption, Project, ProjectPage, ProjectPhoto,
                        ProjectSource, ProjectStatus, User)
from app.security.auth import current_user

router = APIRouter(tags=["projects"])


class ProjectIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    photo_ids: list[uuid.UUID] = Field(min_length=1)
    theme: str | None = None
    pages: int = 24
    option_id: uuid.UUID | None = None


class StoryIn(BaseModel):
    text: str = Field(min_length=3)
    photo_ids: list[uuid.UUID] = []
    option_id: uuid.UUID | None = None


class PhotosIn(BaseModel):
    photo_ids: list[uuid.UUID]


class SelectionPatch(BaseModel):
    include: list[uuid.UUID] = []
    exclude: list[uuid.UUID] = []


def project_out(p: Project) -> dict:
    return {"id": str(p.id), "title": p.title, "theme": p.theme, "tone": p.tone, "status": p.status.value,
            "source": p.source.value, "page_count": p.page_count,
            "option_id": str(p.option_id) if p.option_id else None,
            "created_at": p.created_at.isoformat()}


async def book_option(s: AsyncSession, option_id: uuid.UUID | None) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Проверяет опцию фотокниги и возвращает ID продукта и опции."""
    if option_id is None:
        return None, None
    option = await s.get(ProductOption, option_id)
    product = await s.get(Product, option.product_id) if option else None
    if option is None or product is None:
        raise HTTPException(404, "формат не найден")
    if product.kind != "photobook":
        raise HTTPException(422, "нужен формат фотокниги")
    return product.id, option.id


async def own_project(s: AsyncSession, project_id: uuid.UUID, user: User) -> Project:
    p = await s.get(Project, project_id)
    if p is None or p.owner_id != user.id:
        raise HTTPException(404, "проект не найден")
    return p


async def locked_owned_project(s: AsyncSession, project_id: uuid.UUID, user: User) -> Project:
    p = (await s.execute(
        select(Project).where(Project.id == project_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if p is None or p.owner_id != user.id:
        raise HTTPException(404, "проект не найден")
    return p


async def attach(s: AsyncSession, project: Project, photo_ids: list[uuid.UUID], user: User) -> int:
    """Прикрепляет только СВОИ фото; чужие id молча не принимаем."""
    mine = set((await s.execute(select(Photo.id).where(Photo.id.in_(photo_ids), Photo.owner_id == user.id))).scalars())
    if len(mine) != len(set(photo_ids)):
        raise HTTPException(404, "часть фото не найдена")
    have = set((await s.execute(select(ProjectPhoto.photo_id).where(ProjectPhoto.project_id == project.id))).scalars())
    for pid in mine - have:
        s.add(ProjectPhoto(project_id=project.id, photo_id=pid))
    return len(mine - have)


@router.post("/projects")
async def create_project(body: ProjectIn, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Путь А: человек сам выбрал фото и создал проект."""
    product_id, option_id = await book_option(s, body.option_id)
    p = Project(owner_id=user.id, title=body.title, theme=body.theme, page_count=body.pages,
                product_id=product_id, option_id=option_id, source=ProjectSource.picked)
    s.add(p)
    await s.flush()
    await attach(s, p, body.photo_ids, user)
    await s.commit()
    return project_out(p)


@router.post("/projects/story")
async def create_story(body: StoryIn, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Путь Б: описание словами → «Поняли так» (разбор — модуль Марка)."""
    parsed = ai.parse_story(body.text)
    product_id, option_id = await book_option(s, body.option_id)
    p = Project(owner_id=user.id, title=parsed["title"], theme=parsed["theme"], tone=parsed["tone"],
                product_id=product_id, option_id=option_id, page_count=parsed["pages"], source=ProjectSource.story)
    s.add(p)
    await s.flush()
    if body.photo_ids:
        await attach(s, p, body.photo_ids, user)
    await s.commit()
    return {"parsed": parsed, "project_id": str(p.id)}


@router.get("/projects")
async def my_projects(user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Project).where(Project.owner_id == user.id)
                            .order_by(Project.created_at.desc()))).scalars().all()
    return [project_out(p) for p in rows]


@router.get("/projects/{project_id}")
async def get_project(project_id: uuid.UUID, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    p = await own_project(s, project_id, user)
    n = (await s.execute(select(func.count()).select_from(ProjectPhoto)
                         .where(ProjectPhoto.project_id == p.id))).scalar_one()
    return {**project_out(p), "photo_count": n}


@router.post("/projects/{project_id}/photos")
async def add_photos(project_id: uuid.UUID, body: PhotosIn, user: User = Depends(current_user),
                     s: AsyncSession = Depends(get_session)):
    p = await own_project(s, project_id, user)
    added = await attach(s, p, body.photo_ids, user)
    await s.commit()
    return {"added": added}


@router.post("/projects/{project_id}/build")
async def build(project_id: uuid.UUID, bg: BackgroundTasks, user: User = Depends(current_user),
                s: AsyncSession = Depends(get_session)):
    p = await locked_owned_project(s, project_id, user)
    n = (await s.execute(select(func.count()).select_from(ProjectPhoto).where(ProjectPhoto.project_id == p.id))).scalar_one()
    if n == 0:
        raise HTTPException(422, "в проекте нет фото")
    if p.status == ProjectStatus.ordered:
        raise HTTPException(409, "проект уже заказан")
    running = (await s.execute(select(BuildJob).where(BuildJob.project_id == p.id,
                                                      BuildJob.status.in_(["queued", "running"])))).scalars().first()
    if running:
        return {"job_id": str(running.id)}
    job = BuildJob(project_id=p.id)
    s.add(job)
    await s.commit()
    bg.add_task(run_build, job.id)
    return {"job_id": str(job.id)}


@router.get("/jobs/{job_id}")
async def job_status(job_id: uuid.UUID, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    job = await s.get(BuildJob, job_id)
    if job is None:
        raise HTTPException(404, "задача не найдена")
    await own_project(s, job.project_id, user)
    return {"id": str(job.id), "status": job.status, "stage": job.stage, "progress": job.progress,
            "stages": ["selecting", "layout", "faces", "captions"]}


@router.post("/jobs/{job_id}/cancel")
async def job_cancel(job_id: uuid.UUID, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    job = await s.get(BuildJob, job_id)
    if job is None:
        raise HTTPException(404, "задача не найдена")
    project = await locked_owned_project(s, job.project_id, user)
    job = (await s.execute(
        select(BuildJob).where(BuildJob.id == job_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one()
    if job.status in ("queued", "running"):
        was_running = job.status == "running"
        job.status = "cancelled"
        if was_running and project.status == ProjectStatus.building:
            await s.flush()
            newer = (await s.execute(select(BuildJob.id).where(
                BuildJob.project_id == project.id,
                BuildJob.id != job.id,
                BuildJob.status.in_(("queued", "running")),
            ))).first()
            if newer is None:
                project.status = ProjectStatus.draft
        await s.commit()
    return {"status": job.status}


@router.get("/projects/{project_id}/selection")
async def selection(project_id: uuid.UUID, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Экран «Лучшие 38 из 214»: что взяли, что отсеяли и почему."""
    p = await own_project(s, project_id, user)
    option = await s.get(ProductOption, p.option_id) if p.option_id else None
    dpi_limit = dpi_limit_for_format(option.format if option else None)
    layouts = (await s.execute(select(ProjectPage).where(ProjectPage.project_id == p.id))).scalars().all()
    crop_warnings = {frame["photo_id"]: frame["warning"]
                     for page in layouts for frame in page.layout["frames"] if frame.get("warning")}
    rows = (await s.execute(select(ProjectPhoto, Photo).join(
        Photo, Photo.id == ProjectPhoto.photo_id,
    ).where(ProjectPhoto.project_id == p.id))).all()
    rejected: dict[str, int] = {}
    for project_photo, _ in rows:
        if not project_photo.selected and project_photo.reject_reason:
            rejected[project_photo.reject_reason] = rejected.get(project_photo.reject_reason, 0) + 1
    return {"selected": sum(project_photo.selected for project_photo, _ in rows), "total": len(rows),
            "rejected": rejected,
            "photos": [{"photo_id": str(project_photo.photo_id), "selected": project_photo.selected,
                        "reject_reason": project_photo.reject_reason, "user_override": project_photo.user_override,
                        "warnings": add_crop_warning(
                            quality_report(photo, dpi_limit), crop_warnings.get(str(project_photo.photo_id)),
                        )["warnings"]}
                       for project_photo, photo in rows]}


@router.patch("/projects/{project_id}/selection")
async def patch_selection(project_id: uuid.UUID, body: SelectionPatch, user: User = Depends(current_user),
                          s: AsyncSession = Depends(get_session)):
    """Вернуть отсеянное фото (или убрать выбранное). Ручной выбор сборка больше не трогает."""
    p = await locked_owned_project(s, project_id, user)
    rows = {r.photo_id: r for r in (await s.execute(
        select(ProjectPhoto).where(ProjectPhoto.project_id == p.id)
        .execution_options(populate_existing=True)
    )).scalars()}
    for pid in body.include:
        if pid in rows:
            rows[pid].selected, rows[pid].reject_reason, rows[pid].user_override = True, None, True
    for pid in body.exclude:
        if pid in rows:
            rows[pid].selected, rows[pid].user_override = False, True
    await s.commit()
    return {"selected": sum(r.selected for r in rows.values()), "total": len(rows)}
