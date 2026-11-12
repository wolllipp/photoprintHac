import asyncio
import io
from pathlib import Path
import threading

import numpy as np
import pytest
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import db
from app.config import settings
from app.models import BuildJob, Photo, Project, ProjectPage, ProjectPhoto
from app.jobs import run_build
from tests.conftest import png


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def textured_png(seed):
    """Генерирует тестовое фото с устойчивым отличием для dHash."""
    buffer = io.BytesIO()
    pixels = np.random.default_rng(seed).integers(0, 256, (48, 64), dtype=np.uint8)
    Image.fromarray(pixels).save(buffer, "PNG")
    return buffer.getvalue()


async def test_full_path_guest_to_tracked_order(client):
    # 1. гость собирает книгу без регистрации (A10)
    g = (await client.post("/auth/guest")).json()
    gh = auth(g["token"])
    files = [("files", (f"{i}.png", textured_png(i), "image/png")) for i in range(12)]
    photos = (await client.post("/photos", files=files, headers=gh)).json()
    assert len(photos) == 12

    # 2. путь Б: словами → «поняли так»
    story = (await client.post("/projects/story", headers=gh, json={
        "text": "Книга про поездку в Карелию, тёплая, на 24 страницы, больше пейзажей",
        "photo_ids": [p["id"] for p in photos]})).json()
    assert story["parsed"]["theme"] == "travel" and story["parsed"]["pages"] == 24
    pid = story["project_id"]

    # 3. сборка с этапами
    job = (await client.post(f"/projects/{pid}/build", headers=gh)).json()["job_id"]
    st = (await client.get(f"/jobs/{job}", headers=gh)).json()
    assert st["status"] == "done"
    sel = (await client.get(f"/projects/{pid}/selection", headers=gh)).json()
    assert sel["total"] == 12 and 0 < sel["selected"] <= 12
    # страницы для просмотра в приложении: по порядку, в каждой рамке — отобранное фото
    pages = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()
    assert pages["pages"] and [p["position"] for p in pages["pages"]] == sorted(p["position"] for p in pages["pages"])
    placed = {f["photo_id"] for p in pages["pages"] for f in p["frames"]}
    assert placed <= {p["photo_id"] for p in sel["photos"] if p["selected"]}

    # 4. вернуть отсеянное фото; повторная сборка этого выбора не трогает
    rejected = [p["photo_id"] for p in sel["photos"] if not p["selected"]]
    if rejected:
        await client.patch(f"/projects/{pid}/selection", headers=gh, json={"include": [rejected[0]]})
        await client.post(f"/projects/{pid}/build", headers=gh)
        sel2 = (await client.get(f"/projects/{pid}/selection", headers=gh)).json()
        assert next(p for p in sel2["photos"] if p["photo_id"] == rejected[0])["selected"] is True

    # 5. заказывать гостю нельзя
    body = {"project_id": pid, "product": "classic", "format": "20x20", "delivery": "europost_pvz",
            "pickup": {"title": "Европочта ПВЗ №112", "address": "Притыцкого, 29"}, "payment": "card"}
    assert (await client.post("/orders", headers=gh, json=body)).status_code == 403

    # 6. вход по телефону: черновик гостя остаётся у клиента
    await client.post("/auth/otp/request", json={"phone": "+375 29 123-45-67"})
    assert (await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375291234567", "code": "1111"})).status_code == 400
    v = (await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375291234567", "code": "0000"})).json()
    uh = auth(v["token"])
    assert v["user"]["is_guest"] is False
    assert any(p["id"] == pid for p in (await client.get("/projects", headers=uh)).json())

    # 7. пики и заказ: книга меньше минимума Classic считается по минимуму — 20 стр. = 81,00;
    #    1 пик = 0,10 руб., списать можно до 30% книги (81,00 → 243 пика = 24,30)
    await client.post("/dev/points", headers=uh, params={"amount": 350})
    r = await client.post("/orders", headers=uh, json={**body, "points_to_spend": 350})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["stage"] == "accepted" and o["number"] >= 4792101
    assert o["breakdown"] == {"book": "81.00", "delivery": "5.90", "points_discount": "24.30", "points_spent": 243}
    assert o["total"] == "62.60"
    assert (await client.get("/me", headers=uh)).json()["points"] == 107  # остаток не сгорел

    # 8. отслеживание: этапы и «готово 2 из 10 разворотов» (20 стр. — минимум Classic)
    for _ in range(2):
        await client.post(f"/dev/orders/{o['id']}/advance", headers=uh)
    await client.post(f"/dev/orders/{o['id']}/advance", headers=uh, params={"done": 2})
    t = (await client.get(f"/orders/{o['id']}", headers=uh)).json()
    assert t["stage"] == "printing" and t["progress"] == {"done": 2, "total": 10}
    assert [x["stage"] for x in t["timeline"]][:3] == ["accepted", "layout_checked", "printing"]

    # 9. главная
    h = (await client.get("/home", headers=uh)).json()
    assert h["active_order"]["number"] == o["number"] and h["albums"]


async def test_isolation_between_users(client):
    a = (await client.post("/auth/guest")).json()["token"]
    b = (await client.post("/auth/guest")).json()["token"]
    p = (await client.post("/photos", headers=auth(a), files=[("files", ("x.png", png(), "image/png"))])).json()[0]
    assert (await client.get(f"/photos/{p['id']}/file", headers=auth(b))).status_code == 404
    assert (await client.get(f"/photos/{p['id']}/file", headers=auth(a))).status_code == 200
    r = await client.post("/projects", headers=auth(b), json={"title": "чужое", "photo_ids": [p["id"]]})
    assert r.status_code == 404


async def test_bad_upload(client):
    t = (await client.post("/auth/guest")).json()["token"]
    r = await client.post("/photos", headers=auth(t), files=[("files", ("x.txt", b"hello", "text/plain"))])
    assert r.status_code == 415


async def test_build_rejects_only_exact_duplicate_and_keeps_restored_duplicate(client):
    token = (await client.post("/auth/guest")).json()["token"]
    image_a, image_b = png((10, 20, 30)), textured_png(1)
    uploaded = await client.post("/photos", headers=auth(token), files=[
        ("files", ("a.png", image_a, "image/png")),
        ("files", ("b.png", image_a, "image/png")),
        ("files", ("c.png", image_b, "image/png")),
    ])
    photo_ids = [photo["id"] for photo in uploaded.json()]
    project = await client.post("/projects", headers=auth(token), json={
        "title": "Exact duplicates", "photo_ids": photo_ids, "pages": 1,
    })
    project_id = project.json()["id"]

    await client.post(f"/projects/{project_id}/build", headers=auth(token))
    selection = (await client.get(f"/projects/{project_id}/selection", headers=auth(token))).json()
    assert selection["selected"] == 2
    assert selection["rejected"] == {"similar": 1}
    duplicate = next(photo["photo_id"] for photo in selection["photos"] if photo["reject_reason"] == "similar")

    await client.patch(f"/projects/{project_id}/selection", headers=auth(token), json={"include": [duplicate]})
    await client.post(f"/projects/{project_id}/build", headers=auth(token))
    rebuilt = (await client.get(f"/projects/{project_id}/selection", headers=auth(token))).json()
    restored = next(photo for photo in rebuilt["photos"] if photo["photo_id"] == duplicate)
    assert restored["selected"] is True and restored["user_override"] is True


async def test_build_fails_when_registered_photo_file_cannot_be_read(client):
    token = (await client.post("/auth/guest")).json()["token"]
    uploaded = await client.post("/photos", headers=auth(token), files=[
        ("files", ("a.png", png(), "image/png")),
    ])
    photo_id = uploaded.json()[0]["id"]
    project = await client.post("/projects", headers=auth(token), json={
        "title": "Missing file", "photo_ids": [photo_id],
    })
    project_id = project.json()["id"]
    next(Path(settings.storage_dir).rglob(f"{photo_id}.*")).unlink()

    with pytest.raises(FileNotFoundError):
        await client.post(f"/projects/{project_id}/build", headers=auth(token))
    async with db.SessionLocal() as session:
        job = (await session.execute(select(BuildJob).where(BuildJob.project_id == project_id))).scalar_one()
        assert job.status == "failed"
        assert "error" in job.progress


async def test_build_hashing_does_not_block_event_loop(client, monkeypatch):
    from app import ai

    token = (await client.post("/auth/guest")).json()["token"]
    photo = (await client.post("/photos", headers=auth(token), files=[
        ("files", ("a.png", png(), "image/png")),
    ])).json()[0]
    project = (await client.post("/projects", headers=auth(token), json={
        "title": "Responsive build", "photo_ids": [photo["id"]],
    })).json()
    original = ai.select_photos

    hashing_started, allow_hashing = threading.Event(), threading.Event()

    def slow_selection(*args, **kwargs):
        hashing_started.set()
        if not allow_hashing.wait(2):
            raise TimeoutError("test did not release photo hashing")
        return original(*args, **kwargs)

    monkeypatch.setattr(ai, "select_photos", slow_selection)

    async def check_loop_progress():
        await asyncio.to_thread(hashing_started.wait, 1)
        assert hashing_started.is_set()
        assert not allow_hashing.is_set()

    probe = asyncio.create_task(check_loop_progress())
    build_task = asyncio.create_task(client.post(f"/projects/{project['id']}/build", headers=auth(token)))
    try:
        await probe
    finally:
        allow_hashing.set()
    await build_task


async def test_manual_selection_survives_patch_while_hashing(client, monkeypatch):
    from app import ai

    token = (await client.post("/auth/guest")).json()["token"]
    photos = (await client.post("/photos", headers=auth(token), files=[
        ("files", ("a.png", png(), "image/png")),
        ("files", ("b.png", png(), "image/png")),
        ("files", ("c.png", textured_png(3), "image/png")),
        ("files", ("d.png", textured_png(4), "image/png")),
    ])).json()
    project = (await client.post("/projects", headers=auth(token), json={
        "title": "Concurrent manual selection", "photo_ids": [photo["id"] for photo in photos], "pages": 1,
    })).json()
    original = ai.select_photos
    hashing_started, allow_hashing = threading.Event(), threading.Event()

    def paused_selection(*args, **kwargs):
        hashing_started.set()
        if not allow_hashing.wait(2):
            raise TimeoutError("test did not release photo hashing")
        return original(*args, **kwargs)

    monkeypatch.setattr(ai, "select_photos", paused_selection)
    build_task = asyncio.create_task(client.post(f"/projects/{project['id']}/build", headers=auth(token)))
    try:
        assert await asyncio.to_thread(hashing_started.wait, 1)
        patch = asyncio.create_task(client.patch(
            f"/projects/{project['id']}/selection", headers=auth(token), json={"exclude": [photos[0]["id"]]},
        ))
        response = await asyncio.wait_for(patch, timeout=1)
        assert response.status_code == 200
    finally:
        allow_hashing.set()
    await build_task

    selection = (await client.get(f"/projects/{project['id']}/selection", headers=auth(token))).json()
    photo_result = next(p for p in selection["photos"] if p["photo_id"] == photos[0]["id"])
    assert photo_result["selected"] is False
    assert photo_result["user_override"] is True
    assert photo_result["reject_reason"] is None
    duplicate_alternate = next(p for p in selection["photos"] if p["photo_id"] == photos[1]["id"])
    assert duplicate_alternate["reject_reason"] != "similar"
    assert selection["selected"] == 2
    assert selection["rejected"] == {"capacity": 1}


async def test_cancelled_build_cannot_apply_results_or_overwrite_newer_build(client, monkeypatch):
    from app import ai

    token = (await client.post("/auth/guest")).json()["token"]
    photo = (await client.post("/photos", headers=auth(token), files=[
        ("files", ("a.png", png(), "image/png")),
    ])).json()[0]
    project = (await client.post("/projects", headers=auth(token), json={
        "title": "Superseded build", "photo_ids": [photo["id"]],
    })).json()
    original = ai.select_photos
    first_started, allow_first = threading.Event(), threading.Event()
    calls_lock = threading.Lock()
    calls = 0

    def first_build_is_stale(*args, **kwargs):
        nonlocal calls
        with calls_lock:
            calls += 1
            first = calls == 1
        if first:
            first_started.set()
            if not allow_first.wait(2):
                raise TimeoutError("test did not release cancelled selection")
            return [{"photo_id": photo["photo_id"], "selected": False, "reject_reason": "capacity"}
                    for photo in args[0]]
        return original(*args, **kwargs)

    monkeypatch.setattr(ai, "select_photos", first_build_is_stale)
    old_build_task = asyncio.create_task(client.post(f"/projects/{project['id']}/build", headers=auth(token)))
    try:
        assert await asyncio.to_thread(first_started.wait, 1)
        async with db.SessionLocal() as session:
            old_job = (await session.execute(select(BuildJob).where(BuildJob.project_id == project["id"]))).scalar_one()
            old_job_id = str(old_job.id)
        cancelled = await client.post(f"/jobs/{old_job_id}/cancel", headers=auth(token))
        assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"

        new_response = await client.post(f"/projects/{project['id']}/build", headers=auth(token))
        new_job_id = new_response.json()["job_id"]
        new_job = (await client.get(f"/jobs/{new_job_id}", headers=auth(token))).json()
        assert new_job["status"] == "done"
        assert (await client.get(f"/projects/{project['id']}", headers=auth(token))).json()["status"] == "ready"
    finally:
        allow_first.set()
    await old_build_task

    old_job = (await client.get(f"/jobs/{old_job_id}", headers=auth(token))).json()
    selection = (await client.get(f"/projects/{project['id']}/selection", headers=auth(token))).json()
    assert old_job["status"] == "cancelled"
    assert selection["photos"][0]["selected"] is True
    assert (await client.get(f"/projects/{project['id']}", headers=auth(token))).json()["status"] == "ready"


async def test_build_uses_current_owner_after_guest_transfer(client, monkeypatch):
    existing = (await client.post("/auth/otp/verify", json={"phone": "+375291112233", "code": "0000"})).json()
    guest = (await client.post("/auth/guest")).json()
    guest_headers = auth(guest["token"])
    photo = (await client.post("/photos", headers=guest_headers, files=[
        ("files", ("a.png", png(), "image/png")),
    ])).json()[0]
    project = (await client.post("/projects", headers=guest_headers, json={
        "title": "Transfer during build", "photo_ids": [photo["id"]],
    })).json()

    entered_query, continue_query = asyncio.Event(), asyncio.Event()
    original_execute = AsyncSession.execute
    armed = True

    async def gated_execute(session, statement, *args, **kwargs):
        nonlocal armed
        if armed and "JOIN photos" in str(statement):
            armed = False
            entered_query.set()
            await continue_query.wait()
        return await original_execute(session, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "execute", gated_execute)
    build_task = asyncio.create_task(client.post(f"/projects/{project['id']}/build", headers=guest_headers))
    await asyncio.wait_for(entered_query.wait(), timeout=2)
    await client.post("/auth/otp/verify", headers=guest_headers,
                      json={"phone": "+375291112233", "code": "0000"})
    continue_query.set()
    build_response = await build_task
    assert build_response.status_code == 200
    job = (await client.get(f"/jobs/{build_response.json()['job_id']}", headers=auth(existing["token"]))).json()
    assert job["status"] == "done"
    assert job["progress"]["selecting"] == [1, 1]
    selection = (await client.get(f"/projects/{project['id']}/selection", headers=auth(existing["token"]))).json()
    assert selection["selected"] == selection["total"] == 1


async def test_build_fails_closed_for_linked_photo_owned_by_another_user(client):
    guest = (await client.post("/auth/guest")).json()
    other = (await client.post("/auth/guest")).json()
    other_user = (await client.get("/me", headers=auth(other["token"]))).json()
    photo = (await client.post("/photos", headers=auth(guest["token"]), files=[
        ("files", ("a.png", png(), "image/png")),
    ])).json()[0]
    project = (await client.post("/projects", headers=auth(guest["token"]), json={
        "title": "Ownership mismatch", "photo_ids": [photo["id"]],
    })).json()
    async with db.SessionLocal() as session:
        await session.execute(
            update(Photo).where(Photo.id == photo["id"]).values(owner_id=other_user["id"])
        )
        await session.commit()

    with pytest.raises(ValueError, match="mismatched ownership"):
        await client.post(f"/projects/{project['id']}/build", headers=auth(guest["token"]))
    async with db.SessionLocal() as session:
        job = (await session.execute(select(BuildJob).where(BuildJob.project_id == project["id"]))).scalar_one()
        assert job.status == "failed"
        assert "photo" in job.progress["error"].lower()


async def test_rebuild_clears_legacy_fake_reason_from_manual_exclusion(client):
    token = (await client.post("/auth/guest")).json()["token"]
    image = png()
    photos = (await client.post("/photos", headers=auth(token), files=[
        ("files", ("a.png", image, "image/png")),
        ("files", ("b.png", image, "image/png")),
    ])).json()
    project = (await client.post("/projects", headers=auth(token), json={
        "title": "Legacy reject", "photo_ids": [photo["id"] for photo in photos], "pages": 1,
    })).json()
    await client.post(f"/projects/{project['id']}/build", headers=auth(token))
    selection = (await client.get(f"/projects/{project['id']}/selection", headers=auth(token))).json()
    auto_selected = next(photo["photo_id"] for photo in selection["photos"] if photo["selected"])
    await client.patch(f"/projects/{project['id']}/selection", headers=auth(token), json={"exclude": [auto_selected]})
    async with db.SessionLocal() as session:
        row = (await session.execute(select(ProjectPhoto).where(
            ProjectPhoto.project_id == project["id"], ProjectPhoto.photo_id == auto_selected,
        ))).scalar_one()
        row.reject_reason = "blurry"
        await session.commit()

    await client.post(f"/projects/{project['id']}/build", headers=auth(token))
    rebuilt = (await client.get(f"/projects/{project['id']}/selection", headers=auth(token))).json()
    manually_excluded = next(photo for photo in rebuilt["photos"] if photo["photo_id"] == auto_selected)
    assert manually_excluded["selected"] is False
    assert manually_excluded["user_override"] is True
    assert manually_excluded["reject_reason"] is None
    assert rebuilt["selected"] == 1


@pytest.mark.parametrize("operation", ["build", "cancel", "patch"])
async def test_project_owner_is_rechecked_after_lock_wait_and_transfer(client, monkeypatch, operation):
    account = (await client.post("/auth/otp/verify", json={
        "phone": "+375291234567", "code": "0000",
    })).json()
    guest = (await client.post("/auth/guest")).json()
    guest_headers = auth(guest["token"])
    photo = (await client.post("/photos", headers=guest_headers, files=[
        ("files", ("a.png", png(), "image/png")),
    ])).json()[0]
    project = (await client.post("/projects", headers=guest_headers, json={
        "title": "Transfer while waiting for lock", "photo_ids": [photo["id"]],
    })).json()
    job_id = None
    if operation == "cancel":
        async with db.SessionLocal() as session:
            job = BuildJob(project_id=project["id"])
            session.add(job)
            await session.commit()
            job_id = str(job.id)

    lock_query_entered, continue_lock_query = asyncio.Event(), asyncio.Event()
    execute = AsyncSession.execute
    armed = True

    async def pause_project_lock(session, statement, *args, **kwargs):
        nonlocal armed
        if armed and "FOR UPDATE" in str(statement).upper() and "PROJECTS" in str(statement).upper():
            armed = False
            lock_query_entered.set()
            await continue_lock_query.wait()
        return await execute(session, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "execute", pause_project_lock)
    if operation == "build":
        request = client.post(f"/projects/{project['id']}/build", headers=guest_headers)
    elif operation == "cancel":
        request = client.post(f"/jobs/{job_id}/cancel", headers=guest_headers)
    else:
        request = client.patch(f"/projects/{project['id']}/selection", headers=guest_headers,
                               json={"exclude": [photo["id"]]})
    request_task = asyncio.create_task(request)
    try:
        await asyncio.wait_for(lock_query_entered.wait(), timeout=2)
        await client.post("/auth/otp/verify", headers=guest_headers,
                          json={"phone": "+375291234567", "code": "0000"})
    finally:
        continue_lock_query.set()
    response = await request_task

    assert response.status_code == 404
    async with db.SessionLocal() as session:
        project_row = await session.get(Project, project["id"])
        photo_row = (await session.execute(select(ProjectPhoto).where(
            ProjectPhoto.project_id == project["id"], ProjectPhoto.photo_id == photo["id"],
        ))).scalar_one()
        assert str(project_row.owner_id) == account["user"]["id"]
        assert photo_row.user_override is False
        if operation == "build":
            assert (await session.execute(select(BuildJob).where(BuildJob.project_id == project["id"]))).first() is None
        elif operation == "cancel":
            assert (await session.get(BuildJob, job_id)).status == "queued"


async def _ready_registered_project(client, phone):
    guest = (await client.post("/auth/guest")).json()
    guest_headers = auth(guest["token"])
    photo = (await client.post("/photos", headers=guest_headers, files=[
        ("files", ("a.png", png(), "image/png")),
    ])).json()[0]
    project = (await client.post("/projects", headers=guest_headers, json={
        "title": "Ready project", "photo_ids": [photo["id"]],
    })).json()
    await client.post(f"/projects/{project['id']}/build", headers=guest_headers)
    login = (await client.post("/auth/otp/verify", headers=guest_headers,
                              json={"phone": phone, "code": "0000"})).json()
    return auth(login["token"]), project["id"]


async def _create_queued_job(project_id):
    async with db.SessionLocal() as session:
        job = BuildJob(project_id=project_id)
        session.add(job)
        await session.commit()
        return job.id


async def _order_project(client, headers, project_id):
    return await client.post("/orders", headers=headers, json={
        "project_id": project_id, "product": "classic", "format": "20x20",
        "delivery": "europost_pvz", "payment": "card",
    })


async def test_cancel_queued_rebuild_preserves_ready_project(client):
    headers, project_id = await _ready_registered_project(client, "+375291111111")
    job_id = await _create_queued_job(project_id)

    response = await client.post(f"/jobs/{job_id}/cancel", headers=headers)

    assert response.json()["status"] == "cancelled"
    assert (await client.get(f"/projects/{project_id}", headers=headers)).json()["status"] == "ready"


async def test_cancel_queued_rebuild_preserves_ordered_project(client):
    headers, project_id = await _ready_registered_project(client, "+375292222222")
    assert (await _order_project(client, headers, project_id)).status_code == 200
    job_id = await _create_queued_job(project_id)

    response = await client.post(f"/jobs/{job_id}/cancel", headers=headers)

    assert response.json()["status"] == "cancelled"
    assert (await client.get(f"/projects/{project_id}", headers=headers)).json()["status"] == "ordered"


async def test_queued_worker_started_after_order_cannot_change_project_or_pages(client):
    headers, project_id = await _ready_registered_project(client, "+375293333333")
    assert (await _order_project(client, headers, project_id)).status_code == 200
    job_id = await _create_queued_job(project_id)
    async with db.SessionLocal() as session:
        pages_before = (await session.execute(select(ProjectPage).where(
            ProjectPage.project_id == project_id,
        ).order_by(ProjectPage.position))).scalars().all()
        pages_before = [(page.position, page.layout) for page in pages_before]

    await run_build(job_id)

    async with db.SessionLocal() as session:
        project = await session.get(Project, project_id)
        job = await session.get(BuildJob, job_id)
        pages_after = (await session.execute(select(ProjectPage).where(
            ProjectPage.project_id == project_id,
        ).order_by(ProjectPage.position))).scalars().all()
        assert project.status.value == "ordered"
        assert job.status == "cancelled"
        assert [(page.position, page.layout) for page in pages_after] == pages_before


async def test_upload_accepts_iphone_mpo(client):
    """Айфон часто сохраняет фото как MPO (JPEG с кадрами глубины/HDR) — такие фото должны загружаться."""
    from PIL import Image
    first, second = Image.new("RGB", (64, 48), (200, 80, 40)), Image.new("RGB", (64, 48), (20, 80, 200))
    buf = io.BytesIO()
    first.save(buf, "MPO", save_all=True, append_images=[second])
    assert Image.open(io.BytesIO(buf.getvalue())).format == "MPO"
    token = (await client.post("/auth/guest")).json()["token"]
    r = await client.post("/photos", headers={"Authorization": f"Bearer {token}"},
                          files=[("files", ("iphone.jpeg", buf.getvalue(), "image/jpeg"))])
    assert r.status_code == 200, r.text
    assert r.json()[0]["width"] == 64


async def test_order_with_extras_and_promo_matches_app_total(client):
    """Сумма на сервере — как в приложении: книга + допуслуги − промокод (10% книги) + доставка − пики (до 30% товаров)."""
    gh = auth((await client.post("/auth/guest")).json()["token"])
    files = [("files", (f"{i}.png", png(i), "image/png")) for i in range(3)]
    photos = (await client.post("/photos", headers=gh, files=files)).json()
    pid = (await client.post("/projects", headers=gh, json={"title": "Промо", "photo_ids": [p["id"] for p in photos]})).json()["id"]
    await client.post(f"/projects/{pid}/build", headers=gh)
    v = (await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375291110000", "code": "0000"})).json()
    uh = auth(v["token"])
    body = {"project_id": pid, "product": "classic", "format": "20x20", "delivery": "europost_pvz", "payment": "card"}
    assert (await client.post("/orders", headers=uh, json={**body, "promo_code": "НЕТАКОГО"})).status_code == 422
    assert (await client.post("/orders", headers=uh, json={**body, "extras": ["unknown"]})).status_code == 422
    r = await client.post("/orders", headers=uh, json={**body, "extras": ["gift"], "promo_code": "picpac10"})
    assert r.status_code == 200, r.text
    o = r.json()
    # Classic по минимуму 20 стр. = 81,00; подарочная упаковка 4,90; промокод −8,10; Европочта 5,90
    assert o["breakdown"]["book"] == "81.00" and o["breakdown"]["extras"] == "4.90" and o["breakdown"]["promo_discount"] == "8.10"
    assert o["total"] == "83.70"


async def test_page_edit_is_saved_and_returned(client):
    """Правка страницы из приложения сохраняется: макет, фото по рамкам (своё фото не из книги прикрепляется), подпись, улучшения."""
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photos = (await client.post("/photos", headers=gh, files=[("files", (f"{i}.png", png(i), "image/png")) for i in range(3)])).json()
    pid = (await client.post("/projects", headers=gh, json={"title": "Правки", "photo_ids": [photos[0]["id"], photos[1]["id"]]})).json()["id"]
    await client.post(f"/projects/{pid}/build", headers=gh)
    new = photos[2]["id"]  # «заменить из галереи»: фото, которого не было в книге
    r = await client.put(f"/projects/{pid}/pages/0", headers=gh, json={
        "template": "caption", "caption": "Лето у бабушки", "fx": {"0": ["light", "horizon"]},
        "frames": [{"photo_id": new, "frame": {"x": 0, "y": 0, "w": 1, "h": 0.8}}]})
    assert r.status_code == 200, r.text
    first = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["pages"][0]
    assert first["template"] == "caption" and first["caption"] == "Лето у бабушки" and first["fx"] == {"0": ["light", "horizon"]}
    assert [f["photo_id"] for f in first["frames"]] == [new]
    sel = {p["photo_id"]: p for p in (await client.get(f"/projects/{pid}/selection", headers=gh)).json()["photos"]}
    assert sel[new]["selected"] is True and sel[new]["user_override"] is True
    # чужое фото поставить нельзя
    other = auth((await client.post("/auth/guest")).json()["token"])
    foreign = (await client.post("/photos", headers=other, files=[("files", ("x.png", png(9), "image/png"))])).json()[0]["id"]
    bad = await client.put(f"/projects/{pid}/pages/1", headers=gh, json={"template": "one", "frames": [{"photo_id": foreign, "frame": {"x": 0, "y": 0, "w": 1, "h": 1}}]})
    assert bad.status_code == 404


async def test_print_order_without_book(client):
    """Фотопечать: заказ из своих фото — по цене за штуку формата × копии, без книги."""
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photos = (await client.post("/photos", headers=gh, files=[("files", (f"{i}.png", png(i), "image/png")) for i in range(2)])).json()
    uh = auth((await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375291112233", "code": "0000"})).json()["token"])
    body = {"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz", "payment": "card",
            "prints": [{"photo_id": photos[0]["id"], "qty": 3}, {"photo_id": photos[1]["id"], "qty": 1}]}
    r = await client.post("/orders", headers=uh, json=body)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["breakdown"]["prints"] == "5.20"  # 4 × 1,30 — цена с super.picpac.by
    assert o["total"] == "11.10"               # + Европочта 5,90
    assert (await client.post("/orders", headers=uh, json={**body, "prints": []})).status_code == 422



async def test_support_ticket_is_linked_to_order(client):
    """Обращение в поддержку — по конкретному заказу; чужой заказ не найти."""
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photos = (await client.post("/photos", headers=gh, files=[("files", ("s.png", png(5), "image/png"))])).json()
    uh = auth((await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375295554433", "code": "0000"})).json()["token"])
    o = (await client.post("/orders", headers=uh, json={"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz",
                                                          "payment": "card", "prints": [{"photo_id": photos[0]["id"], "qty": 1}]})).json()
    r = await client.post(f"/orders/{o['id']}/support", headers=uh, json={"topic": "defect", "text": "Полоса на третьем фото"})
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["order_number"] == o["number"] and t["topic_title"] == "Брак печати" and t["status"] == "open" and t["number"] >= 10001
    listed = (await client.get(f"/orders/{o['id']}/support", headers=uh)).json()
    assert [x["number"] for x in listed] == [t["number"]]
    assert (await client.post(f"/orders/{o['id']}/support", headers=uh, json={"topic": "nope", "text": "абв"})).status_code == 422
    other = auth((await client.post("/auth/otp/verify", json={"phone": "+375296667788", "code": "0000"})).json()["token"])
    assert (await client.get(f"/orders/{o['id']}/support", headers=other)).status_code == 404


async def test_caption_font_is_saved_with_page(client):
    """Шрифт подписи сохраняется вместе с подписью; неизвестный шрифт — 422."""
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photos = (await client.post("/photos", headers=gh, files=[("files", ("f.png", png(7), "image/png"))])).json()
    pid = (await client.post("/projects", headers=gh, json={"title": "Шрифт", "photo_ids": [photos[0]["id"]]})).json()["id"]
    frame = {"photo_id": photos[0]["id"], "frame": {"x": 0, "y": 0, "w": 1, "h": 0.8}}
    r = await client.put(f"/projects/{pid}/pages/0", headers=gh, json={"template": "caption", "frames": [frame], "caption": "Лето", "caption_font": "hand"})
    assert r.status_code == 200, r.text
    first = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["pages"][0]
    assert first["caption"] == "Лето" and first["caption_font"] == "hand"
    bad = await client.put(f"/projects/{pid}/pages/0", headers=gh, json={"template": "caption", "frames": [frame], "caption": "Лето", "caption_font": "comic"})
    assert bad.status_code == 422



async def test_audit_log_and_staff_role(client):
    """Журнал действий пишет вход, загрузку, книгу, заказ; смотреть его может только сотрудник, клиенту — 403."""
    from app import db
    from app.models import Role, User
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photos = (await client.post("/photos", headers=gh, files=[("files", ("a.png", png(11), "image/png"))])).json()
    pid = (await client.post("/projects", headers=gh, json={"title": "Журнал", "photo_ids": [photos[0]["id"]]})).json()["id"]
    uh = auth((await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375291230000", "code": "0000"})).json()["token"])
    o = (await client.post("/orders", headers=uh, json={"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz",
                                                          "payment": "card", "prints": [{"photo_id": photos[0]["id"], "qty": 1}]})).json()
    # клиент журнал и чужие заказы не видит
    assert (await client.get("/admin/audit", headers=uh)).status_code == 403
    assert (await client.get("/admin/orders", headers=gh)).status_code == 403
    assert (await client.get("/admin/audit")).status_code == 401
    # менеджер — видит
    mh = auth((await client.post("/auth/otp/verify", json={"phone": "+375291230001", "code": "0000"})).json()["token"])
    async with db.SessionLocal() as s:
        from sqlalchemy import select
        m = (await s.execute(select(User).where(User.phone == "+375291230001"))).scalar_one()
        m.role = Role.manager
        await s.commit()
    mh = auth((await client.post("/auth/otp/verify", json={"phone": "+375291230001", "code": "0000"})).json()["token"])
    log = (await client.get("/admin/audit?limit=500", headers=mh)).json()
    actions = {(r["action"], r["object_id"]) for r in log}
    assert ("создание книги", pid) in actions
    assert ("заказ", o["id"]) in actions
    assert any(a == "загрузка фото" for a, _ in actions) and any(a == "вход по телефону" for a, _ in actions)
    # в журнале нет телефонов
    assert "375291230000" not in str(log)
    orders = (await client.get("/admin/orders", headers=mh)).json()
    assert any(x["number"] == o["number"] for x in orders)
