import io

import numpy as np
from PIL import Image, ImageFilter

from app.ai.quality import (DPI_LIMITS, WARNING_TEXT, analyze_image, crop_rect, difference_hash,
                            dhash_distance, effective_dpi, is_screenshot, quality_report)
from app.ai.quality import page_aspect_for_format
from app import db
from app.models import Photo
from tests.conftest import png


def test_effective_dpi_uses_the_frame_after_crop_not_the_whole_spread():
    image = {"width": 2000, "height": 1000, "sharpness": 500, "faces": []}
    full_spread = effective_dpi(2000, 1000, "20x20", {"w": 1, "h": 1})
    quarter_frame = effective_dpi(2000, 1000, "20x20", {"w": 0.5, "h": 0.5})
    cropped = effective_dpi(2000, 1000, "20x20", {"w": 0.5, "h": 0.5}, {"x": 0, "y": 0, "w": 0.5, "h": 1})

    assert full_spread < quarter_frame
    assert cropped < quarter_frame
    report = quality_report(image, format="20x20", frame={"w": 0.5, "h": 0.5})
    assert report["effective_dpi"] == round(quarter_frame, 1)
    assert report["quality_level"] == "good"


def test_dpi_quality_levels_and_confirmation_threshold():
    frame = {"w": 0.5, "h": 1}
    for dpi, expected, confirmation in ((300, "good", False), (200, "acceptable", False),
                                        (125, "poor", False), (80, "very_poor", True)):
        px = round(20 / 2.54 * dpi)
        report = quality_report({"width": px, "height": px, "sharpness": 500, "faces": []},
                                format="20x20", frame=frame)
        assert report["quality_level"] == expected
        assert report["requires_confirmation"] is confirmation
        assert report["effective_dpi"] == round(dpi, 1)


def test_photoprint_formats_use_physical_dimensions_including_30x45():
    for format, pixels in (("10x15", (984, 1476)), ("15x20", (1476, 1969)),
                           ("20x30", (1969, 2953)), ("30x45", (2953, 4429))):
        dpi = effective_dpi(pixels[0], pixels[1], format, book=False)
        assert dpi is not None and abs(dpi - 250) < 0.2


def test_quality_warning_copy_matches_the_threshold_note():
    assert WARNING_TEXT["low_res"] == "Фото может быть чуть мягче остальных"
    assert WARNING_TEXT["low_res_poor"] == "Фото будет заметно размытым в этой рамке. Поставьте его в рамку поменьше"
    assert WARNING_TEXT["low_res_very_poor"] == "Слишком мало пикселей для такого размера. Замените фото или уменьшите рамку"
    assert WARNING_TEXT["screenshot"] == "Похоже на скриншот — оставить в книге?"


def test_page_crop_uses_single_page_aspect_not_spread_aspect():
    assert page_aspect_for_format("20x20") == 1
    assert page_aspect_for_format("21x30") == 0.7
    assert DPI_LIMITS["15x20"]
    assert DPI_LIMITS["20x30"]
    assert DPI_LIMITS["30x45"]


def test_crop_shifts_to_keep_expanded_head_inside_frame():
    crop = crop_rect(2000, 1000, [{"x": 0.78, "y": 0.2, "w": 0.1, "h": 0.3}], 1, dpi=254)

    assert crop["x"] > 0.4
    assert crop["x"] + crop["w"] >= 0.88
    assert 0 <= crop["x"] <= 1 and 0 <= crop["y"] <= 1
    assert crop["x"] + crop["w"] <= 1 and crop["y"] + crop["h"] <= 1


def test_face_edge_margin_is_measured_in_print_millimeters_at_effective_dpi():
    safe = {"width": 2000, "height": 2000, "sharpness": 500,
            "faces": [{"x": 0.05, "y": 0.3, "w": 0.1, "h": 0.2}]}
    risky = {**safe, "faces": [{"x": 0.039, "y": 0.3, "w": 0.1, "h": 0.2}]}
    frame = {"x": 0, "y": 0, "w": 0.5, "h": 1}

    assert "face_edge" not in {w["code"] for w in quality_report(safe, format="20x20", frame=frame)["warnings"]}
    assert "face_edge" in {w["code"] for w in quality_report(risky, format="20x20", frame=frame)["warnings"]}


def test_only_lite_face_crossing_center_gutter_warns():
    """Шов по центру разворота — только у Lite; Classic и Premium раскрываются без шва."""
    photo = {"width": 2000, "height": 1000, "sharpness": 500,
             "faces": [{"x": 0.4, "y": 0.3, "w": 0.2, "h": 0.3}]}
    frame = {"x": 0, "y": 0, "w": 1, "h": 1}

    codes = {p: {w["code"] for w in quality_report(photo, format="20x20", frame=frame, product=p)["warnings"]}
             for p in ("lite", "classic", "premium")}
    assert "gutter" in codes["lite"]
    assert "gutter" not in codes["classic"] and "gutter" not in codes["premium"]


def test_crop_rect_accepts_legacy_px_arguments_and_reports_unfit_face():
    crop = crop_rect(2000, 1000, [{"x": 0.45, "y": 0.2, "w": 0.1, "h": 0.3}], 0.25, 30, 60)
    assert crop["warning"] == "face_edge"


def test_sharpness_is_higher_for_sharp_image_than_blurred_image_at_1024_scale():
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


def test_dhash_distance_compares_visual_similarity():
    base = np.tile(np.arange(9, dtype=np.uint8) * 20, (8, 1))
    slightly_changed = np.clip(base + 2, 0, 255).astype(np.uint8)

    def encoded(array):
        buffer = io.BytesIO()
        Image.fromarray(array).save(buffer, "PNG")
        return buffer.getvalue()

    assert dhash_distance(difference_hash(encoded(base)), difference_hash(encoded(slightly_changed))) <= 8


def test_screenshot_detection_requires_phone_ratio_and_no_camera_exif():
    screenshot = Image.new("RGB", (1170, 2532), "white")
    buffer = io.BytesIO()
    screenshot.save(buffer, "PNG")
    assert is_screenshot(buffer.getvalue())
    camera_exif = Image.Exif()
    camera_exif[271] = "picPac test camera"
    with_camera = io.BytesIO()
    screenshot.save(with_camera, "JPEG", exif=camera_exif)
    assert not is_screenshot(with_camera.getvalue())
    assert is_screenshot(width=1170, height=2532)
    assert not is_screenshot(width=1200, height=1800)
    report = quality_report({"width": 1170, "height": 2532, "sharpness": 500,
                             "faces": []}, screenshot=True)
    screenshot_warning = next(warning for warning in report["warnings"] if warning["code"] == "screenshot")
    assert screenshot_warning["text"] == "Похоже на скриншот — оставить в книге?"


def test_face_cascade_can_be_loaded():
    from app.ai.quality import face_cascade

    assert not face_cascade().empty()


async def test_upload_persists_quality_metrics_for_png_and_webp(client):
    token = (await client.post("/auth/guest")).json()["token"]
    webp = io.BytesIO()
    Image.new("RGB", (64, 48), (100, 150, 200)).save(webp, "WEBP")
    response = await client.post("/photos", headers={"Authorization": f"Bearer {token}"}, files=[
        ("files", ("sample.png", png(), "image/png")),
        ("files", ("sample.webp", webp.getvalue(), "image/webp")),
    ])
    photo_ids = [item["id"] for item in response.json()]

    async with db.SessionLocal() as session:
        photos = [await session.get(Photo, photo_id) for photo_id in photo_ids]

    assert len(photos) == 2
    assert all(photo.sharpness is not None and photo.faces is not None for photo in photos)


def test_book_page_frame_is_one_page_not_a_spread():
    # фото 1536×2048 на всю страницу 20×20 — около 195 точек на дюйм (приемлемо), а не вдвое меньше
    page = effective_dpi(1536, 2048, "20x20", {"w": 1, "h": 1}, spread=False)
    assert abs(page - 1536 / (20 / 2.54)) < 0.5
    report = quality_report({"width": 1536, "height": 2048, "sharpness": 500, "faces": []},
                            format="20x20", frame={"w": 1, "h": 1}, spread=False, product="lite")
    assert report["quality_level"] == "acceptable"
    # макет на весь разворот — рамка в долях разворота, ширина вдвое больше
    assert effective_dpi(1536, 2048, "20x20", {"w": 1, "h": 1}, spread=True) < page


def test_manual_zoom_lowers_effective_dpi():
    """Ручное увеличение кадра в приложении (z в рамке): на печать идёт меньше пикселей."""
    from app.ai.quality import effective_dpi
    base = effective_dpi(3000, 3000, "20x20", {"x": 0, "y": 0, "w": 1, "h": 1}, book=True, spread=False)
    zoomed = effective_dpi(3000, 3000, "20x20", {"x": 0, "y": 0, "w": 1, "h": 1, "cx": 0.5, "cy": 0.5, "z": 2, "a": 1},
                           book=True, spread=False)
    assert abs(zoomed - base / 2) < 0.01


def test_faces_in_parallel_threads_do_not_crash():
    """Две загрузки фото одновременно: у каждого потока свой каскад (общий ронял процесс сервера)."""
    import io as _io
    from concurrent.futures import ThreadPoolExecutor

    import numpy as _np
    from PIL import Image as _Image

    from app.ai.quality import analyze_image, face_cascade
    buf = _io.BytesIO()
    _Image.fromarray(_np.random.default_rng(1).integers(0, 256, (600, 800), dtype=_np.uint8)).save(buf, "JPEG")
    data = buf.getvalue()
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: analyze_image(data), range(24)))
    assert len(results) == 24
    assert not face_cascade().empty()
