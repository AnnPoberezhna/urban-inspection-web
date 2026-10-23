from datetime import datetime, timezone

from PIL import Image as PILImage
from PIL.ExifTags import GPS, IFD, Base


def _dms_to_degrees(dms) -> float:
    degrees, minutes, seconds = (float(value) for value in dms)
    return degrees + minutes / 60 + seconds / 3600


def read_gps(image: PILImage.Image) -> tuple[float | None, float | None]:
    """Return (latitude, longitude) from EXIF, or (None, None) if missing or malformed."""
    gps = image.getexif().get_ifd(IFD.GPSInfo)
    if GPS.GPSLatitude not in gps or GPS.GPSLongitude not in gps:
        return None, None

    try:
        latitude = _dms_to_degrees(gps[GPS.GPSLatitude])
        longitude = _dms_to_degrees(gps[GPS.GPSLongitude])
    except (TypeError, ValueError, ZeroDivisionError):
        return None, None

    if gps.get(GPS.GPSLatitudeRef) == "S":
        latitude = -latitude
    if gps.get(GPS.GPSLongitudeRef) == "W":
        longitude = -longitude

    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None, None
    return latitude, longitude


def read_captured_at(image: PILImage.Image) -> datetime | None:
    """Return when the photo was taken (EXIF DateTimeOriginal), or None if missing or malformed.

    EXIF stores local time; OffsetTimeOriginal (e.g. "+02:00") gives its zone. Without it the
    real zone is unknown, and the time is stored as UTC.
    """
    exif = image.getexif().get_ifd(IFD.Exif)
    value = exif.get(Base.DateTimeOriginal)
    if not isinstance(value, str):
        return None

    try:
        captured_at = datetime.strptime(value.strip("\x00 "), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None

    offset = exif.get(Base.OffsetTimeOriginal)
    try:
        zone = datetime.strptime(offset.strip("\x00 "), "%z").tzinfo
    except (AttributeError, ValueError):
        zone = timezone.utc
    return captured_at.replace(tzinfo=zone)
