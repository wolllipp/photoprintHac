"""Неверный ввод — ответ 4xx, а не 500 (план notes/30-audit, п. 1.6; отчёт бэка В-7, Н-9, Н-10)."""
import io
import uuid

from PIL import Image

from tests.conftest import png


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _guest(client):
    return auth((await client.post("/auth/guest")).json()["token"])


async def _photo(client, headers, seed=1):
    return (await client.post("/photos", headers=headers, files=[("files", (f"{seed}.png", png((seed, 10, 10)), "image/png"))])).json()[0]["id"]


async def _registered(client, phone):
    return auth((await client.post("/auth/otp/verify", json={"phone": phone, "code": "0000"})).json()["token"])


def _bitmap_png(w, h) -> bytes:
    """Чёрно-белая картинка: огромная по пикселям, но маленькая по памяти и размеру файла."""
    buf = io.BytesIO()
    Image.new("1", (w, h)).save(buf, "PNG")
    return buf.getvalue()


async def test_project_rejects_long_theme_and_pages_out_of_range(client):
    gh = await _guest(client)
    pid = await _photo(client, gh)
    base = {"title": "Книга", "photo_ids": [pid]}
    assert (await client.post("/projects", headers=gh, json={**base, "theme": "т" * 41})).status_code == 422
    assert (await client.post("/projects", headers=gh, json={**base, "pages": 3_000_000_000})).status_code == 422
    assert (await client.post("/projects", headers=gh, json={**base, "pages": -5})).status_code == 422
    assert (await client.post("/projects", headers=gh, json={**base, "title": "т" * 201})).status_code == 422
    assert (await client.post("/projects", headers=gh, json=base)).status_code == 200


async def test_project_pages_above_tariff_maximum_is_422(client):
    products = (await client.get("/catalog/products")).json()
    opt = next(o for p in products if p["code"] == "lite" for o in p["options"] if o["max_pages"])
    gh = await _guest(client)
    pid = await _photo(client, gh)
    body = {"title": "Книга", "photo_ids": [pid], "option_id": opt["id"]}
    too_many = await client.post("/projects", headers=gh, json={**body, "pages": min(opt["max_pages"] + 2, 200)})
    assert too_many.status_code == 422, too_many.text
    assert (await client.post("/projects", headers=gh, json={**body, "pages": opt["max_pages"]})).status_code == 200


async def test_story_pages_are_clamped(client):
    gh = await _guest(client)
    r = await client.post("/projects/story", headers=gh, json={"text": "Книга про дачу на 999 стр."})
    assert r.status_code == 200, r.text
    assert r.json()["parsed"]["pages"] == 200


async def test_quote_validates_project_id_and_pages(client):
    assert (await client.get("/catalog/quote", params={"project_id": "abc"})).status_code == 422
    assert (await client.get("/catalog/quote", params={"pages": -4})).status_code == 422
    assert (await client.get("/catalog/quote", params={"project_id": str(uuid.uuid4())})).status_code == 404
    assert (await client.get("/catalog/quote", params={"pages": 24})).status_code == 200


async def test_order_rejects_long_pickup_fields(client):
    uh = await _registered(client, "+375297770001")
    pid = await _photo(client, uh)
    body = {"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz", "payment": "card",
            "prints": [{"photo_id": pid, "qty": 1}]}
    for field, n in (("address", 301), ("title", 201), ("carrier", 51)):
        pickup = {"title": "ПВЗ", "address": "Минск", field: "а" * n}
        r = await client.post("/orders", headers=uh, json={**body, "pickup": pickup})
        assert r.status_code == 422, (field, r.status_code, r.text)
    ok = await client.post("/orders", headers=uh, json={**body, "pickup": {"title": "ПВЗ", "address": "а" * 300}})
    assert ok.status_code == 200, ok.text


async def test_order_limits_print_items_and_copies(client):
    uh = await _registered(client, "+375297770002")
    base = {"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz", "payment": "card"}
    many = [{"photo_id": str(uuid.uuid4()), "qty": 1} for _ in range(501)]
    assert (await client.post("/orders", headers=uh, json={**base, "prints": many})).status_code == 422
    copies = [{"photo_id": str(uuid.uuid4()), "qty": 99} for _ in range(21)]  # 2079 снимков
    assert (await client.post("/orders", headers=uh, json={**base, "prints": copies})).status_code == 422


async def test_dev_points_amount_is_bounded(client):
    uh = await _registered(client, "+375297770003")
    assert (await client.post("/dev/points", headers=uh, params={"amount": 10**12})).status_code == 422
    assert (await client.post("/dev/points", headers=uh, params={"amount": -100})).status_code == 422
    assert (await client.post("/dev/points", headers=uh, params={"amount": 10})).status_code == 200


async def test_upload_rejects_too_many_pixels(client):
    gh = await _guest(client)
    # 64 Мпикс — больше нашего лимита 60 Мпикс
    r = await client.post("/photos", headers=gh, files=[("files", ("big.png", _bitmap_png(8000, 8000), "image/png"))])
    assert r.status_code == 413, r.text
    # 196 Мпикс — Pillow сам считает это «бомбой»; раньше это был 500
    r = await client.post("/photos", headers=gh, files=[("files", ("bomb.png", _bitmap_png(14000, 14000), "image/png"))])
    assert r.status_code == 413, r.text
