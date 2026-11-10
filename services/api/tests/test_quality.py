import io

import numpy as np
from PIL import Image, ImageFilter

from app.ai.quality import DPI_LIMITS, analyze_image, crop_rect, quality_report
from app.ai.quality import page_aspect_for_format
from app import db
from app.models import Photo
from tests.conftest import png


def test_quality_report_flags_resolution_and_blur():
    photo = Photo(width=600, height=900, sharpness=0.01, faces=[])

    report = quality_report(photo, DPI_LIMITS["10x15"])

    assert report["ok"] is False
    assert {warning["code"] for warning in report["warnings"]} == {"low_res", "blur"}


def test_quality_report_accepts_the_same_resolution_in_landscape_orientation():
    photo = Photo(width=1795, height=1205, sharpness=500, faces=[])

    report = quality_report(photo, DPI_LIMITS["10x15"])

    assert "low_res" not in {warning["code"] for warning in report["warnings"]}


def test_page_crop_uses_single_page_aspect_not_spread_aspect():
    assert page_aspect_for_format("20x20") == 1
    assert page_aspect_for_format("21x30") == 0.7


def test_crop_shifts_to_keep_face_inside_frame():
    crop = crop_rect(2000, 1000, [{"x": 0.78, "y": 0.2, "w": 0.1, "h": 0.3}], 1, 30, 60)

    assert crop["x"] > 0.4
    assert crop["x"] + crop["w"] >= 0.88
    assert 0 <= crop["x"] <= 1 and 0 <= crop["y"] <= 1
    assert crop["x"] + crop["w"] <= 1 and crop["y"] + crop["h"] <= 1


def test_crop_reports_face_that_cannot_fit_in_frame():
    crop = crop_rect(2000, 1000, [{"x": 0.45, "y": 0.2, "w": 0.1, "h": 0.3}], 0.25, 30, 60)

    assert crop["warning"] == "face_edge"


def test_sharpness_is_higher_for_sharp_image_than_blurred_image():
    pixels = ((np.indices((256, 256)).sum(axis=0) % 2) * 255).astype(np.uint8)
    sharp = Image.fromarray(pixels)
    blurred = sharp.filter(ImageFilter.GaussianBlur(radius=8))

    def encoded(image):
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    sharpness, faces = analyze_image(encoded(sharp))
    blurry_sharpness, _ = analyze_image(encoded(blurred))

    assert sharpness > blurry_sharpness
    assert isinstance(faces, list)


def test_face_cascade_can_be_loaded():
    from app.ai.quality import face_cascade

    assert not face_cascade().empty()


async def test_upload_persists_quality_metrics(client):
    token = (await client.post("/auth/guest")).json()["token"]
    response = await client.post("/photos", headers={"Authorization": f"Bearer {token}"},
                                 files=[("files", ("sample.png", png(), "image/png"))])
    photo_id = response.json()[0]["id"]

    async with db.SessionLocal() as session:
        photo = await session.get(Photo, photo_id)

    assert photo.sharpness is not None
    assert photo.faces is not None
