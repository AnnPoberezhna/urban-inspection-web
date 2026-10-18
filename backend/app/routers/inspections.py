import shutil
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from PIL import Image as PILImage
from PIL import UnidentifiedImageError
from sqlalchemy.orm import Session, selectinload

from app.analysis import analyze_image
from app.config import settings
from app.database import get_db
from app.exif import read_gps
from app.models import Damage, Image, Inspection, InspectionStatus
from app.schemas import (
    AnalysisSummary,
    DamageResult,
    ImageResult,
    InspectionCreated,
    InspectionResults,
    MeasurementOut,
)

router = APIRouter(prefix="/inspections", tags=["inspections"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


@router.post("", response_model=InspectionCreated, status_code=status.HTTP_201_CREATED)
def create_inspection(
    object_name: Annotated[str, Form(min_length=1, max_length=255)],
    inspection_date: Annotated[date, Form()],
    files: Annotated[list[UploadFile], File(description="Aerial images (JPG, PNG, TIFF)")],
    latitude: Annotated[float | None, Form(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Form(ge=-180, le=180)] = None,
    flight_altitude_m: Annotated[float | None, Form(gt=0)] = None,
    scale_mm_per_px: Annotated[float | None, Form(gt=0)] = None,
    db: Session = Depends(get_db),
):
    """Upload images with metadata. GPS is read from each image's EXIF; form GPS is the fallback."""
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Provide both latitude and longitude, or neither",
        )

    inspection = Inspection(object_name=object_name, inspection_date=inspection_date)
    db.add(inspection)
    db.flush()

    target_dir = settings.upload_dir / f"inspection_{inspection.id}"
    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        for upload in files:
            extension = Path(upload.filename or "").suffix.lower()
            if extension not in ALLOWED_EXTENSIONS:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, f"Unsupported file type: {upload.filename}"
                )

            data = upload.file.read()
            try:
                with PILImage.open(BytesIO(data)) as picture:
                    exif_latitude, exif_longitude = read_gps(picture)
            except UnidentifiedImageError:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, f"Not a valid image: {upload.filename}"
                )

            filename = f"{uuid4().hex}{extension}"
            (target_dir / filename).write_bytes(data)

            if exif_latitude is not None:
                image_latitude, image_longitude = exif_latitude, exif_longitude
            else:
                image_latitude, image_longitude = latitude, longitude

            inspection.images.append(
                Image(
                    file_path=f"{target_dir.name}/{filename}",
                    latitude=image_latitude,
                    longitude=image_longitude,
                    flight_altitude_m=flight_altitude_m,
                    scale_mm_per_px=scale_mm_per_px,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        shutil.rmtree(target_dir, ignore_errors=True)
        raise

    db.refresh(inspection)
    return inspection


def _get_inspection(db: Session, inspection_id: int) -> Inspection:
    inspection = db.get(
        Inspection,
        inspection_id,
        options=[
            selectinload(Inspection.images)
            .selectinload(Image.damages)
            .selectinload(Damage.measurements)
        ],
    )
    if inspection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Inspection {inspection_id} not found")
    return inspection


@router.post("/{inspection_id}/analyze", response_model=AnalysisSummary)
def analyze_inspection(inspection_id: int, db: Session = Depends(get_db)):
    """Run crack detection and measurement on every image. Re-running replaces previous results."""
    inspection = _get_inspection(db, inspection_id)
    if inspection.status == InspectionStatus.processing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Analysis is already running")

    inspection.status = InspectionStatus.processing
    for image in inspection.images:
        image.damages.clear()
    db.commit()

    damages_found = 0
    try:
        for image in inspection.images:
            damage = analyze_image(image)
            if damage is not None:
                image.damages.append(damage)
                damages_found += 1
        inspection.status = InspectionStatus.completed
        db.commit()
    except Exception as error:
        db.rollback()
        inspection.status = InspectionStatus.failed
        db.commit()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"Analysis failed: {error}"
        ) from error

    return AnalysisSummary(
        id=inspection.id,
        status=inspection.status,
        images_analyzed=len(inspection.images),
        damages_found=damages_found,
    )


@router.get("/{inspection_id}/results", response_model=InspectionResults)
def get_results(inspection_id: int, request: Request, db: Session = Depends(get_db)):
    inspection = _get_inspection(db, inspection_id)

    def file_url(relative_path: str) -> str:
        return str(request.url_for("files", path=relative_path))

    return InspectionResults(
        id=inspection.id,
        object_name=inspection.object_name,
        inspection_date=inspection.inspection_date,
        status=inspection.status,
        images=[
            ImageResult(
                id=image.id,
                latitude=image.latitude,
                longitude=image.longitude,
                original_url=file_url(image.file_path),
                damages=[
                    DamageResult(
                        id=damage.id,
                        confidence=damage.confidence,
                        mask_url=file_url(damage.mask_path),
                        overlay_url=file_url(damage.overlay_path),
                        measurements=[
                            MeasurementOut.model_validate(measurement)
                            for measurement in damage.measurements
                        ],
                    )
                    for damage in image.damages
                ],
            )
            for image in inspection.images
        ],
    )
