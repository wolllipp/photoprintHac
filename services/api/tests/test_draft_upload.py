"""Быстрая сборка: черновые копии 1200 px, копии для печати догружаются потом (PUT /photos/{id}/file).
Качество считается по размеру копии для печати; заказать книгу с черновыми фото нельзя."""
import io
from pathlib import Path

from PIL import Image

from app import db
from app.models import Photo
from tests.test_flow import auth, textured_png


def jpeg(w, h) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 140, 160)).save(buf, "JPEG")
    return buf.getvalue()


async def test_draft_upload_then_print_copy_unblocks_order(client):
    gh = auth((await client.post("/auth/guest")).json()["token"])
    files = [("files", (f"{i}.png", textured_png(100 + i), "image/png")) for i in range(6)]
    data = [("taken_at", "")] * 6 + [("print_w", "3000")] * 6 + [("print_h", "2250")] * 6
    # повторяющиеся поля формы — частями без имени файла рядом с файлами
    r = await client.post("/photos", files=files + [(k, (None, v)) for k, v in data], headers=gh)
    assert r.status_code == 200, r.text
    photos = r.json()
    # ширина и высота — печатные, а не черновика 64×48
    assert all((p["width"], p["height"]) == (3000, 2250) for p in photos)
    ids = [p["id"] for p in photos]

    project = (await client.post("/projects", headers=gh, json={"title": "черновик", "photo_ids": ids})).json()
    pid = project["id"]
    assert (await client.get(f"/jobs/{(await client.post(f'/projects/{pid}/build', headers=gh)).json()['job_id']}",
                             headers=gh)).json()["status"] == "done"

    uh = auth((await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375298880301", "code": "0000"})).json()["token"])
    body = {"project_id": pid, "product": "classic", "format": "20x20", "delivery": "europost_pvz",
            "pickup": {"title": "Европочта ПВЗ №112", "address": "Притыцкого, 29"}, "payment": "card"}
    blocked = await client.post("/orders", headers=uh, json=body)
    assert blocked.status_code == 409 and "загружаются" in blocked.json()["detail"]

    # копии для печати — тот же id, файл и размер меняются, черновик удаляется
    async with db.SessionLocal() as s:
        draft_path = Path((await s.get(Photo, ids[0])).path)
    assert ".draft." in draft_path.name and draft_path.exists()
    for pid_ in ids:
        r = await client.put(f"/photos/{pid_}/file", headers=uh, files={"file": ("p.jpg", jpeg(300, 225), "image/jpeg")})
        assert r.status_code == 200, r.text
        assert (r.json()["width"], r.json()["height"]) == (300, 225)
    async with db.SessionLocal() as s:
        p = await s.get(Photo, ids[0])
        assert ".draft." not in Path(p.path).name and Path(p.path).exists()
    # черновик остаётся: идущая сборка могла начать читать его до замены
    assert draft_path.exists()

    ok = await client.post("/orders", headers=uh, json=body)
    assert ok.status_code == 200, ok.text


async def test_replace_file_only_for_owner(client):
    a = auth((await client.post("/auth/guest")).json()["token"])
    b = auth((await client.post("/auth/guest")).json()["token"])
    pid = (await client.post("/photos", headers=a, files=[("files", ("i.png", textured_png(7), "image/png"))])).json()[0]["id"]
    r = await client.put(f"/photos/{pid}/file", headers=b, files={"file": ("p.jpg", jpeg(100, 100), "image/jpeg")})
    assert r.status_code == 404
