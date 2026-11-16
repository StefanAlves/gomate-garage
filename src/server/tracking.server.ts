import '@tanstack/react-start/server-only'
import type { CarPurpose, CarStatus } from '~/lib/schemas'
import { matchTrackers, type CarTracker, type TrackerDevice, type TrackerPosition } from '~/lib/tracking'
import { db } from './db.server'

// GPS tracking through a Traccar server (https://www.traccar.org). The trackers
// report to Traccar; the app reads their latest positions from Traccar's REST
// API on each request and stores nothing itself.
//
// Settings: TRACCAR_URL plus either TRACCAR_TOKEN (an API token made under the
// Traccar user's settings) or TRACCAR_EMAIL + TRACCAR_PASSWORD. With none set,
// the tracking pages say tracking isn't set up instead of failing.

export interface TraccarConfig {
  url: string
  authorization: string
}

export function traccarConfig(env: NodeJS.ProcessEnv = process.env): TraccarConfig | null {
  const url = env.TRACCAR_URL?.trim().replace(/\/+$/, '')
  if (!url) return null
  if (env.TRACCAR_TOKEN) return { url, authorization: `Bearer ${env.TRACCAR_TOKEN}` }
  if (env.TRACCAR_EMAIL && env.TRACCAR_PASSWORD)
    return { url, authorization: `Basic ${Buffer.from(`${env.TRACCAR_EMAIL}:${env.TRACCAR_PASSWORD}`).toString('base64')}` }
  return null
}

/** A Traccar problem worded for staff (the page shows the message). */
export class TrackingError extends Error {}

const TIMEOUT_MS = 8000

async function getJson<T>(config: TraccarConfig, path: string, fetchImpl: typeof fetch): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(`${config.url}${path}`, {
      headers: { Authorization: config.authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new TrackingError("Couldn't reach the tracking server. Check TRACCAR_URL, or try again in a minute.")
  }
  if (res.status === 401 || res.status === 403)
    throw new TrackingError('The tracking server refused the login. Check TRACCAR_TOKEN (or TRACCAR_EMAIL and TRACCAR_PASSWORD).')
  if (!res.ok) throw new TrackingError(`The tracking server answered ${res.status} for ${path}.`)
  return (await res.json()) as T
}

/** Every tracker the Traccar user can see, and each one's latest position. */
export async function fetchTrackers(config: TraccarConfig, fetchImpl: typeof fetch = fetch) {
  const [devices, positions] = await Promise.all([
    getJson<TrackerDevice[]>(config, '/api/devices', fetchImpl),
    getJson<TrackerPosition[]>(config, '/api/positions', fetchImpl),
  ])
  return {
    devices: devices.map(({ id, name, uniqueId, status, lastUpdate, positionId }) => ({ id, name, uniqueId, status, lastUpdate, positionId })),
    positions: positions.map(({ id, deviceId, latitude, longitude, speed, course, fixTime, address, attributes }) => ({
      id, deviceId, latitude, longitude, speed, course, fixTime, address: address ?? null,
      attributes: {
        ignition: attributes?.ignition, motion: attributes?.motion,
        batteryLevel: attributes?.batteryLevel, totalDistance: attributes?.totalDistance,
      },
    })),
  }
}

export interface TrackedCar {
  id: number
  plate: string
  make: string
  model: string
  year: number | null
  purpose: CarPurpose
  status: CarStatus
  customerId: number | null
  customerName: string | null
}

export type CarLocation = TrackedCar & { tracker: CarTracker | null }

export type FleetLocations =
  | { status: 'not_configured' }
  | { status: 'error'; message: string }
  | { status: 'ok'; checkedAt: string; cars: CarLocation[]; unmatched: TrackerDevice[] }

/** Every car, with the customer it's out with (active rental or finance sale). */
export function trackedCars() {
  return db.all<TrackedCar>(
    `SELECT car.id, car.plate, car.make, car.model, car.year, car.purpose, car.status,
            cu.id AS customerId,
            CASE WHEN cu.id IS NULL THEN NULL ELSE trim(cu.first_name || ' ' || coalesce(cu.last_name, '')) END AS customerName
     FROM cars car
     LEFT JOIN rentals r ON r.car_id = car.id AND r.status = 'active'
     LEFT JOIN finance_sales f ON f.car_id = car.id AND f.status = 'active'
     LEFT JOIN customers cu ON cu.id = coalesce(r.customer_id, f.customer_id)
     ORDER BY car.plate`,
  )
}

/** Cars with their tracker's latest position. `carId` narrows it to one car. */
export async function fleetLocations(
  { carId, now = new Date(), env = process.env, fetchImpl = fetch }:
    { carId?: number; now?: Date; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<FleetLocations> {
  const config = traccarConfig(env)
  if (!config) return { status: 'not_configured' }
  // Every car, even for one car's lookup: a tracker is only "unmatched" if no plate fits it.
  const [cars, trackers] = await Promise.all([
    trackedCars(),
    fetchTrackers(config, fetchImpl).catch((err: unknown) => {
      if (err instanceof TrackingError) return err
      throw err
    }),
  ])
  if (trackers instanceof TrackingError) return { status: 'error', message: trackers.message }
  const { byCar, unmatched } = matchTrackers(cars, trackers.devices, trackers.positions)
  return {
    status: 'ok',
    checkedAt: now.toISOString(),
    cars: cars.filter((c) => carId == null || c.id === carId).map((c) => ({ ...c, tracker: byCar.get(c.id) ?? null })),
    unmatched,
  }
}
