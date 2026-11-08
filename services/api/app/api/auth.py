import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import Photo, PointsLedger, Project, User
from app.security.auth import current_user, make_token, optional_user

router = APIRouter(tags=["auth"])


class PhoneIn(BaseModel):
    phone: str


class VerifyIn(PhoneIn):
    code: str


def norm_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if not 11 <= len(digits) <= 12:
        raise HTTPException(422, "неверный номер телефона")
    return "+" + digits


def user_out(u: User) -> dict:
    return {"id": str(u.id), "phone": u.phone, "name": u.name, "is_guest": u.is_guest, "role": u.role.value}


async def points_balance(s: AsyncSession, user_id) -> int:
    return (await s.execute(select(func.coalesce(func.sum(PointsLedger.delta), 0))
                            .where(PointsLedger.user_id == user_id))).scalar_one()


@router.post("/auth/guest")
async def guest(s: AsyncSession = Depends(get_session)):
    """Собирать книгу можно без регистрации (A10): выдаём гостевой токен."""
    u = User(is_guest=True)
    s.add(u)
    await s.commit()
    return {"token": make_token(u), "user": user_out(u)}


@router.post("/auth/otp/request")
async def otp_request(body: PhoneIn):
    phone = norm_phone(body.phone)
    return {"sent": True, "phone": phone, **({"demo_code_hint": "код из DEMO"} if settings.demo_mode else {})}


@router.post("/auth/otp/verify")
async def otp_verify(body: VerifyIn, guest: User | None = Depends(optional_user),
                     s: AsyncSession = Depends(get_session)):
    phone = norm_phone(body.phone)
    if body.code != settings.otp_demo_code:
        raise HTTPException(400, "неверный код")
    user = (await s.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if user is None:
        if guest is not None and guest.is_guest:
            guest.phone, guest.is_guest = phone, False  # гость становится клиентом на месте
            user, guest = guest, None
        else:
            user = User(phone=phone)
            s.add(user)
            await s.flush()
    if guest is not None and guest.is_guest and guest.id != user.id:
        # черновик гостя переходит к аккаунту
        await s.execute(update(Photo).where(Photo.owner_id == guest.id).values(owner_id=user.id))
        await s.execute(update(Project).where(Project.owner_id == guest.id).values(owner_id=user.id))
        await s.delete(guest)
    await s.commit()
    return {"token": make_token(user), "user": user_out(user)}


@router.get("/me")
async def me(user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    return {**user_out(user), "points": await points_balance(s, user.id)}
