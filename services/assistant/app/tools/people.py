"""Совещания, задачи, общение с коллегами. Запись и отправка сообщений только после подтверждения."""
from __future__ import annotations

from .. import connectors, store as S
from ..registry import Proposal, Result, tool
from ._common import SRC

TASKS = [dict(t, by_assistant=False) for t in S.D["tasks"]]
MSG = connectors.messenger()  # демо-заглушка или webhook, см. app/connectors.py


@tool("prepare_meeting", "people", "Готовлю повестку совещания",
      "Повестка совещания: открытые отклонения, просроченные задачи, вопросы участникам по ролям, контекст с цифрами.",
      keywords=("совещан", "встреч", "повестк", "планёрк"))
def prepare_meeting(ctx):
    m = S.D["meeting"]
    cur, base = S.inw(S.ROWS, *S.CUR_W), S.inw(S.ROWS, *S.BASE_W)
    ctxt = m["context"].format(ricohNow=f"{S.rate(S.where(cur, line='Ricoh'))*100:.1f}%", ricohNorm=f"{S.rate(S.where(base, line='Ricoh'))*100:.1f}%")
    late = [t for t in TASKS if t["status"] == "просрочена"]
    return Result(data=dict(title=m["title"], date=S.D["meta"]["today"], context=ctxt, questions=m["questions"], overdue_tasks=late,
                            summary=f"повестка: {len(m['questions'])} вопросов, просрочено задач: {len(late)}"), sources=[SRC["defects"], SRC["tasks"]])


@tool("list_tasks", "people", "Смотрю задачи", "Список задач с ответственными, сроками и статусом; можно только просроченные.",
      {"only_overdue": {"type": "boolean"}}, keywords=("задач", "просроч", "поручен", "срок"))
def list_tasks(ctx, only_overdue=False):
    ts = [t for t in TASKS if not only_overdue or t["status"] == "просрочена"]
    return Result(data=dict(tasks=ts, summary=f"задач: {len(ts)}"), sources=[SRC["tasks"]])


@tool("propose_task", "people", "Готовлю задачу",
      "Подготовить задачу с ответственным и сроком. Создастся только после подтверждения руководителем.",
      {"title": {"type": "string"}, "owner": {"type": "string", "enum": S.D["people"]}, "due": {"type": "string", "description": "дата ГГГГ-ММ-ДД"}},
      required=["title", "owner", "due"], risk="write", keywords=("создай задач", "поручи", "назначь", "задач", "поставь"))
def propose_task(ctx, title, owner, due):
    def commit():
        t = dict(id=f"T-{208 + len(TASKS) - 2}", title=title, owner=owner, due=due, status="назначена", by_assistant=True)
        TASKS.append(t)
        return f"Задача {t['id']} создана: «{title}», {owner}, до {due}."
    return Result(data=dict(status="ждёт подтверждения человеком", summary=f"задача для {owner}"),
                  proposal=Proposal(f"Создать задачу: {title}", dict(ответственный=owner, срок=due), commit))


@tool("ask_colleague", "people", "Пишу коллеге",
      "Отправить вопрос коллеге в мессенджер и получить ответ. Отправка только после подтверждения; текст видит руководитель.",
      {"role": {"type": "string", "enum": S.D["people"]}, "question": {"type": "string"}}, required=["role", "question"], risk="external",
      keywords=("узнай у", "спроси", "уточни у", "напиши", "коллег", "начальник"))
def ask_colleague(ctx, role, question):
    def commit():
        r = MSG.send(role, question)
        if not r["delivered"]:
            return f"Не удалось отправить: {role} ({r.get('error', 'ошибка')})."
        return f"Отправлено: {role}. " + (f"Ответ: «{r['reply']}»" if r["reply"] else "Ответа пока нет, он придёт позже.")
    return Result(data=dict(status="ждёт подтверждения человеком", summary=f"сообщение для {role}"),
                  proposal=Proposal(f"Написать: {role}", dict(текст=question), commit))


@tool("poll_group", "people", "Опрашиваю группу",
      "Опросить несколько ролей одним вопросом и свести ответы. Отправка после подтверждения.",
      {"roles": {"type": "array", "items": {"type": "string", "enum": S.D["people"]}}, "question": {"type": "string"}}, required=["roles", "question"],
      risk="external", keywords=("опрос", "собери у", "соберите", "всех", "группу"))
def poll_group(ctx, roles, question):
    roles = [r for r in roles if r in S.D["people"]]
    def commit():
        out = []
        for r in roles:
            x = MSG.send(r, question)
            out.append(f"{r}: " + (x["reply"] or ("ответа пока нет" if x["delivered"] else "не доставлено")))
        return "Результат опроса:\n" + "\n".join(out)
    return Result(data=dict(status="ждёт подтверждения человеком", summary=f"опрос: {len(roles)} получателей"),
                  proposal=Proposal(f"Опросить: {', '.join(roles)}", dict(вопрос=question), commit))


@tool("meeting_protocol", "people", "Разбираю запись совещания",
      "Разобрать текст/запись совещания на решения и поручения (ответственный, срок). Руководитель подтверждает каждое.",
      {"transcript": {"type": "string", "description": "текст записи; пусто = запись из демо"}}, keywords=("протокол", "запись совещ", "итоги встречи", "расшифр"))
def meeting_protocol(ctx, transcript=""):
    text = transcript or S.D["meeting"]["transcript"]
    return Result(data=dict(transcript=text[:3500], proposals_from_demo=S.D["meeting"]["proposals"][:4],
                            instruction="Выдели решения и поручения, для каждого вызови propose_task.", summary="запись прочитана"), sources=[dict(name="запись совещания", kind="документ", detail="расшифровка Whisper")],
                  untrusted=True)
