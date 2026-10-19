import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const CENTER = [50.0614, 19.9372]
const ZOOM = 15

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

export default function InspectionMap() {
  return (
    <section className="map-panel" aria-label="Inspection map">
      <MapContainer className="map-canvas" center={CENTER} zoom={ZOOM} scrollWheelZoom>
        <FitCanvas />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </section>
  )
}
