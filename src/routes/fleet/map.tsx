import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { carName } from '~/lib/format'
import { locationState } from '~/lib/tracking'
import { getFleetLocations } from '~/server/tracking.functions'
import { FleetMap } from '~/components/fleet-map'
import { LocationBadge, REFRESH_MS, TrackingUnavailable, fixSummary, pinFor } from '~/components/tracking'
import { Link } from '~/components/ui/link'

export const Route = createFileRoute('/fleet/map')({
  loader: () => getFleetLocations(),
  head: () => ({ meta: [{ title: 'Fleet map · Garage' }] }),
  component: FleetMapPage,
})

function FleetMapPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [focus, setFocus] = useState<number | null>(null)

  // Ask Traccar again every 30 s while the page is open and visible.
  useEffect(() => {
    if (data.status !== 'ok') return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void router.invalidate()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [data.status, router])

  // Times are measured from when the server asked Traccar, so server and browser render the same text.
  const pins = useMemo(() => {
    if (data.status !== 'ok') return []
    const at = new Date(data.checkedAt)
    return data.cars.map((c) => pinFor(c, at)).filter((p) => p != null)
  }, [data])

  if (data.status !== 'ok')
    return (
      <div className="stack">
        <h1>Fleet map</h1>
        <TrackingUnavailable status={data.status} message={data.status === 'error' ? data.message : undefined} />
      </div>
    )

  const now = new Date(data.checkedAt)
  const tracked = data.cars.filter((c) => c.tracker)
  const untracked = data.cars.filter((c) => !c.tracker && c.status !== 'sold')

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Fleet map</h1>
        <span className="muted small">
          {pins.length} of {data.cars.length} cars on the map · updates every 30 s
        </span>
      </div>

      <div className="map-layout">
        <FleetMap pins={pins} focus={focus} />

        <section className="panel stack tight map-list" aria-label="Tracked cars">
          <h2>Tracked cars</h2>
          {tracked.length === 0 && <p className="muted small">No tracker is linked to a car yet. Name each tracker in Traccar after its car's rego.</p>}
          <ul className="plain-list">
            {tracked.map((car) => {
              const state = locationState(car.tracker!.position, now)
              return (
                <li key={car.id}>
                  <button type="button" className="map-list-item" onClick={() => setFocus(car.id)} disabled={!car.tracker!.position}>
                    <span className="row wrap">
                      <span className="plate">{car.plate}</span>
                      <LocationBadge state={state} />
                    </span>
                    <span className="small">{carName(car)}{car.customerName && <span className="muted"> · {car.customerName}</span>}</span>
                    <span className="muted small">{fixSummary(car.tracker!, now)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {untracked.length > 0 && (
        <section className="panel stack tight">
          <h2>No tracker</h2>
          <p className="muted small">No tracker in Traccar is named after these cars' regos.</p>
          <div className="row wrap">
            {untracked.map((c) => (
              <Link key={c.id} to="/cars/$carId" params={{ carId: String(c.id) }} search={{ tab: 'location' }} className="plate plain-link">
                {c.plate}
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.unmatched.length > 0 && (
        <p className="notice small">
          Trackers in Traccar that match no car: {data.unmatched.map((d) => `${d.name} (${d.uniqueId})`).join(', ')}.
          Rename each one to its car's rego to put it on the map.
        </p>
      )}
    </div>
  )
}
