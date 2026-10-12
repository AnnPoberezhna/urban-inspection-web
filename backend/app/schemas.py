from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models import InspectionStatus


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: str
    latitude: float | None
    longitude: float | None
    flight_altitude_m: float | None
    scale_mm_per_px: float | None


class InspectionCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    object_name: str
    inspection_date: date
    status: InspectionStatus
    images: list[ImageOut]


class AnalysisSummary(BaseModel):
    id: int
    status: InspectionStatus
    images_analyzed: int
    damages_found: int


class MeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    length_px: float
    width_px: float
    length_mm: float | None
    width_mm: float | None
    measured_at: datetime


class DamageResult(BaseModel):
    id: int
    confidence: float
    mask_url: str
    overlay_url: str
    measurements: list[MeasurementOut]


class ImageResult(BaseModel):
    id: int
    latitude: float | None
    longitude: float | None
    original_url: str
    damages: list[DamageResult]


class InspectionResults(BaseModel):
    id: int
    object_name: str
    inspection_date: date
    status: InspectionStatus
    images: list[ImageResult]
