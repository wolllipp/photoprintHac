"""Книга целиком (PUT /projects/{id}/pages): добавить, вставить, удалить, переставить страницы. Обложка — отдельно."""
from tests.test_flow import auth, textured_png


async def _book(client, n_photos=4):
    gh = auth((await client.post("/auth/guest")).json()["token"])
    files = [("files", (f"{i}.png", textured_png(300 + i), "image/png")) for i in range(n_photos)]
    ids = [p["id"] for p in (await client.post("/photos", files=files, headers=gh)).json()]
    pid = (await client.post("/projects", headers=gh, json={"title": "Книга", "photo_ids": ids, "pages": 4})).json()["id"]
    return gh, pid, ids


def page(photo_id, template="one", caption=None):
    return {"template": template, "caption": caption,
            "frames": [{"photo_id": photo_id, "frame": {"x": 0, "y": 0, "w": 1, "h": 1}}] if photo_id else []}


async def test_save_whole_book_sets_order_and_count(client):
    gh, pid, ids = await _book(client)
    # 5 страниц: нечётное число — можно, последняя страница разворота остаётся пустой
    body = {"pages": [page(ids[2]), page(ids[0]), page(None), page(ids[1], caption="лето"), page(ids[3])]}
    r = await client.put(f"/projects/{pid}/pages", headers=gh, json=body)
    assert r.status_code == 200, r.text
    assert r.json()["page_count"] == 5
    out = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()
    assert out["page_count"] == 5
    assert [p["position"] for p in out["pages"]] == [0, 1, 2, 3, 4]
    assert [p["frames"][0]["photo_id"] if p["frames"] else None for p in out["pages"]] == [ids[2], ids[0], None, ids[1], ids[3]]
    assert out["pages"][3]["caption"] == "лето"

    # удалили страницу — книга короче, хвост не остаётся
    r = await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": body["pages"][:3]})
    out = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()
    assert out["page_count"] == 3 and len(out["pages"]) == 3


async def test_whole_book_rejects_foreign_photos(client):
    gh, pid, _ = await _book(client)
    other = auth((await client.post("/auth/guest")).json()["token"])
    foreign = (await client.post("/photos", headers=other, files=[("files", ("x.png", textured_png(999), "image/png"))])).json()[0]["id"]
    r = await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": [page(foreign)]})
    assert r.status_code == 404


async def test_caption_look_saved(client):
    gh, pid, ids = await _book(client)
    pg = {**page(ids[0], template="caption", caption="Лето\nу бабушки"),
          "caption_look": {"style": "title", "size": 1.2, "lines": [1.4, None], "color": "#3A2F2B"}}
    assert (await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": [pg]})).status_code == 200
    out = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["pages"][0]
    assert out["caption"] == "Лето\nу бабушки"
    assert out["caption_look"] == {"style": "title", "size": 1.2, "lines": [1.4, None], "color": "#3A2F2B"}
    bad = {**pg, "caption_look": {"color": "red"}}
    assert (await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": [bad]})).status_code == 422


async def test_photo_palette(client):
    gh, _, ids = await _book(client)
    r = await client.get(f"/photos/{ids[0]}/palette", headers=gh)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"light", "dark"} and all(c.startswith("#") and len(c) == 7 for c in body["light"] + body["dark"])
    other = auth((await client.post("/auth/guest")).json()["token"])
    assert (await client.get(f"/photos/{ids[0]}/palette", headers=other)).status_code == 404


async def test_rename_project(client):
    gh, pid, _ = await _book(client)
    r = await client.patch(f"/projects/{pid}", headers=gh, json={"title": "  Лето у бабушки "})
    assert r.status_code == 200 and r.json()["title"] == "Лето у бабушки"
    assert (await client.patch(f"/projects/{pid}", headers=gh, json={"title": ""})).status_code == 422
    other = auth((await client.post("/auth/guest")).json()["token"])
    assert (await client.patch(f"/projects/{pid}", headers=other, json={"title": "чужое"})).status_code == 404


async def test_cover_saved_separately(client):
    gh, pid, ids = await _book(client)
    assert (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["cover"] is None
    r = await client.put(f"/projects/{pid}/cover", headers=gh, json={"photo_id": ids[1], "back_photo_id": ids[2], "title": False})
    assert r.status_code == 200, r.text
    cover = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["cover"]
    assert cover == {"photo_id": ids[1], "back_photo_id": ids[2], "title": False, "front_crop": None, "back_crop": None, "wrap": False}
    crop = {"cx": 0.4, "cy": 0.5, "z": 1.6, "a": 0.97}
    await client.put(f"/projects/{pid}/cover", headers=gh, json={"photo_id": ids[1], "title": True, "front_crop": crop})
    assert (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["cover"]["front_crop"] == crop
    # задняя сторона снова пустая
    await client.put(f"/projects/{pid}/cover", headers=gh, json={"photo_id": ids[1], "title": False})
    assert (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["cover"]["back_photo_id"] is None


async def test_build_options_pick_size_and_auto_background(client):
    """Вопросы перед сборкой: «крупно» — не больше 2 фото на странице, «все» — смазанные не берём,
    фон «ИИ подберёт» после сборки становится конкретным цветом."""
    gh = auth((await client.post("/auth/guest")).json()["token"])
    files = [("files", (f"{i}.png", textured_png(500 + i), "image/png")) for i in range(10)]
    ids = [p["id"] for p in (await client.post("/photos", files=files, headers=gh)).json()]
    style = {"pick": "all", "size": "large", "bg": "auto", "deco": "none"}
    pid = (await client.post("/projects", headers=gh, json={"title": "Крупно", "photo_ids": ids, "pages": 10,
                                                             "style": style})).json()["id"]
    job = (await client.post(f"/projects/{pid}/build", headers=gh)).json()["job_id"]
    assert (await client.get(f"/jobs/{job}", headers=gh)).json()["status"] == "done"
    out = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()
    assert all(len(p["frames"]) <= 2 for p in out["pages"])
    assert out["style"]["bg"] in {"white", "beige", "dark"} and out["style"]["size"] == "large"
    bad = await client.post("/projects", headers=gh, json={"title": "x", "photo_ids": ids, "style": {"size": "huge"}})
    assert bad.status_code == 422


def test_select_photos_all_drops_blurry_keeps_similar():
    import uuid as _uuid
    from app import ai

    def ph(sharp):
        return {"photo_id": _uuid.uuid4(), "path": "", "sharpness": sharp}
    photos = [ph(500), ph(40), ph(300)]
    hashes = {p["photo_id"]: bytes([i]) for i, p in enumerate(photos)}
    dh = {p["photo_id"]: 0 for p in photos}  # все «похожи» по dHash
    out = {d["photo_id"]: d for d in ai.select_photos(photos, 4, hashes=hashes, dhashes=dh, pick="all", capacity=16)}
    assert out[photos[0]["photo_id"]]["selected"] and out[photos[2]["photo_id"]]["selected"]
    assert not out[photos[1]["photo_id"]]["selected"] and out[photos[1]["photo_id"]]["reject_reason"] == "blur"
    # «почти все» — похожие кадры убираются, остаётся самый резкий
    most = ai.select_photos(photos, 4, hashes=hashes, dhashes=dh, pick="most", capacity=16)
    assert sum(d["selected"] for d in most) == 1


async def test_change_background_keeps_other_answers(client):
    gh = auth((await client.post("/auth/guest")).json()["token"])
    ids = [p["id"] for p in (await client.post("/photos", headers=gh, files=[("files", ("a.png", textured_png(901), "image/png"))])).json()]
    pid = (await client.post("/projects", headers=gh, json={"title": "Фон", "photo_ids": ids,
                                                             "style": {"pick": "best", "size": "small", "bg": "white", "deco": "few"}})).json()["id"]
    r = await client.patch(f"/projects/{pid}", headers=gh, json={"bg": "dark"})
    assert r.status_code == 200 and r.json()["style"] == {"pick": "best", "size": "small", "bg": "dark", "deco": "few"}
    assert (await client.patch(f"/projects/{pid}", headers=gh, json={"bg": "pink"})).status_code == 422


async def test_page_frame_saved(client):
    gh, pid, ids = await _book(client)
    pages = [{**page(ids[0]), "frame": "polaroid"}, page(ids[1])]
    assert (await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": pages})).status_code == 200
    out = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["pages"]
    assert out[0]["frame"] == "polaroid" and out[1]["frame"] is None
    bad = [{**page(ids[0]), "frame": "gold"}]
    assert (await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": bad})).status_code == 422


def test_choose_pack_by_title_then_month():
    from datetime import datetime as dt

    from app.ai.stickers import choose_pack
    assert choose_pack("Наша свадьба", None, []) == "wedding"
    assert choose_pack("Отпуск на море", None, []) == "sea"
    assert choose_pack("Книга", None, [dt(2026, 12, 30), dt(2027, 1, 2)]) == "newyear"
    assert choose_pack("Книга", None, [dt(2026, 10, 5)]) == "autumn"
    assert choose_pack("Книга", None, []) == "travel"


def test_stickers_avoid_faces():
    from app.ai.stickers import place
    # лицо в правом верхнем углу страницы — туда стикер не встаёт
    pages = [{"frames": [{"photo_id": "p", "frame": {"x": 0, "y": 0, "w": 1, "h": 1}, "crop": {"x": 0, "y": 0, "w": 1, "h": 1}}]}]
    place(pages, "sea", {"p": [{"x": 0.75, "y": 0.02, "w": 0.2, "h": 0.2}]})
    assert pages[0]["stickers"] and all(not (st["x"] > 0.5 and st["y"] < 0.5) for st in pages[0]["stickers"])
    assert all(st["id"].startswith("sea/") for st in pages[0]["stickers"])


async def test_build_with_stickers_and_save_them(client):
    gh = auth((await client.post("/auth/guest")).json()["token"])
    files = [("files", (f"{i}.png", textured_png(700 + i), "image/png")) for i in range(8)]
    ids = [p["id"] for p in (await client.post("/photos", files=files, headers=gh)).json()]
    pid = (await client.post("/projects", headers=gh, json={"title": "День рождения Маши", "photo_ids": ids, "pages": 4,
                                                             "style": {"deco": "stickers"}})).json()["id"]
    job = (await client.post(f"/projects/{pid}/build", headers=gh)).json()["job_id"]
    assert (await client.get(f"/jobs/{job}", headers=gh)).json()["status"] == "done"
    out = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()
    assert out["style"]["pack"] == "birthday"
    placed = [st for p in out["pages"] for st in p["stickers"]]
    assert placed and all(st["id"].startswith("birthday/") for st in placed)
    # приложение сохраняет стикеры со страницей; чужой «набор» не принимаем
    pg = {**page(ids[0]), "stickers": [{"id": "sea/sun", "x": 0.5, "y": 0.5, "s": 0.2, "r": 5}]}
    assert (await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": [pg]})).status_code == 200
    bad = {**page(ids[0]), "stickers": [{"id": "../etc/passwd", "x": 0.5, "y": 0.5, "s": 0.2}]}
    assert (await client.put(f"/projects/{pid}/pages", headers=gh, json={"pages": [bad]})).status_code == 422


async def test_cover_one_photo_wrap(client):
    gh, pid, ids = await _book(client)
    r = await client.put(f"/projects/{pid}/cover", headers=gh, json={"photo_id": ids[0], "title": True, "wrap": True})
    assert r.status_code == 200 and r.json()["wrap"] is True
    assert (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["cover"]["wrap"] is True


def test_series_by_time_and_relative_blur():
    """Серия одной сцены (dHash до 20, снято рядом по времени) — один самый резкий кадр; разные сцены
    с той же «похожестью», снятые в разное время, остаются; заметно мутное фото не берём."""
    import uuid as _uuid
    from datetime import datetime, timedelta

    from app import ai
    t0 = datetime(2026, 7, 1, 12, 0)
    def ph(sharp, minute, h):
        return {"photo_id": _uuid.uuid4(), "path": "", "sharpness": sharp, "taken_at": t0 + timedelta(minutes=minute), "_h": h}
    a1, a2, a3 = ph(300, 0, 0), ph(500, 1, 0b1111), ph(250, 2, 0b11111111)     # серия: d ≤ 8 между ними, рядом по времени
    far = ph(400, 120, ((1 << 18) - 1) << 40)                                  # d = 18 до a1, но через 2 часа — другая сцена
    blur = ph(60, 300, 0xAAAAAAAAAAAAAAAA)                                     # совсем другое и мутное (типичная ~300)
    photos = [a1, a2, a3, far, blur]
    hashes = {p["photo_id"]: bytes([i]) for i, p in enumerate(photos)}
    dh = {p["photo_id"]: p["_h"] for p in photos}
    out = {d["photo_id"]: d for d in ai.select_photos(photos, 4, hashes=hashes, dhashes=dh, pick="most", capacity=16)}
    assert out[a2["photo_id"]]["selected"] and not out[a1["photo_id"]]["selected"] and not out[a3["photo_id"]]["selected"]
    assert out[far["photo_id"]]["selected"]
    assert not out[blur["photo_id"]]["selected"] and out[blur["photo_id"]]["reject_reason"] == "blur"
