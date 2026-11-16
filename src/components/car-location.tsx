import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { formatAgo, locationState, mapsUrl, speedKmh } from '~/lib/tracking'
import { getCarLocation } from '~/server/tracking.functions'
import type { FleetLocations } from '~/server/tracking.server'
import { FleetMap } from './fleet-map'
import { LocationBadge, REFRESH_MS, TrackerSetupSteps, TrackingUnavailable, pinFor } from './tracking'

const localTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * The car page's Location tab. Loaded when the tab opens (not with the page),
 * so a slow or offline tracking server never holds up the rest of the car page.
 */
export function CarLocationTab({ carId }: { carId: number }) {
  const fetchLocation = useServerFn(getCarLocation)
  const [data, setData] = useState<FleetLocations | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchLocation({ data: { id: carId } })
        .then((d) => !cancelled && setData(d))
        .catch(() => !cancelled && setData({ status: 'error', message: "Couldn't load the location. Try again in a minute." }))
    void load()
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [carId, fetchLocation])

  if (!data)
    return (
      <section className="panel stack" aria-busy="true">
        <h2>Location</h2>
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    )
  if (data.status !== 'ok') return <TrackingUnavailable status={data.status} message={data.status === 'error' ? data.message : undefined} />

  const now = new Date(data.checkedAt)
  const car = data.cars[0]
  const tracker = car?.tracker
  if (!car || !tracker)
    return (
      <section className="panel stack">
        <h2>Location</h2>
        <p className="muted">No tracker is linked to this car. To add one:</p>
        <TrackerSetupSteps plate={car?.plate} server={data.trackerServer} />
      </section>
    )

  const p = tracker.position
  const pin = pinFor(car, now)
  return (
    <section className="panel stack">
      <div className="row between wrap">
        <h2>Location</h2>
        <LocationBadge state={locationState(p, now)} />
      </div>
      {pin ? <FleetMap pins={[pin]} height={360} /> : <p className="muted">The tracker hasn't sent a GPS position yet.</p>}
      <dl className="dl">
        <dt>Tracker</dt>
        <dd>
          {tracker.device.name} <span className="muted small">({tracker.device.uniqueId}, {tracker.device.status})</span>
        </dd>
        {p && (
          <>
            <dt>Last position</dt>
            <dd>
              {formatAgo(p.fixTime, now)}{' '}
              {/* Rendered in the browser only (fetched after load), so local time is safe here. */}
              <span className="muted small">({localTime.format(new Date(p.fixTime))})</span>
            </dd>
            {p.address && (
              <>
                <dt>Address</dt>
                <dd>{p.address}</dd>
              </>
            )}
            <dt>Coordinates</dt>
            <dd>
              <a href={mapsUrl(p)} target="_blank" rel="noreferrer">
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} ↗
              </a>
            </dd>
            <dt>Speed</dt>
            <dd>{speedKmh(p)} km/h</dd>
            {p.attributes.ignition != null && (
              <>
                <dt>Ignition</dt>
                <dd>{p.attributes.ignition ? 'On' : 'Off'}</dd>
              </>
            )}
            {p.attributes.power != null && (
              <>
                <dt>Car battery</dt>
                <dd>{p.attributes.power.toFixed(1)} V</dd>
              </>
            )}
            {p.attributes.batteryLevel != null && (
              <>
                <dt>Tracker battery</dt>
                <dd>{Math.round(p.attributes.batteryLevel)}%</dd>
              </>
            )}
          </>
        )}
      </dl>
      <p className="muted small">Updates every 30 seconds while this tab is open.</p>
    </section>
  )
}
