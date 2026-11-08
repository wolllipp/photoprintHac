from tests.conftest import png


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def test_full_path_guest_to_tracked_order(client):
    # 1. гость собирает книгу без регистрации (A10)
    g = (await client.post("/auth/guest")).json()
    gh = auth(g["token"])
    files = [("files", (f"{i}.png", png((i * 10 % 255, 90, 120)), "image/png")) for i in range(12)]
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

    # 7. пики и заказ
    await client.post("/dev/points", headers=uh, params={"amount": 350})
    r = await client.post("/orders", headers=uh, json={**body, "points_to_spend": 350})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["stage"] == "accepted" and o["number"] >= 4792101
    assert o["breakdown"] == {"book": "81.10", "delivery": "5.90", "points_discount": "3.50"}
    assert o["total"] == "83.50"
    assert (await client.get("/me", headers=uh)).json()["points"] == 0

    # 8. отслеживание: этапы и «готово 6 из 12»
    for _ in range(2):
        await client.post(f"/dev/orders/{o['id']}/advance", headers=uh)
    await client.post(f"/dev/orders/{o['id']}/advance", headers=uh, params={"done": 6})
    t = (await client.get(f"/orders/{o['id']}", headers=uh)).json()
    assert t["stage"] == "printing" and t["progress"] == {"done": 6, "total": 12}
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
