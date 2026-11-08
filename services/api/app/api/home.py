from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import points_balance
from app.api.projects import project_out
from app.db import get_session
from app.models import Order, Project, ProjectStatus, Stage, User
from app.security.auth import current_user

router = APIRouter(tags=["home"])


@router.get("/home")
async def home(user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Главная: баллы, «Продолжить» (незаказанные), текущий заказ."""
    projects = (await s.execute(select(Project).where(Project.owner_id == user.id)
                                .order_by(Project.created_at.desc()))).scalars().all()
    active = (await s.execute(select(Order).where(Order.user_id == user.id, Order.stage != Stage.delivered)
                              .order_by(Order.created_at.desc()))).scalars().first()
    return {
        "points": await points_balance(s, user.id),
        "continue": [project_out(p) for p in projects if p.status != ProjectStatus.ordered],
        "albums": [project_out(p) for p in projects if p.status == ProjectStatus.ordered],
        "active_order": {"id": str(active.id), "number": active.number, "stage": active.stage.value,
                         "promised_at": active.promised_at.isoformat() if active.promised_at else None}
        if active else None,
    }
