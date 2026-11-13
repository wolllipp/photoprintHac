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
    r = await client.put(f"/projects/{pid}/cover", headers=gh, json={"photo_id": ids[1], "title": False})
    assert r.status_code == 200, r.text
    cover = (await client.get(f"/projects/{pid}/pages", headers=gh)).json()["cover"]
    assert cover == {"photo_id": ids[1], "title": False}
