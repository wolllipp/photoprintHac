from datetime import datetime, timezone
import io
import uuid

import numpy as np
from PIL import Image
from sqlalchemy import select

from app.ai import layout, select_photos
from app import db
from app.models import BuildJob, Photo, Product, Project, ProjectPage
from tests.conftest import png


def _photo(photo_id, path, *, sharpness, width=1205, height=1795, faces=None, taken_at=None):
    return {"photo_id": photo_id, "path": str(path), "width": width, "height": height,
            "sharpness": sharpness, "faces": faces or [], "taken_at": taken_at}


def test_selection_prefers_sharp_photo_from_similar_pool(tmp_path):
    low, medium, high = (uuid.UUID(int=i) for i in (1, 2, 3))
    photos = []
    for photo_id, sharpness, width in ((low, 1, 500), (medium, 150, 1205), (high, 900, 1205)):
        path = tmp_path / str(photo_id)
        path.write_bytes(str(photo_id).encode())
        photos.append(_photo(photo_id, path, sharpness=sharpness, width=width))

    result = select_photos(photos, pages=1)

    selected = {photo["photo_id"] for photo in result if photo["selected"]}
    assert selected == {medium, high}


def test_manual_override_precedes_quality_rank(tmp_path):
    low, medium, high = (uuid.UUID(int=i) for i in (11, 12, 13))
    photos = []
    for photo_id, sharpness in ((low, 1), (medium, 150), (high, 900)):
        path = tmp_path / str(photo_id)
        path.write_bytes(str(photo_id).encode())
        photos.append(_photo(photo_id, path, sharpness=sharpness))

    result = select_photos(photos, pages=1, included_ids={low})

    selected = {photo["photo_id"] for photo in result if photo["selected"]}
    assert selected == {low, high}


def test_layout_groups_photos_by_local_calendar_day_and_keeps_crop_in_bounds():
    first, second, third = (uuid.UUID(int=i) for i in (21, 22, 23))
    photos = [
        _photo(first, "one", sharpness=500, taken_at=datetime(2026, 7, 12, 8, tzinfo=timezone.utc)),
        _photo(second, "two", sharpness=500, faces=[{"x": 0.8, "y": 0.2, "w": 0.1, "h": 0.3}],
               taken_at=datetime(2026, 7, 12, 9, tzinfo=timezone.utc)),
        _photo(third, "three", sharpness=500, taken_at=None),
    ]

    pages = layout(photos, page_count=3, min_pages=2, page_aspect=1, trim_px=30, risk_px=60)

    assert [page["chapter"] for page in pages] == ["12 июля", "Без даты"]
    frames = [frame for page in pages for frame in page["frames"]]
    assert {frame["photo_id"] for frame in frames} == {str(first), str(second), str(third)}
    for frame in frames:
        crop = frame["crop"]
        assert crop["x"] >= 0 and crop["y"] >= 0
        assert crop["x"] + crop["w"] <= 1 and crop["y"] + crop["h"] <= 1


def test_layout_reduces_pages_without_creating_empty_frames():
    photo_ids = [uuid.UUID(int=i) for i in range(31, 34)]
    photos = [_photo(photo_id, str(photo_id), sharpness=500) for photo_id in photo_ids]

    pages = layout(photos, page_count=12, min_pages=2, page_aspect=1, trim_px=30, risk_px=60)

    assert len(pages) == 2
    assert all(page["frames"] for page in pages)
    assert sum(len(page["frames"]) for page in pages) == len(photos)


def test_layout_keeps_product_minimum_even_when_there_are_fewer_photos():
    photo = _photo(uuid.UUID(int=41), "one", sharpness=500)

    pages = layout([photo], page_count=12, min_pages=10, page_aspect=1, trim_px=30, risk_px=60)

    assert len(pages) == 10
    assert sum(len(page["frames"]) for page in pages) == 1
    assert all(not any("photo_id" not in frame for frame in page["frames"]) for page in pages)


def test_layout_never_exceeds_requested_page_count_when_every_photo_has_a_different_date():
    photos = [_photo(uuid.UUID(int=50 + day), str(day), sharpness=500,
                     taken_at=datetime(2026, 7, day, tzinfo=timezone.utc))
              for day in (12, 13, 14)]

    pages = layout(photos, page_count=2, min_pages=1, page_aspect=1, trim_px=30, risk_px=60)

    assert len(pages) == 2
    assert sum(len(page["frames"]) for page in pages) == len(photos)
    assert all(page["chapter"] for page in pages)


async def test_project_format_is_saved_before_build_and_selection_exposes_quality_warnings(client):
    token = (await client.post("/auth/guest")).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    products = (await client.get("/catalog/products")).json()
    option = next(option for product in products if product["code"] == "classic"
                  for option in product["options"] if option["format"] == "20x20")
    uploaded = await client.post("/photos", headers=headers,
                                 files=[("files", ("low-res.png", png(), "image/png"))])
    photo_id = uploaded.json()[0]["id"]

    response = await client.post("/projects", headers=headers, json={
        "title": "A1 format", "photo_ids": [photo_id], "option_id": option["id"],
    })
    project_id = response.json()["id"]

    async with db.SessionLocal() as session:
        project = await session.get(Project, project_id)
        product = await session.get(Product, project.product_id)
    selection = (await client.get(f"/projects/{project_id}/selection", headers=headers)).json()

    assert response.status_code == 200
    assert str(project.option_id) == option["id"]
    assert product.code == "classic"
    assert response.json()["option_id"] == option["id"]
    assert "low_res" in {warning["code"] for warning in selection["photos"][0]["warnings"]}


async def test_story_project_keeps_selected_product_option_before_build(client):
    token = (await client.post("/auth/guest")).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    products = (await client.get("/catalog/products")).json()
    option = next(option for product in products if product["code"] == "lite"
                  for option in product["options"] if option["format"] == "21x30")

    story = await client.post("/projects/story", headers=headers, json={
        "text": "Книга о путешествии на 24 страницы", "option_id": option["id"],
    })
    project = (await client.get(f"/projects/{story.json()['project_id']}", headers=headers)).json()

    assert story.status_code == 200
    assert project["option_id"] == option["id"]


async def test_build_keeps_tariff_minimum_with_real_crop_and_quality_results(client):
    token = (await client.post("/auth/guest")).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    products = (await client.get("/catalog/products")).json()
    option = next(option for product in products if product["code"] == "classic"
                  for option in product["options"] if option["format"] == "20x20")
    large = io.BytesIO()
    files = []
    for index in range(3):
        large = io.BytesIO()
        pixels = np.random.default_rng(index).integers(0, 256, (1000, 2000), dtype=np.uint8)
        Image.fromarray(pixels).save(large, format="PNG")
        files.append(("files", (f"{index}.png", large.getvalue(), "image/png")))
    uploaded = await client.post("/photos", headers=headers, files=files)
    photo_ids = [photo["id"] for photo in uploaded.json()]
    async with db.SessionLocal() as session:
        for photo_id in photo_ids:
            photo = await session.get(Photo, photo_id)
            photo.faces = [{"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8}]
        await session.commit()
    project = (await client.post("/projects", headers=headers, json={
        "title": "A1 build", "photo_ids": photo_ids,
        "pages": 12, "option_id": option["id"],
    })).json()

    response = await client.post(f"/projects/{project['id']}/build", headers=headers)
    job_id = response.json()["job_id"]
    status = (await client.get(f"/jobs/{job_id}", headers=headers)).json()

    async with db.SessionLocal() as session:
        project_row = await session.get(Project, project["id"])
        pages = (await session.execute(
            select(ProjectPage).where(ProjectPage.project_id == project["id"])
            .order_by(ProjectPage.position)
        )).scalars().all()
        job = await session.get(BuildJob, job_id)
    selection = (await client.get(f"/projects/{project['id']}/selection", headers=headers)).json()

    frames = [frame for page in pages for frame in page.layout["frames"]]
    assert status["status"] == "done"
    # книга не бывает меньше минимума тарифа (Classic — 20 стр.): 3 фото — на первых страницах,
    # остальные страницы пустые — их подсветит редактор
    assert project_row.page_count == 20
    assert job.progress["suggested_pages"] == 20
    filled = [page for page in pages if page.layout["frames"]]
    assert len(pages) == 20 and len(filled) == 3 and pages[:3] == filled
    assert len(frames) == 3
    assert all(isinstance(frame["crop"], dict) for frame in frames)
    assert len(job.progress["quality"]) == 3
    assert sum("face_edge" in {warning["code"] for warning in report["warnings"]}
               for report in job.progress["quality"].values()) == 3
    assert sum("face_edge" in {warning["code"] for warning in photo["warnings"]}
               for photo in selection["photos"]) == 3
