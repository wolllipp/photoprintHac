"""Голос → текст (POST /speech): запись распознаётся на нашем сервере. В тестах модель не грузим — подменяем."""
from app.api import speech
from tests.test_flow import auth


async def test_speech_returns_text(client, monkeypatch):
    monkeypatch.setattr(speech, "transcribe", lambda data: "книга про лето на море")
    gh = auth((await client.post("/auth/guest")).json()["token"])
    r = await client.post("/speech", headers=gh, files={"file": ("voice.m4a", b"\x00" * 1000, "audio/m4a")})
    assert r.status_code == 200 and r.json() == {"text": "книга про лето на море"}


async def test_speech_needs_login_and_audio(client, monkeypatch):
    monkeypatch.setattr(speech, "transcribe", lambda data: "x")
    assert (await client.post("/speech", files={"file": ("v.m4a", b"\x00", "audio/m4a")})).status_code == 401
    gh = auth((await client.post("/auth/guest")).json()["token"])
    assert (await client.post("/speech", headers=gh, files={"file": ("v.m4a", b"", "audio/m4a")})).status_code == 422


async def test_speech_model_failure_is_503(client, monkeypatch):
    def broken(data):
        raise RuntimeError("нет модели")
    monkeypatch.setattr(speech, "transcribe", broken)
    gh = auth((await client.post("/auth/guest")).json()["token"])
    assert (await client.post("/speech", headers=gh, files={"file": ("v.m4a", b"\x00" * 10, "audio/m4a")})).status_code == 503
