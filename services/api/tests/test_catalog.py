async def test_quote_matches_site_prices(client):
    r = await client.get("/catalog/quote", params={"pages": 24, "format": "20x20"})
    t = {x["code"]: x for x in r.json()["tariffs"]}
    assert t["premium"]["price"] == "96.60"      # 70.35 за 5 разворотов + 7 × 3.75
    assert t["classic"]["price"] == "81.10"      # 72.90 за 10 разворотов + 2 × 4.10 (допущение)
    assert t["lite"]["price"] == "56.00"         # цена «от» за 24 стр.
    assert t["lite"]["ready_date"] < t["classic"]["ready_date"] <= t["premium"]["ready_date"]


async def test_quote_limits(client):
    r = await client.get("/catalog/quote", params={"pages": 400})
    assert all(not t["available"] for t in r.json()["tariffs"])


async def test_products_and_delivery(client):
    prods = (await client.get("/catalog/products")).json()
    assert {p["code"] for p in prods} >= {"lite", "classic", "premium", "print_digital", "print_chemical"}
    d = {x["code"]: x for x in (await client.get("/catalog/delivery")).json()}
    assert d["europost_pvz"]["price"] == "5.90" and d["belpost"]["free_from"] == "150.00"
