"""Только DEMO_MODE: имитация производства и баллов для демо. Подключается условно."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Order, OrderItem, OrderStage, PointsLedger, Project, Stage, User
from app.security.auth import registered_user

router = APIRouter(prefix="/dev", tags=["dev (demo)"])
ORDER = list(Stage)


@router.post("/orders/{order_id}/advance")
async def advance(order_id: uuid.UUID, done: int | None = None, user: User = Depends(registered_user),
                  s: AsyncSession = Depends(get_session)):
    """Двигает заказ на этап вперёд. Для printing можно передать done — «готово N из M разворотов»."""
    o = await s.get(Order, order_id)
    if o is None or o.user_id != user.id:
        raise HTTPException(404, "заказ не найден")
    item = (await s.execute(select(OrderItem).where(OrderItem.order_id == o.id))).scalars().first()
    pages = (await s.get(Project, item.project_id)).page_count if item and item.project_id else None
    if done is not None and o.stage == Stage.printing:
        nxt = Stage.printing
    else:
        i = ORDER.index(o.stage)
        if i == len(ORDER) - 1:
            raise HTTPException(409, "заказ уже доставлен")
        nxt = ORDER[i + 1]
    o.stage = nxt
    total = pages // 2 if pages else None
    s.add(OrderStage(order_id=o.id, stage=nxt, line="Ricoh",
                     done=(done if done is not None else (total if nxt == Stage.binding else None)) if nxt in (Stage.printing, Stage.binding) else None,
                     total=total if nxt in (Stage.printing, Stage.binding) else None))
    await s.commit()
    return {"stage": nxt.value}


@router.post("/points")
async def grant_points(amount: int = 350, user: User = Depends(registered_user), s: AsyncSession = Depends(get_session)):
    s.add(PointsLedger(user_id=user.id, delta=amount, reason="referral"))
    await s.commit()
    return {"granted": amount}
