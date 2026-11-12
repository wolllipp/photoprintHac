import io
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

TEST_URL = os.environ.get("TEST_DATABASE_URL",
                          "postgresql+asyncpg://picpac:picpac@localhost:5433/picpac_test")
os.environ["DATABASE_URL"] = TEST_URL
os.environ["BUILD_STAGE_DELAY"] = "0"
os.environ["DEMO_MODE"] = "true"
# секрет обязателен (app/config.py); у тестов — свой, не из .env
os.environ["JWT_SECRET"] = "test-secret-only-for-pytest-0123456789abcdef"

from app import db  # noqa: E402
from app.config import settings  # noqa: E402
import app.models  # noqa: E402,F401

settings.build_stage_delay = 0


@pytest_asyncio.fixture(scope="session")
async def database(tmp_path_factory):
    settings.storage_dir = str(tmp_path_factory.mktemp("storage"))
    engine = create_async_engine(TEST_URL)
    db.engine = engine
    db.SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as c:
        await c.run_sync(db.Base.metadata.drop_all)
        await c.run_sync(db.Base.metadata.create_all)
    from app import seed
    await seed.seed()
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client(database):
    from app.main import app

    async def override():
        async with db.SessionLocal() as s:
            yield s

    app.dependency_overrides[db.get_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()


def png(color=(200, 100, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(buf, "PNG")
    return buf.getvalue()
