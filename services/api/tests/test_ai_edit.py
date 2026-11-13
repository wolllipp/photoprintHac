"""«ИИ: исправить»: замечание → команда. Без модели (её нет в тестах) — правила; модель подменяем."""
import pytest

from app.ai import edit
from app.ai.edit import EditCommand, parse_edit, parse_edit_rules
from tests.test_flow import auth


@pytest.mark.parametrize("text, action, extra", [
    ("поменьше", "shrink", {}),
    ("уменьши фото", "shrink", {}),
    ("сделай меньше", "shrink", {}),
    ("крупнее", "enlarge", {}),
    ("увеличь", "enlarge", {}),
    ("удали это фото", "remove_photo", {}),
    ("убери", "remove_photo", {}),
    ("замени на другое", "replace_photo", {}),
    ("три фото на странице", "set_count", {"count": 3}),
    ("пусть будет две фотки", "set_count", {"count": 2}),
    ("4 фото", "set_count", {"count": 4}),
    ("меньше людей", "fewer_people", {}),
    ("убери селфи", "fewer_people", {}),
    ("больше людей", "more_people", {}),
    ("больше пейзажей", "more_landscapes", {}),
    ("сделай ярче", "enhance", {"fx": "light"}),
    ("выровняй горизонт", "enhance", {"fx": "horizon"}),
    ("сделай чёрно-белым", "enhance", {"fx": "bw"}),
    ("Подпиши: лето у бабушки", "caption", {"text": "лето у бабушки"}),
    ("какая погода завтра", "unknown", {}),
])
def test_rules_understand_common_phrases(text, action, extra):
    cmd = parse_edit_rules(text)
    assert cmd.action == action, (text, cmd)
    for k, v in extra.items():
        assert getattr(cmd, k) == v


def test_model_answer_used_and_rules_fill_gaps(monkeypatch):
    monkeypatch.setattr(edit, "_ollama", lambda text: EditCommand(action="shrink"))
    assert parse_edit("сделай скромнее") == ({"action": "shrink", "count": None, "fx": None, "text": None}, "llm")
    # модель не поняла, а правила поняли — правила
    monkeypatch.setattr(edit, "_ollama", lambda text: EditCommand(action="unknown"))
    assert parse_edit("крупнее")[0]["action"] == "enlarge" and parse_edit("крупнее")[1] == "rules"


def test_no_model_falls_back_to_rules(monkeypatch):
    def down(text):
        raise ConnectionError("нет ollama")
    monkeypatch.setattr(edit, "_ollama", down)
    assert parse_edit("поменьше") == ({"action": "shrink", "count": None, "fx": None, "text": None}, "rules")


async def test_endpoint(client, monkeypatch):
    monkeypatch.setattr(edit, "_ollama", lambda text: EditCommand(action="set_count", count=2))
    gh = auth((await client.post("/auth/guest")).json()["token"])
    r = await client.post("/ai/edit", headers=gh, json={"text": "две фотки"})
    assert r.status_code == 200 and r.json() == {"command": {"action": "set_count", "count": 2, "fx": None, "text": None}, "source": "llm"}
