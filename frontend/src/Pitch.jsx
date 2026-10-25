export function CameraIcon() {
  return (
    <svg className="cta-camera" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 10.5h5l2.5-4h9l2.5 4h5v15H4z" />
      <circle cx="16" cy="17.5" r="5" />
    </svg>
  )
}

/** The headline block of the main page; children go below the text (the call to action). */
export function Pitch({ children }) {
  return (
    <div className="pitch">
      <h1 className="headline">
        <span className="rise" style={{ '--d': '200ms' }}>
          We spot the damage.
        </span>
        <span className="rise" style={{ '--d': '320ms' }}>
          <em>You plan the repair.</em>
        </span>
      </h1>
      <p className="lede rise" style={{ '--d': '450ms' }}>
        Upload a photo of a crack in your infrastructure. The model finds the damage, masks it and measures it in
        millimetres.
      </p>
      {children}
    </div>
  )
}
