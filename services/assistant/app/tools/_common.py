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
    "defects": dict(name="mart_defects_weekly", kind="витрина", detail="брак по линиям, сменам, операторам, поставщикам"),
    "finance": dict(name="mart_margin_weekly", kind="витрина", detail="выручка, себестоимость, скидки"),
    "hr": dict(name="mart_staffing_weekly", kind="витрина", detail="укомплектованность, переработка (только руководитель)"),
    "clients": dict(name="mart_clients_weekly", kind="витрина", detail="клиенты, повторные заказы, претензии"),
    "tasks": dict(name="реестр задач", kind="система", detail="задачи, ответственные, сроки"),
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
