from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class CrackMeasurement:
    length_px: float
    width_px: float
    length_mm: float | None
    width_mm: float | None


def _skeleton_length(skeleton: np.ndarray) -> float:
    """Length of a 1-px skeleton.

    Counting pixel steps overestimates oblique lines by up to ~20% (staircase effect), so the
    skeleton outline is simplified to a polyline with 1 px tolerance instead. The outline goes
    around each branch on both sides, hence the division by 2.
    """
    contours, _ = cv2.findContours(
        skeleton.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE
    )
    perimeter = sum(
        cv2.arcLength(cv2.approxPolyDP(contour, 1.0, closed=True), closed=True)
        for contour in contours
    )
    return perimeter / 2


def measure(mask: np.ndarray, scale_mm_per_px: float | None = None) -> CrackMeasurement:
    """Crack length from the skeleton, maximum width from the distance transform along the skeleton."""
    binary = np.where(mask > 0, 255, 0).astype(np.uint8)
    if not binary.any():
        return CrackMeasurement(0.0, 0.0, 0.0 if scale_mm_per_px else None, 0.0 if scale_mm_per_px else None)

    # Background border so cracks touching the image edge still get a correct distance.
    binary = cv2.copyMakeBorder(binary, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)

    skeleton = cv2.ximgproc.thinning(binary, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN) > 0
    length_px = _skeleton_length(skeleton)

    # Distance from a skeleton pixel to the nearest background pixel is about half the crack width.
    distance = cv2.distanceTransform(binary, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    width_px = float(max(2 * distance[skeleton].max() - 1, 1))

    if scale_mm_per_px is None:
        return CrackMeasurement(length_px, width_px, None, None)
    return CrackMeasurement(
        length_px, width_px, length_px * scale_mm_per_px, width_px * scale_mm_per_px
    )
