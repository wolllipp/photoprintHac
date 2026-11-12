"""Безопасные настройки по умолчанию (план notes/30-audit, п. 1.1 и 1.2)."""
import jwt
import pytest
from pydantic import ValidationError

from app.config import Settings, settings


def test_secret_is_required_long_and_not_from_example(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret="short")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret="dev-secret-change-me-in-production-0123456789")
    assert Settings(_env_file=None, jwt_secret="x" * 32).jwt_secret == "x" * 32


def test_demo_mode_is_off_by_default(monkeypatch):
    monkeypatch.delenv("DEMO_MODE", raising=False)
    assert Settings(_env_file=None, jwt_secret="x" * 32).demo_mode is False


async def test_demo_code_only_in_demo_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", False)
    r = await client.post("/auth/otp/verify", json={"phone": "+375297771111", "code": "0000"})
    assert r.status_code == 400
    assert (await client.post("/auth/otp/request", json={"phone": "+375297771111"})).status_code == 503
    monkeypatch.setattr(settings, "demo_mode", True)
    r = await client.post("/auth/otp/verify", json={"phone": "+375297771111", "code": "0000"})
    assert r.status_code == 200
    assert (await client.post("/auth/otp/verify", json={"phone": "+375297771111", "code": "1234"})).status_code == 400


async def test_token_signed_with_old_example_secret_is_rejected(client):
    import uuid
    from datetime import datetime, timedelta, timezone
    forged = jwt.encode({"sub": str(uuid.uuid4()), "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(days=1)},
                        "dev-secret-change-me-in-production-0123456789", "HS256")
    assert (await client.get("/me", headers={"Authorization": f"Bearer {forged}"})).status_code == 401


async def test_demo_account_has_points_from_seed(client):
    from app import db, seed
    async with db.SessionLocal() as s:  # повторный сид пики второй раз не начисляет
        await seed.seed_demo_account(s)
        await s.commit()
    v = (await client.post("/auth/otp/verify", json={"phone": "+375 29 700-00-00", "code": "0000"})).json()
    assert (await client.get("/me", headers={"Authorization": f"Bearer {v['token']}"})).json()["points"] == seed.DEMO_POINTS


async def test_different_phones_get_different_accounts(client):
    a = (await client.post("/auth/otp/verify", json={"phone": "+375297772221", "code": "0000"})).json()["user"]
    b = (await client.post("/auth/otp/verify", json={"phone": "+375297772222", "code": "0000"})).json()["user"]
    again = (await client.post("/auth/otp/verify", json={"phone": "+375 29 777-22-21", "code": "0000"})).json()["user"]
    assert a["id"] != b["id"] and again["id"] == a["id"]
