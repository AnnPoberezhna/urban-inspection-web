import enum
from datetime import date, datetime

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import Computed, Date, DateTime, Enum, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InspectionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(primary_key=True)
    object_name: Mapped[str] = mapped_column(String(255))
    inspection_date: Mapped[date] = mapped_column(Date)
    status: Mapped[InspectionStatus] = mapped_column(
        Enum(InspectionStatus, name="inspection_status", native_enum=False),
        default=InspectionStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    images: Mapped[list["Image"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan"
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

    inspection: Mapped[Inspection] = relationship(back_populates="images")
    damages: Mapped[list["Damage"]] = relationship(
        back_populates="image", cascade="all, delete-orphan"
    )


class Damage(Base):
    __tablename__ = "damages"

    id: Mapped[int] = mapped_column(primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), index=True)
    mask_path: Mapped[str] = mapped_column(String(1024))
    overlay_path: Mapped[str] = mapped_column(String(1024))
    confidence: Mapped[float] = mapped_column(Float)

    image: Mapped[Image] = relationship(back_populates="damages")
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
