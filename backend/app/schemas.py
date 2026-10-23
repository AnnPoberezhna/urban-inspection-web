from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import InspectionStatus, RunStatus, WorkspaceRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkspaceOut(BaseModel):
    id: int
    name: str
    is_personal: bool
    role: WorkspaceRole


class MemberAdd(BaseModel):
    email: EmailStr


class MemberOut(BaseModel):
    user_id: int
    email: str
    role: WorkspaceRole
    added_at: datetime


class SiteOut(BaseModel):
    id: int
    name: str
    latitude: float | None
    longitude: float | None


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: str
    latitude: float | None
    longitude: float | None
    flight_altitude_m: float | None
    scale_mm_per_px: float | None
    captured_at: datetime | None


class InspectionSummary(BaseModel):
    id: int
    site_id: int
    site_name: str
    workspace_id: int
    created_by: str  # email
    inspection_date: date
    status: InspectionStatus


class InspectionCreated(InspectionSummary):
    images: list[ImageOut]


class AnalysisRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: RunStatus
    model_version: str
    started_at: datetime
    finished_at: datetime | None


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
    # Bounding box of the damage mask in image pixels.
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    mask_url: str
    overlay_url: str
    measurements: list[MeasurementOut]


class ImageResult(BaseModel):
    id: int
    latitude: float | None
    longitude: float | None
    captured_at: datetime | None
    original_url: str
    damages: list[DamageResult]


class InspectionResults(InspectionSummary):
    analysis_run: AnalysisRunOut | None  # the latest completed run; None before the first one
    images: list[ImageResult]
