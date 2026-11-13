async def test_quote_matches_site_prices(client):
    r = await client.get("/catalog/quote", params={"pages": 24, "format": "20x20"})
    t = {x["code"]: x for x in r.json()["tariffs"]}
    # super.picpac.by: цена за минимум страниц + шаг за каждые 2 страницы
    assert t["premium"]["price"] == "125.00"     # 100,50 за 10 стр. + 7 × 3,50
    assert t["classic"]["price"] == "84.00"      # 81,00 за 20 стр. + 2 × 1,50
    assert t["lite"]["price"] == "70.00"         # 70,00 за 24 стр.
    assert t["lite"]["ready_date"] <= t["classic"]["ready_date"] <= t["premium"]["ready_date"]


async def test_quote_limits(client):
    r = await client.get("/catalog/quote", params={"pages": 400})
    assert all(not t["available"] for t in r.json()["tariffs"])


async def test_products_and_delivery(client):
    prods = (await client.get("/catalog/products")).json()
    assert {p["code"] for p in prods} >= {"lite", "classic", "premium", "print_digital", "print_chemical"}
    d = {x["code"]: x for x in (await client.get("/catalog/delivery")).json()}
    assert d["europost_pvz"]["price"] == "5.90" and d["belpost"]["free_from"] == "150.00"
