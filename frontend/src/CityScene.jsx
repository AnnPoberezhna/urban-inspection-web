// Night city elevation in a fixed 1600×900 coordinate space. The frame is scaled like
// `object-fit: cover`, and the drone/targets use container units (cqw/cqh) of the same frame,
// so SVG coordinates map to CSS as x / 16 cqw and y / 9 cqh.

const GROUND = 900

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = seeded(20261019)

const WINDOW_COLORS = {
  near: { sodium: '#ffae3d', warm: '#ffd9a0', cold: '#9cd6ff', off: '#2b242b' },
  mid: { sodium: '#d98a31', warm: '#c9a87a', cold: '#6f9fc2', off: '#262028' },
  far: { sodium: '#7d5226', warm: '#6d5a45', cold: '#425b70', off: '#1c1920' },
}

function windowColor(depth) {
  const palette = WINDOW_COLORS[depth]
  const roll = random()
  if (roll < 0.22) return palette.sodium
  if (roll < 0.3) return palette.warm
  if (roll < 0.33) return palette.cold
  return palette.off
}

function windowTile(id, depth, x, y, cellW, cellH, cols, rows) {
  const windows = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      windows.push({ x: c * cellW + cellW * 0.25, y: r * cellH + cellH * 0.22, fill: windowColor(depth) })
    }
  }
  return { id, x, y, width: cellW * cols, height: cellH * rows, cellW, cellH, windows }
}

function skyline(minW, maxW, minH, maxH, gap) {
  const out = []
  let x = -60
  while (x < 1660) {
    const w = minW + random() * (maxW - minW)
    const h = minH + random() * (maxH - minH)
    out.push({ x, w, top: GROUND - h })
    x += w + random() * gap
  }
  return out
}

const FAR = skyline(40, 110, 220, 470, 8)
const FAR_TILES = [0, 1, 2].map((i) => windowTile(`far${i}`, 'far', 0, 0, 12, 16, 5, 4))

const MID = skyline(90, 190, 330, 640, 30).map((building, i) => {
  const cellW = 20 + Math.round(random() * 6)
  const tile = windowTile(`mid${i}`, 'mid', building.x + 6, building.top + 14, cellW, 28, 4, 3)
  const roof = random()
  return { ...building, tile, antenna: roof > 0.62, tank: roof < 0.25 }
})

const NEAR = [
  { x: 240, w: 230, top: 300 },
  { x: 640, w: 250, top: 240 },
  { x: 1060, w: 245, top: 340 },
  { x: 1355, w: 215, top: 220 },
].map((building, i) => ({
  ...building,
  tile: windowTile(`near${i}`, 'near', building.x + 14, building.top + 26, 38, 54, 3, 3),
}))

const BEACONS = MID.filter((building) => building.antenna).map((building) => ({
  x: building.x + building.w / 2,
  y: building.top - 46,
}))

const TARGETS = [
  { x: 355, y: 353, label: 'Crack', value: '0.42 mm', confidence: '94%' },
  { x: 765, y: 293, label: 'Spalling', value: '38 cm²', confidence: '88%' },
  { x: 1182, y: 403, label: 'Crack', value: '1.10 mm', confidence: '97%' },
  { x: 1462, y: 273, label: 'Corrosion', value: 'stain', confidence: '81%' },
]

function crackPath({ x, y }) {
  let px = x - 36
  let py = y - 12
  let d = `M${px} ${py}`
  for (let i = 0; i < 9; i++) {
    px += 6 + random() * 4
    py += (random() - 0.35) * 9
    d += ` L${px.toFixed(1)} ${py.toFixed(1)}`
  }
  const bx = x - 4
  const by = y - 6
  return `${d} M${bx} ${by} L${bx + 5} ${by + 9} L${bx + 2} ${by + 17} L${bx + 8} ${by + 26}`
}

const CRACKS = TARGETS.map(crackPath)
const LAMPS = Array.from({ length: 10 }, (_, i) => 70 + i * 165)

function Tile({ tile, roomy }) {
  return (
    <pattern id={tile.id} x={tile.x} y={tile.y} width={tile.width} height={tile.height} patternUnits="userSpaceOnUse">
      {tile.windows.map((win, index) => (
        <rect
          key={index}
          x={win.x}
          y={win.y}
          width={tile.cellW * (roomy ? 0.5 : 0.48)}
          height={tile.cellH * (roomy ? 0.6 : 0.52)}
          fill={win.fill}
        />
      ))}
      {roomy && <rect className="slab" x="0" y={tile.cellH - 2} width={tile.width} height="2" />}
    </pattern>
  )
}

function Drone() {
  return (
    <svg className="uav-craft" viewBox="0 0 120 60" aria-hidden="true">
      <ellipse className="rotor" cx="22" cy="9" rx="19" ry="2.4" />
      <ellipse className="rotor rotor-b" cx="98" cy="9" rx="19" ry="2.4" />
      <path className="mast" d="M22 10 V18 M98 10 V18" />
      <path className="arm" d="M18 19 H102" />
      <rect className="hull" x="34" y="15" width="52" height="17" rx="8.5" />
      <path className="hull-line" d="M42 20 H78" />
      <path className="gear" d="M44 31 L38 47 M76 31 L82 47 M32 47 H46 M74 47 H88" />
      <rect className="gimbal-mount" x="56" y="31" width="8" height="5" />
      <circle className="gimbal" cx="60" cy="40" r="5.5" />
      <circle className="lens" cx="60" cy="42" r="2.2" />
      <circle className="nav nav-port" cx="35" cy="23" r="2" />
      <circle className="nav nav-star" cx="85" cy="23" r="2" />
    </svg>
  )
}

export default function CityScene({ phase }) {
  return (
    <div className="scene" data-phase={phase} aria-hidden="true">
      <div className="scene-frame">
        <svg className="city" viewBox="0 0 1600 900" preserveAspectRatio="none">
          <defs>
            <radialGradient id="moon" cx="0.42" cy="0.4" r="0.6">
              <stop offset="0" stopColor="#f6f1e6" />
              <stop offset="0.7" stopColor="#d9d2c4" />
              <stop offset="1" stopColor="#b9b2a6" />
            </radialGradient>
            <radialGradient id="moon-halo">
              <stop offset="0" stopColor="#e8e4da" stopOpacity="0.28" />
              <stop offset="1" stopColor="#e8e4da" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="horizon" cx="0.5" cy="1" r="0.7">
              <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.38" />
              <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lamp">
              <stop offset="0" stopColor="#ffb547" stopOpacity="0.75" />
              <stop offset="0.35" stopColor="#ff9a3c" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="facade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2e262d" />
              <stop offset="1" stopColor="#1a1519" />
            </linearGradient>
            {FAR_TILES.map((tile) => (
              <Tile key={tile.id} tile={tile} />
            ))}
            {MID.map((building) => (
              <Tile key={building.tile.id} tile={building.tile} />
            ))}
            {NEAR.map((building) => (
              <Tile key={building.tile.id} tile={building.tile} roomy />
            ))}
          </defs>

          <circle cx="1250" cy="128" r="150" fill="url(#moon-halo)" />
          <circle cx="1250" cy="128" r="44" fill="url(#moon)" />
          <ellipse cx="800" cy="900" rx="1100" ry="520" fill="url(#horizon)" />

          <g className="layer-far">
            {FAR.map((building, i) => (
              <g key={i}>
                <rect x={building.x} y={building.top} width={building.w} height={GROUND - building.top} fill="#16131a" />
                <rect
                  x={building.x + 4}
                  y={building.top + 10}
                  width={building.w - 8}
                  height={GROUND - building.top - 10}
                  fill={`url(#far${i % 3})`}
                />
              </g>
            ))}
          </g>

          <g className="layer-mid">
            {MID.map((building, i) => (
              <g key={i}>
                {building.antenna && (
                  <path
                    className="antenna"
                    d={`M${building.x + building.w / 2} ${building.top} V${building.top - 46}`}
                  />
                )}
                {building.tank && (
                  <rect
                    x={building.x + building.w * 0.62}
                    y={building.top - 22}
                    width="22"
                    height="22"
                    rx="3"
                    fill="#1e1a22"
                  />
                )}
                <rect x={building.x} y={building.top} width={building.w} height={GROUND - building.top} fill="#1e1a22" />
                <rect
                  x={building.x + 6}
                  y={building.top + 14}
                  width={building.w - 12}
                  height={GROUND - building.top - 14}
                  fill={`url(#${building.tile.id})`}
                />
              </g>
            ))}
          </g>

          <g className="layer-near">
            {NEAR.map((building, i) => (
              <g key={i}>
                <rect className="parapet" x={building.x - 6} y={building.top - 10} width={building.w + 12} height="12" />
                <rect x={building.x} y={building.top} width={building.w} height={GROUND - building.top} fill="url(#facade)" />
                <rect
                  x={building.x + 14}
                  y={building.top + 26}
                  width={building.w - 28}
                  height={GROUND - building.top - 26}
                  fill={`url(#${building.tile.id})`}
                />
                <rect className="edge" x={building.x} y={building.top} width="3" height={GROUND - building.top} />
              </g>
            ))}
            {CRACKS.map((d, i) => (
              <path key={i} className="crack" d={d} />
            ))}
          </g>

          <g className="street">
            <rect x="0" y="862" width="1600" height="38" fill="#0c0a0e" />
            {LAMPS.map((x) => (
              <g key={x}>
                <circle cx={x} cy="790" r="120" fill="url(#lamp)" />
                <path className="lamp-pole" d={`M${x} 900 V794 h14`} />
                <rect className="lamp-head" x={x + 8} y="790" width="14" height="5" rx="2" />
              </g>
            ))}
          </g>
        </svg>

        {BEACONS.map((beacon, i) => (
          <span
            key={i}
            className="beacon"
            style={{ left: `${beacon.x / 16}cqw`, top: `${beacon.y / 9}cqh`, animationDelay: `${(i * 370) % 1400}ms` }}
          />
        ))}

        {TARGETS.map((target, i) => (
          <div
            key={i}
            className="detect"
            style={{ left: `${target.x / 16}cqw`, top: `${target.y / 9}cqh`, '--hold': i }}
          >
            <span className="detect-tag">
              <b>{target.label}</b> {target.value} · {target.confidence}
            </span>
          </div>
        ))}

        <div className="uav">
          <div className="uav-bob">
            <span className="beam" />
            <span className="spot">
              <i className="spot-scan" />
            </span>
            <div className="uav-tilt">
              <Drone />
            </div>
          </div>
        </div>
      </div>
      <div className="haze" />
    </div>
  )
}
