"""ИИ в редакторе: понять замечание человека (app/ai/edit.py). Выполняет команду приложение."""
import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai.edit import parse_edit
from app.models import User
from app.security.auth import current_user

router = APIRouter(tags=["ai"])


class EditIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)


@router.post("/ai/edit")
async def ai_edit(body: EditIn, user: User = Depends(current_user)):
    """Замечание → команда: {command: {action, count, fx, text}, source: llm | rules}."""
    command, source = await asyncio.to_thread(parse_edit, body.text)
    return {"command": command, "source": source}
