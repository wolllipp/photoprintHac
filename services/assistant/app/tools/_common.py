from __future__ import annotations

import re
import uuid
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "out"
OUT.mkdir(exist_ok=True)
INK, ACC, MUTE, BAD = "#1d1d1b", "#e8a900", "#8a8a85", "#c0392b"  # жёлтый, чёрный, белый — цвета компании

SRC = {
    "defects": dict(name="Брак по неделям", kind="данные производства", detail="по линиям, сменам, поставщикам"),
    "finance": dict(name="Выручка и маржа по неделям", kind="данные производства", detail="выручка, себестоимость, скидки"),
    "hr": dict(name="Персонал по неделям", kind="данные производства", detail="укомплектованность, переработка (только руководитель)"),
    "clients": dict(name="Клиенты по неделям", kind="данные производства", detail="повторные заказы, претензии"),
    "tasks": dict(name="Задачи", kind="CRM", detail="ответственные, сроки"),
}


def slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-")[:30] or "file"


def new_name(stem: str, ext: str) -> str:
    return f"{slug(stem)}-{uuid.uuid4().hex[:6]}.{ext}"


def fig_to_artifact(fig, title: str) -> dict:
    name = new_name("chart", "png")
    fig.savefig(OUT / name, dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return dict(kind="image", name=name, url=f"/files/{name}", title=title)


def file_artifact(name: str, title: str) -> dict:
    return dict(kind="file", name=name, url=f"/files/{name}", title=title)


def style(ax, title, ylabel=""):
    ax.set_title(title, loc="left", fontsize=12, color=INK, fontweight="bold")
    ax.set_ylabel(ylabel, color=MUTE)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.grid(axis="y", alpha=.25)
