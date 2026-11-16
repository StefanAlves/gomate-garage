// GPS tracking: the parts of Traccar's data the app uses, and how trackers are
// linked to cars. Pure functions, shared by the server and the pages.
//
// A tracker belongs to the car whose plate is the tracker's name in Traccar
// (or, failing that, its identifier). Case, spaces and dashes don't matter.
// That keeps the link in one place (Traccar) and needs no database change.

/** A tracker as Traccar's GET /api/devices returns it (fields the app uses). */
export interface TrackerDevice {
  id: number
  name: string
  uniqueId: string
  status: 'online' | 'offline' | 'unknown'
  lastUpdate: string | null
  positionId: number | null
}

/** A tracker's latest fix, from Traccar's GET /api/positions. Speed is in knots. */
export interface TrackerPosition {
  id: number
  deviceId: number
  latitude: number
  longitude: number
  speed: number
  course: number
  fixTime: string
  address: string | null
  attributes: {
    ignition?: boolean
    motion?: boolean
    /** Tracker's own backup battery, percent (battery-powered trackers). */
    batteryLevel?: number
    /** Car battery voltage (hardwired trackers such as the Jimi VL110C). */
    power?: number
    totalDistance?: number
  }
}

export interface CarTracker {
  device: TrackerDevice
  position: TrackerPosition | null
}

export const normalizePlate = (plate: string) => plate.toUpperCase().replace(/[\s-]/g, '')

/** Links trackers to cars by plate. Trackers that match no car come back in `unmatched`. */
export function matchTrackers(
  cars: readonly { id: number; plate: string }[],
  devices: readonly TrackerDevice[],
  positions: readonly TrackerPosition[],
) {
  const carByPlate = new Map(cars.map((c) => [normalizePlate(c.plate), c.id]))
  const positionByDevice = new Map(positions.map((p) => [p.deviceId, p]))
  const byCar = new Map<number, CarTracker>()
  const unmatched: TrackerDevice[] = []
  for (const device of devices) {
    const carId = carByPlate.get(normalizePlate(device.name)) ?? carByPlate.get(normalizePlate(device.uniqueId))
    if (carId == null || byCar.has(carId)) unmatched.push(device)
    else byCar.set(carId, { device, position: positionByDevice.get(device.id) ?? null })
  }
  return { byCar, unmatched }
}

export type LocationState = 'moving' | 'parked' | 'stale' | 'no_fix'

/** A fix older than this is shown as "last seen", not as where the car is now. */
export const STALE_AFTER_MS = 60 * 60 * 1000
const KMH_PER_KNOT = 1.852
const MOVING_KMH = 5

export const speedKmh = (p: TrackerPosition) => Math.round(p.speed * KMH_PER_KNOT)

export function locationState(position: TrackerPosition | null, now: Date): LocationState {
  if (!position) return 'no_fix'
  if (now.getTime() - new Date(position.fixTime).getTime() > STALE_AFTER_MS) return 'stale'
  return speedKmh(position) >= MOVING_KMH ? 'moving' : 'parked'
}

export const locationStateLabel: Record<LocationState, string> = {
  moving: 'Moving',
  parked: 'Parked',
  stale: 'Last seen',
  no_fix: 'No location yet',
}

export function formatAgo(iso: string, now: Date) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export const mapsUrl = (p: Pick<TrackerPosition, 'latitude' | 'longitude'>) =>
  `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`
