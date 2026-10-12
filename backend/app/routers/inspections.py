import shutil
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image as PILImage
from PIL import UnidentifiedImageError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.exif import read_gps
from app.models import Image, Inspection
from app.schemas import InspectionCreated

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
    """Upload images with metadata. Form GPS applies to all images; otherwise GPS is read from EXIF."""
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

            if latitude is not None:
                image_latitude, image_longitude = latitude, longitude
            else:
                image_latitude, image_longitude = exif_latitude, exif_longitude

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
