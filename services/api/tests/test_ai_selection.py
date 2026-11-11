import io
import uuid

import numpy as np
from PIL import Image

from app.ai import select_photos


def photo(photo_id, path):
    return {"photo_id": photo_id, "path": str(path), "width": 1205, "height": 1795,
            "sharpness": 100, "faces": [], "taken_at": None}


def test_select_photos_reports_exact_duplicates_as_similar_and_capacity(tmp_path):
    first, duplicate, unique, capacity = (uuid.UUID(int=n) for n in (1, 2, 3, 4))
    same_a, same_b, other, extra = (tmp_path / name for name in ("a.png", "b.png", "c.png", "d.png"))
    same_a.write_bytes(b"identical image bytes")
    same_b.write_bytes(b"identical image bytes")
    other.write_bytes(b"different image bytes")
    extra.write_bytes(b"one more different image")

    result = select_photos(
        [photo(first, same_a), photo(duplicate, same_b), photo(unique, other), photo(capacity, extra)], pages=1
    )

    by_id = {item["photo_id"]: item for item in result}
    duplicate_results = [by_id[first], by_id[duplicate]]
    assert sum(item["reject_reason"] == "similar" for item in duplicate_results) == 1
    assert sum(item["selected"] for item in duplicate_results) == 1
    assert sorted(item["reject_reason"] for item in result if not item["selected"]) == ["capacity", "similar"]
    assert all(item["reject_reason"] not in {"blurry", "screenshot"} for item in result)


def test_manual_exclusion_does_not_consume_capacity_or_duplicate_representative(tmp_path):
    excluded, alternate, unique = (uuid.UUID(int=n) for n in (11, 12, 13))
    duplicate_a, duplicate_b, other = (tmp_path / f"{n}.bin" for n in range(3))
    duplicate_a.write_bytes(b"same")
    duplicate_b.write_bytes(b"same")
    other.write_bytes(b"different")

    result = select_photos(
        [photo(excluded, duplicate_a), photo(alternate, duplicate_b), photo(unique, other)],
        pages=1,
        excluded_ids={excluded},
    )

    by_id = {item["photo_id"]: item for item in result}
    assert by_id[excluded] == {"photo_id": excluded, "selected": False, "reject_reason": None}
    assert by_id[alternate]["selected"] is True
    assert by_id[alternate]["reject_reason"] is None
    assert sum(item["selected"] for item in result) == 2


def test_manual_include_is_preferred_duplicate_representative(tmp_path):
    ordinary, included = uuid.UUID(int=21), uuid.UUID(int=22)
    a, b = tmp_path / "a", tmp_path / "b"
    a.write_bytes(b"same")
    b.write_bytes(b"same")

    result = select_photos([photo(ordinary, a), photo(included, b)], pages=1, included_ids={included})

    by_id = {item["photo_id"]: item for item in result}
    assert by_id[included]["selected"] is True
    assert by_id[included]["reject_reason"] is None
    assert by_id[ordinary]["reject_reason"] == "similar"


def test_dhash_groups_near_duplicates_and_keeps_the_sharpest(tmp_path):
    base = np.tile(np.arange(9, dtype=np.uint8) * 20, (8, 1))
    changed = np.clip(base + 2, 0, 255).astype(np.uint8)
    paths = [tmp_path / "base.png", tmp_path / "changed.png"]
    for path, image in zip(paths, (base, changed)):
        buffer = io.BytesIO()
        Image.fromarray(image).save(buffer, "PNG")
        path.write_bytes(buffer.getvalue())
    less_sharp, sharpest = uuid.UUID(int=31), uuid.UUID(int=32)

    result = select_photos([
        {**photo(less_sharp, paths[0]), "sharpness": 80},
        {**photo(sharpest, paths[1]), "sharpness": 500},
    ], pages=1)

    by_id = {row["photo_id"]: row for row in result}
    assert by_id[sharpest]["selected"] is True
    assert by_id[less_sharp]["selected"] is False
    assert by_id[less_sharp]["reject_reason"] == "similar"
