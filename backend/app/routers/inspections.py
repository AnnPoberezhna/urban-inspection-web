import shutil
from datetime import date, datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from geoalchemy2 import WKTElement
from PIL import Image as PILImage
from PIL import UnidentifiedImageError
from sqlalchemy import Select, and_, select
from sqlalchemy.orm import Session, selectinload

from app.access import get_membership
from app.analysis import analyze_image
from app.config import settings
from app.database import get_db
from app.exif import read_captured_at, read_gps
from app.models import (
    AnalysisRun,
    Damage,
    Image,
    Inspection,
    InspectionStatus,
    RunStatus,
    Site,
    User,
    Workspace,
    WorkspaceMember,
)
from app.schemas import (
    AnalysisRunOut,
    AnalysisSummary,
    DamageResult,
    ImageOut,
    ImageResult,
    InspectionCreated,
    InspectionResults,
    InspectionSummary,
    MeasurementOut,
)
from app.security import get_current_user
from app.segmentation import MODEL_VERSION

router = APIRouter(prefix="/inspections", tags=["inspections"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def _point(latitude: float, longitude: float) -> WKTElement:
    return WKTElement(f"POINT({longitude} {latitude})", srid=4326)


def _visible_to(user: User) -> Select[tuple[Inspection]]:
    """Inspections in the workspaces the user belongs to."""
    return (
        select(Inspection)
        .join(Inspection.site)
        .join(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Site.workspace_id,
                WorkspaceMember.user_id == user.id,
            ),
        )
    )


def _summary(inspection: Inspection) -> InspectionSummary:
    return InspectionSummary(
        id=inspection.id,
        site_id=inspection.site_id,
        site_name=inspection.site.name,
        workspace_id=inspection.site.workspace_id,
        created_by=inspection.created_by.email,
        inspection_date=inspection.inspection_date,
        status=inspection.status,
    )


@router.post("", response_model=InspectionCreated, status_code=status.HTTP_201_CREATED)
def create_inspection(
    site_name: Annotated[str, Form(min_length=1, max_length=255)],
    inspection_date: Annotated[date, Form()],
    files: Annotated[list[UploadFile], File(description="Aerial images (JPG, PNG, TIFF)")],
    workspace_id: Annotated[int | None, Form(description="Defaults to your personal workspace")] = None,
    latitude: Annotated[float | None, Form(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Form(ge=-180, le=180)] = None,
    flight_altitude_m: Annotated[float | None, Form(gt=0)] = None,
    scale_mm_per_px: Annotated[float | None, Form(gt=0)] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload images with metadata. GPS is read from each image's EXIF; form GPS is the fallback.

    The site is looked up by name in the workspace and created if it is new. A new site is placed at
    the form GPS, or else at the first geotagged image.
    """
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Provide both latitude and longitude, or neither",
        )

    if workspace_id is None:
        workspace_id = db.scalar(
            select(Workspace.id).where(Workspace.created_by_id == user.id, Workspace.is_personal)
        )
    get_membership(db, user, workspace_id)

    site = db.scalar(select(Site).where(Site.workspace_id == workspace_id, Site.name == site_name))
    is_new_site = site is None
    if is_new_site:
        site = Site(name=site_name, workspace_id=workspace_id, created_by=user)
        if latitude is not None:
            site.location = _point(latitude, longitude)

    inspection = Inspection(site=site, created_by=user, inspection_date=inspection_date)
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
                    captured_at = read_captured_at(picture)
            except UnidentifiedImageError:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, f"Not a valid image: {upload.filename}"
                )

            filename = f"{uuid4().hex}{extension}"
            (target_dir / filename).write_bytes(data)

            if exif_latitude is not None:
                image_latitude, image_longitude = exif_latitude, exif_longitude
                if is_new_site and site.location is None:
                    site.location = _point(exif_latitude, exif_longitude)
            else:
                image_latitude, image_longitude = latitude, longitude

            inspection.images.append(
                Image(
                    file_path=f"{target_dir.name}/{filename}",
                    latitude=image_latitude,
                    longitude=image_longitude,
                    flight_altitude_m=flight_altitude_m,
                    scale_mm_per_px=scale_mm_per_px,
                    captured_at=captured_at,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        shutil.rmtree(target_dir, ignore_errors=True)
        raise

    db.refresh(inspection)
    return InspectionCreated(
        **_summary(inspection).model_dump(),
        images=[ImageOut.model_validate(image) for image in inspection.images],
    )


@router.get("", response_model=list[InspectionSummary])
def list_inspections(
    workspace_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inspections in all my workspaces, newest first. Pass workspace_id to see only one workspace."""
    query = (
        _visible_to(user)
        .options(selectinload(Inspection.site), selectinload(Inspection.created_by))
        .order_by(Inspection.created_at.desc(), Inspection.id.desc())
    )
    if workspace_id is not None:
        get_membership(db, user, workspace_id)
        query = query.where(Site.workspace_id == workspace_id)
    return [_summary(inspection) for inspection in db.scalars(query)]


def _get_inspection(db: Session, inspection_id: int, user: User) -> Inspection:
    """Load an inspection from one of the user's workspaces. 404 otherwise, so other people's IDs stay hidden."""
    inspection = db.scalar(
        _visible_to(user)
        .where(Inspection.id == inspection_id)
        .options(
            selectinload(Inspection.site),
            selectinload(Inspection.created_by),
            selectinload(Inspection.analysis_runs),
            selectinload(Inspection.images)
            .selectinload(Image.damages)
            .selectinload(Damage.measurements),
        )
    )
    if inspection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Inspection {inspection_id} not found")
    return inspection


@router.post("/{inspection_id}/analyze", response_model=AnalysisSummary)
def analyze_inspection(
    inspection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Run crack detection and measurement on every image. Each run is kept; results show the latest."""
    inspection = _get_inspection(db, inspection_id, user)
    if inspection.status == InspectionStatus.processing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Analysis is already running")

    run = AnalysisRun(model_version=MODEL_VERSION)
    inspection.analysis_runs.append(run)
    inspection.status = InspectionStatus.processing
    # Committed first so that run.id exists for the result file names.
    db.commit()

    damages_found = 0
    try:
        for image in inspection.images:
            damage = analyze_image(image, run)
            if damage is not None:
                image.damages.append(damage)
                damages_found += 1
        run.status = RunStatus.completed
        run.finished_at = datetime.now(timezone.utc)
        inspection.status = InspectionStatus.completed
        db.commit()
    except Exception as error:
        db.rollback()
        run.status = RunStatus.failed
        run.finished_at = datetime.now(timezone.utc)
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
def get_results(
    inspection_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The inspection with the damages found by its latest completed analysis run."""
    inspection = _get_inspection(db, inspection_id, user)
    run = next(
        (run for run in reversed(inspection.analysis_runs) if run.status == RunStatus.completed),
        None,
    )

    def file_url(relative_path: str) -> str:
        return str(request.url_for("files", path=relative_path))

    return InspectionResults(
        **_summary(inspection).model_dump(),
        analysis_run=AnalysisRunOut.model_validate(run) if run else None,
        images=[
            ImageResult(
                id=image.id,
                latitude=image.latitude,
                longitude=image.longitude,
                captured_at=image.captured_at,
                original_url=file_url(image.file_path),
                damages=[
                    DamageResult(
                        id=damage.id,
                        confidence=damage.confidence,
                        bbox_x=damage.bbox_x,
                        bbox_y=damage.bbox_y,
                        bbox_w=damage.bbox_w,
                        bbox_h=damage.bbox_h,
                        mask_url=file_url(damage.mask_path),
                        overlay_url=file_url(damage.overlay_path),
                        measurements=[
                            MeasurementOut.model_validate(measurement)
                            for measurement in damage.measurements
                        ],
                    )
                    for damage in image.damages
                    if run is not None and damage.analysis_run_id == run.id
                ],
            )
            for image in inspection.images
        ],
    )
