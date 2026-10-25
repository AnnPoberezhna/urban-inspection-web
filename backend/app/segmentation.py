from dataclasses import dataclass

import cv2
import numpy as np

# Saved on every analysis run; change it whenever the model or its weights change.
MODEL_VERSION = "mock-unet-0.1"


@dataclass
class SegmentationResult:
    mask: np.ndarray  # uint8, same height and width as the input; 0 = background, 255 = crack
    confidence: float


def segment(image: np.ndarray, rng: np.random.Generator | None = None) -> SegmentationResult:
    """Mock of the U-Net: draws one jagged white crack at a random position on a black mask."""
    rng = rng or np.random.default_rng()
    height, width = image.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)

    step = max(3, min(height, width) // 100)
    heading = rng.uniform(0, 2 * np.pi)
    x = rng.uniform(0.2, 0.8) * width
    y = rng.uniform(0.2, 0.8) * height
    points = [(x, y)]
    for _ in range(int(rng.integers(40, 120))):
        heading += rng.normal(0, 0.08)
        angle = heading + rng.normal(0, 0.7)
        x += step * np.cos(angle)
        y += step * np.sin(angle)
        if not (0 <= x < width and 0 <= y < height):
            break
        points.append((x, y))

    thickness = int(rng.integers(2, 8))
    polyline = np.round(points).astype(np.int32).reshape(-1, 1, 2)
    cv2.polylines(mask, [polyline], isClosed=False, color=255, thickness=thickness)

    return SegmentationResult(mask=mask, confidence=float(rng.uniform(0.75, 0.98)))
