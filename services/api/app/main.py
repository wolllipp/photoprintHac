from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.api import auth, catalog, home, orders, photos, projects, insight
from app.config import settings
from app.db import engine
from app.jobs import recover_stale_jobs


@asynccontextmanager
async def lifespan(_: FastAPI):
    # сборки, оборванные прошлым запуском, не висят вечно «собирается» (план 1.12)
    try:
        await recover_stale_jobs()
    except Exception:  # база ещё не готова — сервер всё равно поднимается, /health покажет db: false
        pass
    yield


app = FastAPI(title="picPac API", lifespan=lifespan)
for r in (auth.router, catalog.router, photos.router, projects.router, orders.router, home.router, insight.router):
    app.include_router(r)
if settings.demo_mode:
    from app.api import dev
    app.include_router(dev.router)


@app.get("/health")
async def health():
    """Жив ли сервис и доступна ли БД."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("select 1"))
        db = True
    except Exception:
        db = False
    return {"status": "ok" if db else "degraded", "db": db}
