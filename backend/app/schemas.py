from datetime import date

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
