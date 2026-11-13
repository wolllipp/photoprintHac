import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai
from app.ai.stickers import STICKER_ID
from app.ai.quality import add_crop_warning, is_spread_template, quality_report
from app.db import get_session
from app.jobs import run_build
from app.models import (BuildJob, Photo, Product, ProductOption, Project, ProjectPage, ProjectPhoto,
                        ProjectSource, ProjectStatus, User)
from app.security.auth import current_user

router = APIRouter(tags=["projects"])


# Границы объёма книги: больше 200 страниц не печатает ни один тариф; длины строк — по колонкам в models/projects.py
MIN_PAGES, MAX_PAGES = 1, 200


class StyleIn(BaseModel):
    """Ответы перед сборкой; всё необязательно — чего нет, решает ИИ (как раньше)."""
    pick: str = Field("most", pattern="^(best|most|all)$")  # лучшие | почти все (без похожих) | все (кроме размытых)
    size: str = Field("medium", pattern="^(large|medium|small)$")  # фото крупно | средне | много мелких
    bg: str = Field("white", pattern="^(white|beige|dark|auto)$")  # фон страниц; auto — по фото
    deco: str = Field("none", pattern="^(none|few|stickers)$")  # украшения


class ProjectIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    photo_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)
    theme: str | None = Field(None, max_length=40)
    pages: int = Field(24, ge=MIN_PAGES, le=MAX_PAGES)
    option_id: uuid.UUID | None = None
    style: StyleIn | None = None


class StoryIn(BaseModel):
    text: str = Field(min_length=3, max_length=5000)
    photo_ids: list[uuid.UUID] = []
    option_id: uuid.UUID | None = None


class PhotosIn(BaseModel):
    photo_ids: list[uuid.UUID]


class SelectionPatch(BaseModel):
    include: list[uuid.UUID] = []
    exclude: list[uuid.UUID] = []


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


def project_out(p: Project) -> dict:
    return {"id": str(p.id), "title": p.title, "theme": p.theme, "tone": p.tone, "status": p.status.value,
            "source": p.source.value, "page_count": p.page_count,
            "option_id": str(p.option_id) if p.option_id else None,
            "created_at": p.created_at.isoformat()}


async def book_option(s: AsyncSession, option_id: uuid.UUID | None,
                      pages: int | None = None) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Проверяет опцию фотокниги и возвращает ID продукта и опции.

    Больше максимума тарифа книга не бывает — 422. Меньше минимума можно: при заказе объём доводится до минимума.
    """
    if option_id is None:
        return None, None
    option = await s.get(ProductOption, option_id)
    product = await s.get(Product, option.product_id) if option else None
    if option is None or product is None:
        raise HTTPException(404, "формат не найден")
    if product.kind != "photobook":
        raise HTTPException(422, "нужен формат фотокниги")
    if pages is not None and option.max_pages and pages > option.max_pages:
        raise HTTPException(422, f"в тарифе {product.title} не больше {option.max_pages} страниц")
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


def ensure_editable(p: Project) -> None:
    """Заказанную книгу не меняют: печатается ровно то, за что заплатили (план 1.7)."""
    if p.status == ProjectStatus.ordered:
        raise HTTPException(409, "проект уже заказан")


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
    product_id, option_id = await book_option(s, body.option_id, body.pages)
    p = Project(owner_id=user.id, title=body.title, theme=body.theme, page_count=body.pages,
                product_id=product_id, option_id=option_id, source=ProjectSource.picked,
                style=body.style.model_dump() if body.style else None)
    s.add(p)
    await s.flush()
    await attach(s, p, body.photo_ids, user)
    await s.commit()
    return project_out(p)


@router.post("/projects/story")
async def create_story(body: StoryIn, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Путь Б: описание словами → «Поняли так» (разбор — модуль Марка)."""
    parsed = await asyncio.to_thread(ai.parse_story_llm, body.text[:500])
    # «книга на 999 стр.» — объём в пределах, которые печатаем; название и тема — в длину колонок
    parsed["pages"] = min(max(int(parsed.get("pages") or 24), MIN_PAGES), MAX_PAGES)
    parsed["title"] = (parsed.get("title") or "Книга")[:200]
    for key in ("theme", "tone"):
        if parsed.get(key):
            parsed[key] = parsed[key][:40]
    # Подбор фото по содержимому текста требует CLIP-класса модели — вне демо.
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


class ProjectPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    bg: str | None = Field(None, pattern="^(white|beige|dark)$")  # фон страниц, меняют в редакторе


@router.patch("/projects/{project_id}")
async def rename_project(project_id: uuid.UUID, body: ProjectPatch, user: User = Depends(current_user),
                         s: AsyncSession = Depends(get_session)):
    """Название книги и фон страниц — их меняют прямо в редакторе (название — на обложке и в «Черновиках»)."""
    p = await locked_owned_project(s, project_id, user)
    ensure_editable(p)
    if body.title is not None:
        p.title = body.title.strip() or p.title
    if body.bg is not None:
        p.style = {**(p.style or {}), "bg": body.bg}
    await s.commit()
    return {**project_out(p), "style": p.style}


@router.post("/projects/{project_id}/photos")
async def add_photos(project_id: uuid.UUID, body: PhotosIn, user: User = Depends(current_user),
                     s: AsyncSession = Depends(get_session)):
    # блокировка — чтобы фото не прикрепились к книге в тот момент, когда её заказывают
    p = await locked_owned_project(s, project_id, user)
    ensure_editable(p)
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


@router.get("/projects/{project_id}/pages")
async def project_pages(project_id: uuid.UUID, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Собранные страницы по порядку: какое фото в какой рамке (доли страницы) и глава — для просмотра книги в приложении."""
    p = await own_project(s, project_id, user)
    rows = (await s.execute(select(ProjectPage).where(ProjectPage.project_id == p.id)
                            .order_by(ProjectPage.position))).scalars().all()
    return {"project_id": str(p.id), "page_count": p.page_count, "status": p.status.value, "cover": p.cover,
            "style": p.style,
            "pages": [{"position": r.position, "chapter": r.layout.get("chapter"),
                       "template": r.layout.get("template"), "caption": r.layout.get("caption"),
                       "caption_font": r.layout.get("caption_font"),
                       "caption_look": r.layout.get("caption_look"),
                       "frame": r.layout.get("frame"),
                       "stickers": r.layout.get("stickers") or [],
                       "fx": r.layout.get("fx") or {},
                       "frames": [{"photo_id": f["photo_id"], "frame": f["frame"]} for f in r.layout.get("frames", [])]}
                      for r in rows]}


class FrameIn(BaseModel):
    photo_id: uuid.UUID
    frame: dict[str, float]


class CaptionLook(BaseModel):
    """Вид подписи: стиль строк, общий размер (доля от обычного), размер каждой строки отдельно, цвет текста."""
    style: str | None = Field(None, pattern="^(title|plain|quote)$")  # заголовок + подпись | только подпись | цитата
    size: float | None = Field(None, ge=0.5, le=2.5)
    lines: list[float | None] = Field(default_factory=list, max_length=6)
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")


class StickerIn(BaseModel):
    """Стикер на странице: какой (набор/имя), где центр (доли страницы), ширина (доля ширины страницы), наклон."""
    id: str = Field(pattern=STICKER_ID.pattern)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    s: float = Field(ge=0.04, le=0.6)
    r: float = Field(0, ge=-45, le=45)


class PageIn(BaseModel):
    template: str = Field(min_length=1, max_length=40)  # макет из библиотеки приложения: one, two-side, spread…
    frames: list[FrameIn] = Field(default_factory=list, max_length=8)
    caption: str | None = Field(None, max_length=300)
    caption_font: str | None = Field(None, pattern="^(classic|plain|bold|hand)$")  # шрифт подписи в приложении
    caption_look: CaptionLook | None = None
    frame: str | None = Field(None, pattern="^(none|mat|line|polaroid|round)$")  # рамка фото на странице
    stickers: list[StickerIn] = Field(default_factory=list, max_length=12)
    fx: dict[str, list[str]] = Field(default_factory=dict)  # номер рамки → улучшения ИИ


async def keep_photos(s: AsyncSession, p: Project, ids: list[uuid.UUID], user: User) -> None:
    """Фото, поставленные руками, — свои (чужие не примем), выбраны, и пересборка их не уберёт."""
    if not ids:
        return
    await attach(s, p, ids, user)
    await s.flush()
    rows = {r.photo_id: r for r in (await s.execute(
        select(ProjectPhoto).where(ProjectPhoto.project_id == p.id, ProjectPhoto.photo_id.in_(ids))
    )).scalars()}
    for pid in set(ids):
        rows[pid].selected, rows[pid].reject_reason, rows[pid].user_override = True, None, True


def page_layout(position: int, body: PageIn, chapter: str | None = None) -> dict:
    return {"position": position, "chapter": chapter, "template": body.template,
            "caption": body.caption, "caption_font": body.caption_font,
            "caption_look": body.caption_look.model_dump(exclude_none=True) if body.caption_look else None, "frame": body.frame, "stickers": [x.model_dump() for x in body.stickers], "fx": body.fx,
            "frames": [{"photo_id": str(f.photo_id), "frame": f.frame} for f in body.frames]}


@router.put("/projects/{project_id}/pages/{position}")
async def save_page(project_id: uuid.UUID, position: int, body: PageIn, user: User = Depends(current_user),
                    s: AsyncSession = Depends(get_session)):
    """Правка страницы из приложения: макет, фото по рамкам, подпись, улучшения. Свои фото не из проекта — прикрепляем."""
    p = await locked_owned_project(s, project_id, user)
    if p.status == ProjectStatus.ordered:
        raise HTTPException(409, "проект уже заказан")
    if position < 0 or position >= MAX_PAGES:
        raise HTTPException(422, "нет такой страницы")
    # правят страницу за концом книги (в приложении книга длиннее: тариф с бо́льшим минимумом) — книга растёт до неё
    if p.page_count is not None and position >= p.page_count:
        p.page_count = position + 1
    await keep_photos(s, p, [f.photo_id for f in body.frames], user)
    page = (await s.execute(select(ProjectPage).where(ProjectPage.project_id == p.id,
                                                      ProjectPage.position == position))).scalar_one_or_none()
    layout = page_layout(position, body, (page.layout if page else {}).get("chapter"))
    if page is None:
        s.add(ProjectPage(project_id=p.id, position=position, layout=layout))
    else:
        page.layout = layout
    await s.commit()
    return layout


class BookIn(BaseModel):
    pages: list[PageIn] = Field(min_length=MIN_PAGES, max_length=MAX_PAGES)


@router.put("/projects/{project_id}/pages")
async def save_book(project_id: uuid.UUID, body: BookIn, user: User = Depends(current_user),
                    s: AsyncSession = Depends(get_session)):
    """Все страницы разом, по порядку: человек добавил, вставил, удалил или переставил страницы —
    номера всех следующих сдвинулись, и сохранять по одной странице нельзя. Объём книги = число страниц."""
    p = await locked_owned_project(s, project_id, user)
    ensure_editable(p)
    await keep_photos(s, p, [f.photo_id for pg in body.pages for f in pg.frames], user)
    for old in (await s.execute(select(ProjectPage).where(ProjectPage.project_id == p.id))).scalars():
        await s.delete(old)
    await s.flush()
    for k, pg in enumerate(body.pages):
        s.add(ProjectPage(project_id=p.id, position=k, layout=page_layout(k, pg)))
    p.page_count = len(body.pages)
    await s.commit()
    return {"page_count": p.page_count}


class CoverIn(BaseModel):
    photo_id: uuid.UUID | None = None  # фото на лицевой стороне; нет — первое фото книги
    back_photo_id: uuid.UUID | None = None  # фото на задней стороне; нет — задняя сторона без фото
    # кадр фото на стороне обложки, как у фото на страницах: центр cx, cy, увеличение z, пропорции a
    front_crop: dict[str, float] | None = None
    back_crop: dict[str, float] | None = None
    # одно фото на всю обложку (задняя сторона, корешок, лицевая): фото — photo_id, кадр — front_crop
    wrap: bool = False
    title: bool = True  # название книги на обложке


@router.put("/projects/{project_id}/cover")
async def save_cover(project_id: uuid.UUID, body: CoverIn, user: User = Depends(current_user),
                     s: AsyncSession = Depends(get_session)):
    """Обложка — отдельно от страниц: её не переставляют и не удаляют."""
    p = await locked_owned_project(s, project_id, user)
    ensure_editable(p)
    ids = [i for i in (body.photo_id, body.back_photo_id) if i]
    if ids:
        await keep_photos(s, p, ids, user)
    p.cover = {"photo_id": str(body.photo_id) if body.photo_id else None,
               "back_photo_id": str(body.back_photo_id) if body.back_photo_id else None, "title": body.title,
               "front_crop": body.front_crop, "back_crop": body.back_crop, "wrap": body.wrap}
    await s.commit()
    return p.cover


@router.get("/projects/{project_id}/selection")
async def selection(project_id: uuid.UUID, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Экран «Лучшие 38 из 214»: что взяли, что отсеяли и почему."""
    p = await own_project(s, project_id, user)
    option = await s.get(ProductOption, p.option_id) if p.option_id else None
    format = option.format if option else None
    product = await s.get(Product, p.product_id) if p.product_id else None
    product_code = product.code if product else None
    layouts = (await s.execute(select(ProjectPage).where(ProjectPage.project_id == p.id))).scalars().all()
    frames = {frame["photo_id"]: frame for page in layouts for frame in page.layout["frames"]}
    spread = {frame["photo_id"]: is_spread_template(page.layout.get("template"))
              for page in layouts for frame in page.layout["frames"]}
    rows = (await s.execute(select(ProjectPhoto, Photo).join(
        Photo, Photo.id == ProjectPhoto.photo_id,
    ).where(ProjectPhoto.project_id == p.id).order_by(Photo.created_at, Photo.id))).all()
    rejected: dict[str, int] = {}
    for project_photo, _ in rows:
        if not project_photo.selected and project_photo.reject_reason:
            rejected[project_photo.reject_reason] = rejected.get(project_photo.reject_reason, 0) + 1
    photo_results = []
    for project_photo, photo in rows:
        frame = frames.get(str(project_photo.photo_id))
        report = quality_report(
            photo, format=format, frame=frame.get("frame") if frame else None,
            crop=frame.get("crop") if frame else None, product=product_code,
            spread=spread.get(str(project_photo.photo_id), False),
        )
        report = add_crop_warning(report, frame.get("warning") if frame else None)
        photo_results.append({
            "photo_id": str(project_photo.photo_id), "selected": project_photo.selected,
            "reject_reason": project_photo.reject_reason, "user_override": project_photo.user_override,
            "warnings": report["warnings"], "effective_dpi": report["effective_dpi"],
            "quality_level": report["quality_level"],
            "requires_confirmation": report["requires_confirmation"],
            # сколько лиц на фото — для правок «меньше людей», «больше пейзажей» (null — не проверяли)
            "faces": len(photo.faces) if photo.faces is not None else None,
        })
    return {"selected": sum(project_photo.selected for project_photo, _ in rows), "total": len(rows),
            "rejected": rejected, "photos": photo_results}


@router.patch("/projects/{project_id}/selection")
async def patch_selection(project_id: uuid.UUID, body: SelectionPatch, user: User = Depends(current_user),
                          s: AsyncSession = Depends(get_session)):
    """Вернуть отсеянное фото (или убрать выбранное). Ручной выбор сборка больше не трогает."""
    p = await locked_owned_project(s, project_id, user)
    ensure_editable(p)
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


@router.post("/projects/{project_id}/chat")
async def project_chat(project_id: uuid.UUID, body: ChatIn, bg: BackgroundTasks,
                       user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Применяет короткую команду к выбору и пересобирает проект при необходимости."""
    p = await own_project(s, project_id, user)
    if p.status == ProjectStatus.ordered:
        raise HTTPException(409, "проект уже заказан")
    intent = await asyncio.to_thread(ai.parse_story_intent, body.message)
    action = intent["action"]
    if action not in ("remove_photo", "add_photo", "set_pages", "regenerate"):
        raise HTTPException(422, "не удалось распознать команду")
    photo_ids = [uuid.UUID(str(photo_id)) for photo_id in intent.get("photo_ids", [])]
    # Н — позиция фото в том же порядке, что и в GET /selection.
    if not photo_ids and intent.get("photo_number"):
        numbered = (await s.execute(
            select(Photo.id).join(ProjectPhoto, ProjectPhoto.photo_id == Photo.id)
            .where(ProjectPhoto.project_id == p.id).order_by(Photo.created_at, Photo.id)
        )).scalars().all()
        number = intent["photo_number"]
        if 1 <= number <= len(numbered):
            photo_ids = [numbered[number - 1]]
    if action in ("remove_photo", "add_photo"):
        if not photo_ids:
            raise HTTPException(404, "фото не найдено в проекте")
        attached = set((await s.execute(
            select(ProjectPhoto.photo_id).where(
                ProjectPhoto.project_id == p.id, ProjectPhoto.photo_id.in_(photo_ids),
            )
        )).scalars())
        if attached != set(photo_ids):
            raise HTTPException(404, "фото не найдено в проекте")
        patch = SelectionPatch(exclude=photo_ids) if action == "remove_photo" else SelectionPatch(include=photo_ids)
        await patch_selection(project_id, patch, user, s)
    elif action == "set_pages":
        if intent.get("pages") is None:
            raise HTTPException(422, "не указано число страниц")
        p.page_count = intent["pages"]
        await s.commit()
    return await build(project_id, bg, user, s)
