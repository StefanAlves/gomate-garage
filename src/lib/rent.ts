// Weekly-in-advance Rent arithmetic (see SPECs/rentals.md). Pure: dates are
// YYYY-MM-DD strings in the garage's day, money is integer cents.

export interface RentRate {
  effectiveFrom: string
  weeklyCents: number
}

const DAY = 86_400_000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The weekly Rent in effect on `date`: the latest rate starting on or before it. */
export function rateOn(rates: readonly RentRate[], date: string): number {
  const sorted = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  let rate = sorted[0]?.weeklyCents ?? 0
  for (const r of sorted) if (r.effectiveFrom <= date) rate = r.weeklyCents
  return rate
}

/**
 * Due dates of every week that has fallen due by `asOf`. Week k is due on
 * start + 7k. Once the Car is returned no new week falls due, except the
 * first, which is due at handover.
 */
export function dueDates(start: string, asOf: string, returnedOn: string | null = null): string[] {
  const out: string[] = []
  const last = toMs(asOf)
  const stop = returnedOn ? toMs(returnedOn) : Infinity
  for (let ms = toMs(start), k = 0; ms <= last; ms += 7 * DAY, k++) {
    if (k > 0 && ms >= stop) break
    out.push(fromMs(ms))
  }
  return out
}

/** Rent due to date: every week due so far, each at the rate in effect on its due date. */
export function rentDue(rates: readonly RentRate[], start: string, asOf: string, returnedOn: string | null = null) {
  return dueDates(start, asOf, returnedOn).reduce((sum, d) => sum + rateOn(rates, d), 0)
}

/** The next week's due date after `asOf`, or null once returned. */
export function nextDueDate(start: string, asOf: string, returnedOn: string | null = null): string | null {
  if (returnedOn) return null
  if (asOf < start) return start
  const weeks = Math.floor((toMs(asOf) - toMs(start)) / (7 * DAY)) + 1
  return fromMs(toMs(start) + weeks * 7 * DAY)
}

/** Whole weeks of Rent the balance covers, rounded up; 0 when nothing is owed. */
export function weeksBehind(owedCents: number, weeklyCents: number) {
  return owedCents > 0 && weeklyCents > 0 ? Math.ceil(owedCents / weeklyCents) : 0
}

/**
 * Bond settlement at Return: the Bond held covers the deductions first; the
 * rest is refunded, and anything the Bond can't cover is the shortfall.
 */
export function settle(bondHeldCents: number, deductionsCents: number) {
  const appliedCents = Math.min(Math.max(bondHeldCents, 0), Math.max(deductionsCents, 0))
  return {
    appliedCents,
    refundCents: Math.max(0, bondHeldCents - appliedCents),
    shortfallCents: Math.max(0, deductionsCents - appliedCents),
  }
}
