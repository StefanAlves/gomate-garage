import { carName } from '~/lib/format'
import { formatAgo, locationState, locationStateLabel, speedKmh, type CarTracker, type LocationState } from '~/lib/tracking'
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
