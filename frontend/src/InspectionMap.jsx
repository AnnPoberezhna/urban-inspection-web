import { useEffect, useState } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const CENTER = [50.0614, 19.9372]
const ZOOM = 15
const PIN_ZOOM = 17
const FLIGHT_SECONDS = 2.4
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')

const PIN_ICON = divIcon({
  className: 'pin',
  html:
    '<span class="pin-shadow"></span><span class="pin-pulse"></span>' +
    '<svg class="pin-drop" viewBox="0 0 32 44" aria-hidden="true">' +
    '<path d="M16 44C16 44 1.5 27 1.5 15.5A14.5 14.5 0 0 1 30.5 15.5C30.5 27 16 44 16 44z" />' +
    '<circle cx="16" cy="15.5" r="5.5" /></svg>',
  iconSize: [32, 44],
  iconAnchor: [16, 44],
  tooltipAnchor: [0, -48],
})

function FitCanvas() {
  const map = useMap()
  useEffect(() => {
    const redraw = () => map.invalidateSize()
    const timer = window.setTimeout(redraw, 80)
    window.addEventListener('resize', redraw)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', redraw)
    }
  }, [map])
  return null
}

function FlyToPin({ pin, onLand }) {
  const map = useMap()
  useEffect(() => {
    if (!pin) return
    const land = () => onLand(pin.id)
    // Take off only once the page has scrolled the map into view, so the whole flight is visible.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 0.75) return
        observer.disconnect()
        map.once('moveend', land)
        map.flyTo(pin.position, PIN_ZOOM, { duration: FLIGHT_SECONDS, animate: !REDUCED_MOTION.matches })
      },
      { threshold: [0.75, 0.9] },
    )
    observer.observe(map.getContainer())
    return () => {
      observer.disconnect()
      map.off('moveend', land)
    }
  }, [map, pin, onLand])
  return null
}

export default function InspectionMap({ ref, pin }) {
  const [landedId, setLandedId] = useState(null)

  return (
    <section ref={ref} className="map-panel" aria-label="Inspection map">
      <MapContainer className="map-canvas" center={CENTER} zoom={ZOOM} scrollWheelZoom>
        <FitCanvas />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToPin pin={pin} onLand={setLandedId} />
        {pin && landedId === pin.id && (
          <Marker position={pin.position} icon={PIN_ICON}>
            <Tooltip className="pin-tag" direction="top" opacity={1} permanent>
              <b>{pin.name}</b>
              <span>
                {pin.position.map((value) => value.toFixed(5)).join(', ')}
                {pin.byName && ' · located by name'}
              </span>
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
    </section>
  )
}
