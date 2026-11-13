from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import admin, auth, catalog, home, orders, photos, projects, insight, speech
from app.audit import audit_middleware
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
# страницы стенда (дашборд, ассистент) читают общие данные из браузера с другого порта: только чтение, без cookies
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["Authorization"])
for r in (auth.router, catalog.router, photos.router, projects.router, orders.router, home.router, insight.router, admin.router, speech.router):
    app.include_router(r)
# журнал действий (ОТ-04): каждое изменяющее действие
app.middleware("http")(audit_middleware)
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
