import type { CarStatus } from './schemas'

/** A rego or insurance expiry within this many days needs attention. */
export const ATTENTION_DAYS = 30

/** Most urgent first. The SQL in `listCars` ranks them in this same order. */
export const EXPIRY_STATES = ['expired', 'missing', 'expiring'] as const
export type ExpiryState = (typeof EXPIRY_STATES)[number]

export interface AttentionFlag {
  what: 'rego' | 'insurance'
  state: ExpiryState
  /** Days from today to the expiry date: negative once expired, null when no date is recorded. */
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

/** What a car needs done about its rego and insurance. Sold cars are the buyer's problem. */
export function carAttention(
  car: { status: CarStatus; regoExpiry: string | null; insuranceExpiry: string | null },
  today: string,
): AttentionFlag[] {
  if (car.status === 'sold') return []
  const flags: AttentionFlag[] = []
  for (const [what, date] of [['rego', car.regoExpiry], ['insurance', car.insuranceExpiry]] as const) {
    const state = expiryState(date, today)
    if (state) flags.push({ what, state, days: date ? daysFrom(today, date) : null })
  }
  return flags.sort((a, b) => EXPIRY_STATES.indexOf(a.state) - EXPIRY_STATES.indexOf(b.state))
}

export function attentionLabel({ what, state, days }: AttentionFlag) {
  const name = what === 'rego' ? 'Rego' : 'Insurance'
  if (state === 'missing') return `No ${what} date`
  if (state === 'expired') return `${name} expired ${-days!}d ago`
  return days === 0 ? `${name} due today` : `${name} ${days}d`
}
