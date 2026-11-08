import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import User


def make_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=settings.jwt_ttl_days)
    return jwt.encode({"sub": str(user.id), "role": user.role.value, "exp": exp}, settings.jwt_secret, "HS256")


async def _user_from_header(authorization: str | None, s: AsyncSession) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        data = jwt.decode(authorization[7:], settings.jwt_secret, algorithms=["HS256"])
        return await s.get(User, uuid.UUID(data["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


async def optional_user(authorization: str | None = Header(None), s: AsyncSession = Depends(get_session)):
    return await _user_from_header(authorization, s)


async def current_user(user: User | None = Depends(optional_user)) -> User:
    """Любой пользователь, включая гостя (черновик можно собирать без регистрации)."""
    if user is None:
        raise HTTPException(401, "нужен токен: POST /auth/guest или /auth/otp/verify")
    return user


async def registered_user(user: User = Depends(current_user)) -> User:
    if user.is_guest:
        raise HTTPException(403, "для оформления нужен вход по телефону")
    return user
