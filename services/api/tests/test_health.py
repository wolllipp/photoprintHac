async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
