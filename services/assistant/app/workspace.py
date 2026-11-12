"""Рабочая папка чата: файлы живут между ответами, поэтому график из одного шага попадает в презентацию другого,
а «добавь слайдов» открывает прежний файл. Один чат — одна папка."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from .tools._common import OUT

ROOT = OUT / "ws"
ROOT.mkdir(exist_ok=True)
KIND = {".png": "image", ".jpg": "image", ".jpeg": "image", ".svg": "image"}


def path(session: str) -> Path:
    p = ROOT / (re.sub(r"[^a-zA-Z0-9_-]", "", session or "")[:40] or "default")
    p.mkdir(exist_ok=True)
    return p


def adopt(session: str, art: dict) -> None:
    """Файл, который создал готовый инструмент, кладём в папку чата, чтобы с ним мог работать код."""
    src = OUT / art["name"]
    if src.exists():
        shutil.copy2(src, path(session) / art["name"])


def artifact(session: str, name: str, title: str = "") -> dict:
    sid = path(session).name
    kind = KIND.get(Path(name).suffix.lower(), "file")
    return dict(kind=kind, name=name, url=f"/files/ws/{sid}/{name}", title=title or name)


def snapshot(session: str) -> dict[str, float]:
    return {f.name: f.stat().st_mtime_ns for f in path(session).iterdir() if f.is_file()}


def changed(session: str, before: dict[str, float]) -> list[str]:
    now = snapshot(session)
    return sorted(n for n, t in now.items() if before.get(n) != t)


def listing(session: str) -> list[dict]:
    return [dict(name=f.name, size_kb=round(f.stat().st_size / 1024, 1)) for f in sorted(path(session).iterdir()) if f.is_file()]


def read_text(session: str, name: str, limit: int = 6000) -> str:
    """Текст файла для модели: слайды pptx, абзацы docx, ячейки xlsx, сырой текст csv/txt/md."""
    f = (path(session) / Path(name).name)
    if not f.is_file():
        raise FileNotFoundError(f"файла «{name}» нет в рабочей папке")
    ext = f.suffix.lower()
    if ext == ".pptx":
        from pptx import Presentation
        out = []
        for i, s in enumerate(Presentation(f).slides, 1):
            parts = []
            for sh in s.shapes:
                if sh.has_text_frame and sh.text_frame.text.strip():
                    parts.append(sh.text_frame.text.strip().replace("\n", " | "))
                elif sh.shape_type == 13:
                    parts.append("[картинка]")
            out.append(f"Слайд {i}: " + " ; ".join(parts))
        text = "\n".join(out)
    elif ext == ".docx":
        from docx import Document
        text = "\n".join(p.text for p in Document(f).paragraphs if p.text.strip())
    elif ext == ".xlsx":
        from openpyxl import load_workbook
        wb = load_workbook(f, data_only=True)
        text = "\n".join(f"[{ws.title}] " + " | ".join(str(c) for c in r) for ws in wb for r in ws.iter_rows(values_only=True, max_row=40))
    elif ext in (".png", ".jpg", ".jpeg", ".svg"):
        return "изображение (текста нет)"
    else:
        text = f.read_text(encoding="utf-8", errors="replace")
    return text[:limit]

