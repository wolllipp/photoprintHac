from fastapi import FastAPI
from sqlalchemy import text

from app.api import auth, catalog, home, orders, photos, projects
from app.config import settings
from app.db import engine

app = FastAPI(title="picPac API")
for r in (auth.router, catalog.router, photos.router, projects.router, orders.router, home.router):
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
