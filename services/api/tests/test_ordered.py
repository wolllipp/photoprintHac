"""После заказа книга не меняется; параллельные заказы не тратят одни пики дважды (план notes/30-audit, п. 1.7 и 1.8)."""
import asyncio

from tests.conftest import png
from tests.test_flow import _order_project, _ready_registered_project, auth


async def test_ordered_project_cannot_be_changed(client):
    headers, project_id = await _ready_registered_project(client, "+375298880001")
    sel = (await client.get(f"/projects/{project_id}/selection", headers=headers)).json()
    photo_id = sel["photos"][0]["photo_id"]
    assert (await _order_project(client, headers, project_id)).status_code == 200

    r = await client.patch(f"/projects/{project_id}/selection", headers=headers, json={"exclude": [photo_id]})
    assert r.status_code == 409, r.text
    new = (await client.post("/photos", headers=headers, files=[("files", ("n.png", png((1, 2, 3)), "image/png"))])).json()[0]["id"]
    r = await client.post(f"/projects/{project_id}/photos", headers=headers, json={"photo_ids": [new]})
    assert r.status_code == 409, r.text
    r = await client.put(f"/projects/{project_id}/pages/0", headers=headers, json={"template": "one", "frames": []})
    assert r.status_code == 409, r.text
    # повторный заказ той же книги — тоже нет
    assert (await _order_project(client, headers, project_id)).status_code == 409


async def test_parallel_orders_spend_points_once(client, monkeypatch):
    # пауза после чтения баланса: без блокировки все пять заказов успели бы увидеть «есть 100 пиков»
    from app.api import orders
    real_balance = orders.points_balance

    async def slow_balance(s, user_id):
        value = await real_balance(s, user_id)
        await asyncio.sleep(0.2)
        return value

    monkeypatch.setattr(orders, "points_balance", slow_balance)
    gh = auth((await client.post("/auth/guest")).json()["token"])
    photo = (await client.post("/photos", headers=gh, files=[("files", ("p.png", png((9, 9, 9)), "image/png"))])).json()[0]["id"]
    uh = auth((await client.post("/auth/otp/verify", headers=gh, json={"phone": "+375298880002", "code": "0000"})).json()["token"])
    assert (await client.post("/dev/points", headers=uh, params={"amount": 100})).status_code == 200
    # 30 снимков × 1,30 = 39 р. — пиками можно закрыть до 30%, т. е. все 100 пиков (10 р.)
    body = {"product": "print_chemical", "format": "10x15", "delivery": "europost_pvz", "payment": "card",
            "points_to_spend": 100, "prints": [{"photo_id": photo, "qty": 30}]}

    results = await asyncio.gather(*[client.post("/orders", headers=uh, json=body) for _ in range(5)])

    codes = sorted(r.status_code for r in results)
    assert codes == [200, 422, 422, 422, 422], [r.text for r in results]
    assert (await client.get("/me", headers=uh)).json()["points"] == 0
