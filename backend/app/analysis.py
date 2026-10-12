from pathlib import PurePosixPath

import cv2
import numpy as np

from app.config import settings
from app.measurement import measure
from app.models import Damage, Image, Measurement
from app.segmentation import segment

OVERLAY_COLOR = (0, 0, 255)  # BGR
OVERLAY_OPACITY = 0.6


def _overlay(picture: np.ndarray, mask: np.ndarray) -> np.ndarray:
    colored = picture.copy()
    colored[mask > 0] = OVERLAY_COLOR
    return cv2.addWeighted(colored, OVERLAY_OPACITY, picture, 1 - OVERLAY_OPACITY, 0)


def _write(relative_path: str, picture: np.ndarray) -> None:
    if not cv2.imwrite(str(settings.upload_dir / relative_path), picture):
        raise OSError(f"Cannot write {relative_path}")


def analyze_image(image: Image) -> Damage | None:
    """Segment one image, save its mask and overlay, and measure the crack. None if nothing was found."""
    picture = cv2.imread(str(settings.upload_dir / image.file_path), cv2.IMREAD_COLOR)
    if picture is None:
        raise ValueError(f"Cannot read image {image.file_path}")

    result = segment(picture)
    if not result.mask.any():
        return None

    stem = PurePosixPath(image.file_path).with_suffix("")
    mask_path = f"{stem}_mask.png"
    overlay_path = f"{stem}_overlay.jpg"
    _write(mask_path, result.mask)
    _write(overlay_path, _overlay(picture, result.mask))

    size = measure(result.mask, image.scale_mm_per_px)
    return Damage(
        mask_path=mask_path,
        overlay_path=overlay_path,
        confidence=result.confidence,
        measurements=[
            Measurement(
                length_px=size.length_px,
                width_px=size.width_px,
                length_mm=size.length_mm,
                width_mm=size.width_mm,
            )
        ],
    )
