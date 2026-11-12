"""Рабочее место сотрудника (ТЗ, ОТ-02): журнал действий и все заказы. Права проверяет сервер:
менеджер, руководитель и админ — да; клиент и гость — 403."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import AuditLog, Order, OrderItem, Product, Role, SupportTicket, User
from app.security.auth import current_user

router = APIRouter(prefix="/admin", tags=["admin"])
STAFF = {Role.manager, Role.head, Role.admin}


async def staff_user(user: User = Depends(current_user)) -> User:
    if user.role not in STAFF:
        raise HTTPException(403, "только для сотрудников: менеджер, руководитель, админ")
    return user


@router.get("/audit")
async def audit(action: str | None = None, user_id: uuid.UUID | None = None, since: datetime | None = None,
                limit: int = Query(100, ge=1, le=500), _: User = Depends(staff_user),
                s: AsyncSession = Depends(get_session)):
    q = select(AuditLog).order_by(AuditLog.at.desc()).limit(limit)
    if action:
        q = q.where(AuditLog.action == action)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if since:
        q = q.where(AuditLog.at >= since)
    rows = (await s.execute(q)).scalars().all()
    return [{"at": r.at.isoformat(timespec="seconds"), "user_id": str(r.user_id) if r.user_id else None, "role": r.role,
             "action": r.action, "object_type": r.object_type, "object_id": r.object_id, "status": r.status,
             "result": r.result} for r in rows]


@router.get("/orders")
async def orders(limit: int = Query(100, ge=1, le=500), _: User = Depends(staff_user),
                 s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Order).order_by(Order.created_at.desc()).limit(limit))).scalars().all()
    ids = [o.id for o in rows]
    kinds = dict((await s.execute(select(OrderItem.order_id, Product.code).join(Product, Product.id == OrderItem.product_id)
                                  .where(OrderItem.order_id.in_(ids)))).all()) if ids else {}
    open_tickets = dict((await s.execute(select(SupportTicket.order_id, func.count()).where(
        SupportTicket.order_id.in_(ids), SupportTicket.status == "open").group_by(SupportTicket.order_id))).all()) if ids else {}
    # без телефонов и имён клиентов: менеджеру для работы с заказом достаточно номера
    return [{"id": str(o.id), "number": o.number, "product": kinds.get(o.id), "stage": o.stage.value, "total": str(o.total),
             "payment": o.payment, "created_at": o.created_at.isoformat(timespec="seconds"),
             "open_support": open_tickets.get(o.id, 0)} for o in rows]
