"""Повтор заказа с тем же Idempotency-Key не создаёт второй заказ (план notes/30-audit, п. 1.5)."""
import asyncio

from tests.conftest import png
from tests.test_flow import auth


async def _print_body(client, phone, seed):
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photo = (await client.post("/photos", headers=gh, files=[("files", ("i.png", png((seed, 1, 1)), "image/png"))])).json()[0]["id"]
    uh = auth((await client.post("/auth/otp/verify", headers=gh, json={"phone": phone, "code": "0000"})).json()["token"])
    body = {"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz", "payment": "card",
            "prints": [{"photo_id": photo, "qty": 2}]}
    return uh, body


async def test_same_key_returns_same_order(client):
    uh, body = await _print_body(client, "+375298880201", 11)
    h = {**uh, "Idempotency-Key": "k-1"}
    first = await client.post("/orders", headers=h, json=body)
    again = await client.post("/orders", headers=h, json=body)
    assert first.status_code == 200 and again.status_code == 200, (first.text, again.text)
    assert again.json()["id"] == first.json()["id"] and again.json()["number"] == first.json()["number"]
    assert again.json()["replayed"] is True
    assert len((await client.get("/orders", headers=uh)).json()) == 1
    # тот же ключ, но другое содержимое — это ошибка клиента, а не повтор
    other = await client.post("/orders", headers=h, json={**body, "prints": [{**body["prints"][0], "qty": 3}]})
    assert other.status_code == 409
    # без ключа — как раньше, каждый запрос — новый заказ
    assert (await client.post("/orders", headers=uh, json=body)).json()["id"] != first.json()["id"]


async def test_parallel_retries_with_one_key_create_one_order(client):
    uh, body = await _print_body(client, "+375298880202", 12)
    h = {**uh, "Idempotency-Key": "k-parallel"}
    results = await asyncio.gather(*[client.post("/orders", headers=h, json=body) for _ in range(4)])
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    assert len({r.json()["id"] for r in results}) == 1
    assert len((await client.get("/orders", headers=uh)).json()) == 1
