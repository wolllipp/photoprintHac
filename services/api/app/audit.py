"""Журнал действий (ТЗ, ОТ-04): каждое изменяющее действие — кто, роль, когда, что, над чем, результат.

Перехватчик запросов, а не правка каждой ручки: новые ручки попадают в журнал сами.
Пишем только факт действия: тела запросов, телефоны, тексты подписей и обращений в журнал не попадают.
Пользователя берём из токена запроса, а при входе — из выданного токена; id созданного объекта — из ответа.
"""
import json
import uuid

import jwt
from starlette.requests import Request
from starlette.responses import Response

from app import db
from app.config import settings
from app.models import AuditLog

# (метод, шаблон пути) → действие и тип объекта. Не из списка — пишем как «метод путь».
ACTIONS: dict[tuple[str, str], tuple[str, str | None]] = {
    ("POST", "/auth/guest"): ("вход гостем", "user"),
    ("POST", "/auth/otp/request"): ("запрос кода входа", None),
    ("POST", "/auth/otp/verify"): ("вход по телефону", "user"),
    ("POST", "/photos"): ("загрузка фото", "photo"),
    ("POST", "/projects"): ("создание книги", "project"),
    ("POST", "/projects/story"): ("книга по описанию", "project"),
    ("POST", "/projects/{project_id}/photos"): ("фото в книгу", "project"),
    ("POST", "/projects/{project_id}/build"): ("сборка книги", "project"),
    ("POST", "/jobs/{job_id}/cancel"): ("отмена сборки", "job"),
    ("PUT", "/projects/{project_id}/pages/{position}"): ("правка страницы", "project"),
    ("PATCH", "/projects/{project_id}/selection"): ("правка отбора фото", "project"),
    ("POST", "/projects/{project_id}/chat"): ("команда ИИ", "project"),
    ("POST", "/orders"): ("заказ", "order"),
    ("POST", "/orders/{order_id}/support"): ("обращение в поддержку", "order"),
    ("POST", "/dev/orders/{order_id}/advance"): ("смена этапа заказа (демо)", "order"),
    ("POST", "/dev/points"): ("начисление пиков (демо)", "user"),
}
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def _token_claims(token: str | None) -> dict:
    if not token:
        return {}
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return {}


async def audit_middleware(request: Request, call_next):
    if request.method not in MUTATING:
        return await call_next(request)
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    action, kind = ACTIONS.get((request.method, path), (f"{request.method} {path}", None))
    # ответ — небольшой JSON: читаем его, чтобы узнать id созданного объекта и пользователя после входа
    body = b"".join([chunk async for chunk in response.body_iterator])
    data = {}
    if response.headers.get("content-type", "").startswith("application/json") and len(body) < 200_000:
        try:
            data = json.loads(body) if body else {}
        except ValueError:
            data = {}
    auth = request.headers.get("authorization", "")
    claims = _token_claims(data.get("token") if isinstance(data, dict) else None) or \
        _token_claims(auth[7:] if auth.lower().startswith("bearer ") else None)
    params = request.scope.get("path_params") or {}
    obj = next((str(v) for k, v in params.items() if k.endswith("_id")), None)
    if obj is None and isinstance(data, dict):
        user = data.get("user") if isinstance(data.get("user"), dict) else {}
        obj = data.get("id") or user.get("id")
    if obj is None and isinstance(data, list) and data and isinstance(data[0], dict):
        obj = f"{len(data)} шт."
    status = response.status_code
    result = "ok" if status < 400 else "denied" if status in (401, 403, 404, 409) else "error"
    try:
        user_id = uuid.UUID(claims["sub"]) if claims.get("sub") else None
    except ValueError:
        user_id = None
    try:
        async with db.SessionLocal() as s:
            s.add(AuditLog(user_id=user_id, role=claims.get("role"), action=action[:60], object_type=kind,
                           object_id=str(obj)[:64] if obj else None, status=status, result=result,
                           ip=request.client.host if request.client else None))
            await s.commit()
    except Exception:  # журнал не должен ломать само действие
        pass
    return Response(content=body, status_code=status, headers=dict(response.headers), media_type=response.media_type)
