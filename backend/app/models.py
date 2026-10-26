import enum
from datetime import date, datetime

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    Boolean,
    Computed,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored lowercase so the unique constraint is case-insensitive in practice.
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Granted only with `python -m app.make_admin`, never through the API.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Set by an admin. A blocked user can't log in, and their tokens stop working.
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    created_by: Mapped[User] = relationship()
    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    sites: Mapped[list["Site"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceRole(str, enum.Enum):
    owner = "owner"
    member = "member"


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    # workspace_id leads the primary key, so it needs no separate index.
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        Enum(WorkspaceRole, name="workspace_role", native_enum=False),
        default=WorkspaceRole.member,
    )
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workspace: Mapped[Workspace] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class Site(Base):
    __tablename__ = "sites"
    # Also serves as the index for workspace_id lookups.
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    location: Mapped[WKBElement | None] = mapped_column(Geography("POINT", srid=4326))
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    workspace: Mapped[Workspace] = relationship(back_populates="sites")
    created_by: Mapped[User] = relationship()
    inspections: Mapped[list["Inspection"]] = relationship(
        back_populates="site", cascade="all, delete-orphan"
    )


class InspectionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    inspection_date: Mapped[date] = mapped_column(Date)
    status: Mapped[InspectionStatus] = mapped_column(
        Enum(InspectionStatus, name="inspection_status", native_enum=False),
        default=InspectionStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    site: Mapped[Site] = relationship(back_populates="inspections")
    created_by: Mapped[User] = relationship()
    images: Mapped[list["Image"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan"
    )
    analysis_runs: Mapped[list["AnalysisRun"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan", order_by="AnalysisRun.id"
    )


class RunStatus(str, enum.Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_id: Mapped[int] = mapped_column(
        ForeignKey("inspections.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status", native_enum=False),
        default=RunStatus.processing,
    )
    model_version: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    inspection: Mapped[Inspection] = relationship(back_populates="analysis_runs")
    # Image.damages owns the damages; ON DELETE CASCADE removes a run's damages in the database.
    damages: Mapped[list["Damage"]] = relationship(
        back_populates="analysis_run", passive_deletes="all"
    )


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_id: Mapped[int] = mapped_column(
        ForeignKey("inspections.id", ondelete="CASCADE"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    # Derived by the database from latitude/longitude; set those instead. Geography measures distances in metres.
    location: Mapped[WKBElement | None] = mapped_column(
        Geography("POINT", srid=4326),
        Computed("ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography", persisted=True),
    )
    flight_altitude_m: Mapped[float | None] = mapped_column(Float)
    scale_mm_per_px: Mapped[float | None] = mapped_column(Float)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    inspection: Mapped[Inspection] = relationship(back_populates="images")
    damages: Mapped[list["Damage"]] = relationship(
        back_populates="image", cascade="all, delete-orphan"
    )


class Damage(Base):
    __tablename__ = "damages"

    id: Mapped[int] = mapped_column(primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), index=True)
    analysis_run_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True
    )
    mask_path: Mapped[str] = mapped_column(String(1024))
    overlay_path: Mapped[str] = mapped_column(String(1024))
    confidence: Mapped[float] = mapped_column(Float)
    # Bounding box of the damage mask in image pixels.
    bbox_x: Mapped[int] = mapped_column(Integer)
    bbox_y: Mapped[int] = mapped_column(Integer)
    bbox_w: Mapped[int] = mapped_column(Integer)
    bbox_h: Mapped[int] = mapped_column(Integer)

    image: Mapped[Image] = relationship(back_populates="damages")
    analysis_run: Mapped[AnalysisRun] = relationship(back_populates="damages")
    measurements: Mapped[list["Measurement"]] = relationship(
        back_populates="damage", cascade="all, delete-orphan"
    )


class Measurement(Base):
    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(primary_key=True)
    damage_id: Mapped[int] = mapped_column(ForeignKey("damages.id", ondelete="CASCADE"), index=True)
    length_px: Mapped[float] = mapped_column(Float)
    width_px: Mapped[float] = mapped_column(Float)
    length_mm: Mapped[float | None] = mapped_column(Float)
    width_mm: Mapped[float | None] = mapped_column(Float)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    damage: Mapped[Damage] = relationship(back_populates="measurements")
