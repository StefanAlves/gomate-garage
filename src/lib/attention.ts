import type { CarStatus } from './schemas'

/** A rego expiry within this many days needs attention. */
export const ATTENTION_DAYS = 30

/** Most urgent first. The SQL in `listCars` ranks them in this same order. */
export const EXPIRY_STATES = ['expired', 'missing', 'expiring'] as const
export type ExpiryState = (typeof EXPIRY_STATES)[number]

export interface AttentionFlag {
  state: ExpiryState
  /** Days from today to the rego expiry: negative once expired, null when no date is recorded. */
  days: number | null
}

const dayMs = 86_400_000
const daysFrom = (today: string, iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs)

export function expiryState(date: string | null, today: string): ExpiryState | null {
  if (!date) return 'missing'
  const days = daysFrom(today, date)
  if (days < 0) return 'expired'
  return days <= ATTENTION_DAYS ? 'expiring' : null
}

/** What a car needs done about its rego, or null. Sold cars are the buyer's problem. */
export function carAttention(car: { status: CarStatus; regoExpiry: string | null }, today: string): AttentionFlag | null {
  if (car.status === 'sold') return null
  const state = expiryState(car.regoExpiry, today)
  return state && { state, days: car.regoExpiry ? daysFrom(today, car.regoExpiry) : null }
}

export function attentionLabel({ state, days }: AttentionFlag) {
  if (state === 'missing') return 'No rego date'
  if (state === 'expired') return `Rego expired ${-days!}d ago`
  return days === 0 ? 'Rego due today' : `Rego ${days}d`
}
