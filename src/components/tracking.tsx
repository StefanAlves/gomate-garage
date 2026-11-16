import { carName } from '~/lib/format'
import {
  SIM_APNS, formatAgo, locationState, locationStateLabel, speedKmh, trackerSmsCommands,
  type CarTracker, type LocationState, type TrackerServer,
} from '~/lib/tracking'
import type { CarLocation } from '~/server/tracking.server'
import type { MapPin } from './fleet-map'

/** How often the map and the Location tab ask Traccar again while open. */
export const REFRESH_MS = 30_000

export function LocationBadge({ state }: { state: LocationState }) {
  return <span className={`badge loc-${state}`}>{locationStateLabel[state]}</span>
}

/** One line on how fresh the fix is: "Parked · 4 min ago · 0 km/h". */
export function fixSummary(tracker: CarTracker, now: Date) {
  const p = tracker.position
  if (!p) return tracker.device.status === 'online' ? 'Tracker online, waiting for a GPS fix' : 'Tracker has never reported'
  const parts = [formatAgo(p.fixTime, now)]
  if (locationState(p, now) === 'moving') parts.push(`${speedKmh(p)} km/h`)
  if (p.attributes.ignition != null) parts.push(p.attributes.ignition ? 'ignition on' : 'ignition off')
  return parts.join(' · ')
}

export function pinFor(car: CarLocation, now: Date): MapPin | null {
  const p = car.tracker?.position
  if (!car.tracker || !p) return null
  return {
    id: car.id,
    latitude: p.latitude,
    longitude: p.longitude,
    label: car.plate,
    state: locationState(p, now),
    title: `${car.plate} · ${carName(car)}`,
    lines: [car.customerName ? `With ${car.customerName}` : 'Not out with a customer', fixSummary(car.tracker, now), ...(p.address ? [p.address] : [])],
    href: `/cars/${car.id}`,
  }
}

/** What to show instead of a map when tracking isn't set up or Traccar can't be read. */
export function TrackingUnavailable({ status, message }: { status: 'not_configured' | 'error'; message?: string }) {
  if (status === 'error')
    return (
      <section className="panel stack">
        <h2>Tracking is unavailable</h2>
        <p>{message}</p>
      </section>
    )
  return (
    <section className="panel stack">
      <h2>Tracking isn't set up yet</h2>
      <p className="muted">
        Car locations come from a Traccar server. Set <code>TRACCAR_URL</code> and <code>TRACCAR_TOKEN</code> (or{' '}
        <code>TRACCAR_EMAIL</code> and <code>TRACCAR_PASSWORD</code>), then name each tracker in Traccar after its car's
        rego. See the README's "GPS tracking" section.
      </p>
    </section>
  )
}

/**
 * How to fit a tracker (Jimi IoT VL110C or another GT06-style one) and link it
 * to a car, filled in with the car's rego and this app's Traccar server.
 */
export function TrackerSetupSteps({ plate, server }: { plate?: string; server: TrackerServer | null }) {
  const [, serverText] = trackerSmsCommands(server ?? { host: '<server address>', port: 5023 })
  return (
    <ol className="setup-steps stack tight">
      <li>
        In Traccar, add a device: <strong>Name</strong> {plate ? <span className="plate">{plate}</span> : "the car's rego"},{' '}
        <strong>Identifier</strong> the IMEI on the tracker's label.
      </li>
      <li>Put a data SIM (no PIN lock) in the tracker and wire ACC to the ignition.</li>
      <li>
        Text the tracker's SIM number these two messages, one at a time (it texts back after each):
        <pre className="sms">APN,<em>{'<carrier APN>'}</em>#{'\n'}{serverText}</pre>
        <span className="muted small">
          APN is the SIM carrier's:{' '}
          {SIM_APNS.map((a, i) => (
            <span key={a.apn}>
              {i > 0 && ', '}
              {a.carrier} <code>{a.apn}</code>
            </span>
          ))}
          . Use the carrier's own APN for other brands.
        </span>
      </li>
      <li>
        It goes Online in Traccar within a few minutes; the first position needs open sky. It then shows here and on the fleet map.
        If it stays offline, text <code>STATUS#</code> to check signal and server connection.
      </li>
    </ol>
  )
}
