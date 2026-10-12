from PIL import Image as PILImage
from PIL.ExifTags import GPS, IFD


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
