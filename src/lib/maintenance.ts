// Rental Car servicing (see SPECs/maintenance.md). Pure: dates are YYYY-MM-DD
// strings in the garage's day, distances are whole km.

/** Due soon = within this many days of the next service date… */
export const DUE_SOON_DAYS = 30
/** …or within this many km of the next service km. */
export const DUE_SOON_KM = 1_000
/** The km/day estimate uses readings from this many days before the latest one. */
export const ESTIMATE_WINDOW_DAYS = 60
/** A latest reading older than this gets an estimated current km. */
export const STALE_READING_DAYS = 7

export interface Reading {
  readOn: string
  km: number
}

export interface ServiceInterval {
  km: number | null
  months: number | null
}

export type MaintenanceState = 'no_interval' | 'overdue' | 'due_soon' | 'ok'

const DAY = 86_400_000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY)

/** `iso` plus `months`, keeping the day of the month where it exists (31 Aug + 6 = 28 Feb). */
export function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const index = m - 1 + months
  const year = y + Math.floor(index / 12)
  const month = ((index % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

/** Readings in the order they happened; same-day readings keep the order they were recorded in. */
const chronological = (readings: readonly Reading[]) =>
  readings.map((r, i) => ({ r, i })).sort((a, b) => a.r.readOn.localeCompare(b.r.readOn) || a.i - b.i).map((x) => x.r)

/**
 * Whether a new reading fits between the readings either side of its date.
 * Anything else is a typo unless staff confirm it as a correction.
 */
export function checkReading(readings: readonly Reading[], next: Reading): 'ok' | 'lower_than_earlier' | 'higher_than_later' {
  if (readings.some((r) => r.readOn <= next.readOn && r.km > next.km)) return 'lower_than_earlier'
  if (readings.some((r) => r.readOn > next.readOn && r.km < next.km)) return 'higher_than_later'
  return 'ok'
}

/** Average km/day between the latest reading and the earliest one in the window before it; null if it can't tell. */
function kmPerDay(sorted: readonly Reading[]) {
  const latest = sorted.at(-1)
  if (!latest) return null
  const from = sorted.find((r) => daysBetween(r.readOn, latest.readOn) <= ESTIMATE_WINDOW_DAYS)
  if (!from) return null
  const days = daysBetween(from.readOn, latest.readOn)
  const km = latest.km - from.km
  return days > 0 && km > 0 ? km / days : null
}

/**
 * When a Rental Car's next service is due. The countdown runs from the last
 * service; with none yet, from the first reading (or, for the date, the day
 * the car was added). The car is due at whichever of the date or km comes
 * first. When the latest reading is old, the km left uses an estimate.
 */
export function maintenanceDue(input: {
  interval: ServiceInterval
  lastService: { servicedOn: string; km: number } | null
  readings: readonly Reading[]
  createdOn: string
  today: string
}) {
  const { interval, lastService, today } = input
  const sorted = chronological(input.readings)
  const first = sorted[0] ?? null
  const latest = sorted.at(-1) ?? null

  const baseOn = lastService?.servicedOn ?? first?.readOn ?? input.createdOn
  const baseKm = lastService?.km ?? first?.km ?? null
  const nextDueOn = interval.months ? addMonths(baseOn, interval.months) : null
  const nextDueKm = interval.km && baseKm != null ? baseKm + interval.km : null

  const sinceLatest = latest ? daysBetween(latest.readOn, today) : null
  const rate = sinceLatest != null && sinceLatest >= STALE_READING_DAYS ? kmPerDay(sorted) : null
  const estimatedKm = rate != null && latest && sinceLatest != null ? Math.round(latest.km + rate * sinceLatest) : null
  const currentKm = estimatedKm ?? latest?.km ?? null

  const daysLeft = nextDueOn ? daysBetween(today, nextDueOn) : null
  const kmLeft = nextDueKm != null && currentKm != null ? nextDueKm - currentKm : null

  let state: MaintenanceState
  if (!interval.km && !interval.months) state = 'no_interval'
  else if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft < 0)) state = 'overdue'
  else if ((daysLeft != null && daysLeft <= DUE_SOON_DAYS) || (kmLeft != null && kmLeft <= DUE_SOON_KM)) state = 'due_soon'
  else state = 'ok'

  return {
    state,
    nextDueOn,
    nextDueKm,
    daysLeft,
    kmLeft,
    latest,
    daysSinceReading: sinceLatest,
    kmPerDay: rate == null ? null : Math.round(rate * 10) / 10,
    estimatedKm,
    kmEstimated: estimatedKm != null,
  }
}
export type MaintenanceDue = ReturnType<typeof maintenanceDue>
