// Finance Sale arithmetic (see SPECs/finance-sales.md). Pure: dates are
// YYYY-MM-DD strings in the garage's day, money is integer cents.

import { addDays } from './period'

export interface FinancePlan {
  /** Every Instalment but the last. */
  instalmentCents: number
  /** The last Instalment absorbs rounding; equals instalmentCents when it divides evenly. */
  lastCents: number
}

/**
 * The Instalment amounts for a deal. With no override the balance after the
 * Deposit is split evenly (rounded to the cent); the last one absorbs the
 * difference. Returns an error when the parts can't add up to the price.
 */
export function financePlan(
  priceCents: number,
  depositCents: number,
  count: number,
  overrideCents: number | null = null,
): { ok: true; plan: FinancePlan } | { ok: false; error: 'deposit_over_price' | 'cash_sale_needs_full_deposit' | 'nothing_to_pay' | 'instalments_too_large' } {
  if (depositCents > priceCents) return { ok: false, error: 'deposit_over_price' }
  const rest = priceCents - depositCents
  if (count === 0) return rest === 0 ? { ok: true, plan: { instalmentCents: 0, lastCents: 0 } } : { ok: false, error: 'cash_sale_needs_full_deposit' }
  if (rest === 0) return { ok: false, error: 'nothing_to_pay' }
  const instalmentCents = overrideCents ?? Math.round(rest / count)
  const lastCents = rest - (count - 1) * instalmentCents
  if (instalmentCents <= 0 || lastCents <= 0) return { ok: false, error: 'instalments_too_large' }
  return { ok: true, plan: { instalmentCents, lastCents } }
}

export interface ScheduleRow {
  /** 0 = Deposit, then Instalments 1…n. */
  number: number
  dueOn: string
  amountCents: number
}

/** Deposit on the agreement date, then Instalment k on agreement date + 7k. */
export function financeSchedule(agreedOn: string, depositCents: number, count: number, plan: FinancePlan): ScheduleRow[] {
  const rows: ScheduleRow[] = [{ number: 0, dueOn: agreedOn, amountCents: depositCents }]
  for (let k = 1; k <= count; k++)
    rows.push({ number: k, dueOn: addDays(agreedOn, 7 * k), amountCents: k === count ? plan.lastCents : plan.instalmentCents })
  return rows
}

export const dueToDate = (schedule: readonly ScheduleRow[], asOf: string) =>
  schedule.reduce((sum, r) => (r.dueOn <= asOf ? sum + r.amountCents : sum), 0)

/** The first due date after `asOf`, or null when nothing more falls due. */
export const nextFinanceDue = (schedule: readonly ScheduleRow[], asOf: string) =>
  schedule.find((r) => r.dueOn > asOf)?.dueOn ?? null

export type InstalmentState = 'paid' | 'part_paid' | 'overdue' | 'upcoming'

/** Each row with how much of it is paid; payments cover the oldest rows first. */
export function scheduleWithState(schedule: readonly ScheduleRow[], paidCents: number, asOf: string) {
  let left = paidCents
  return schedule.map((r) => {
    const covered = Math.max(0, Math.min(left, r.amountCents))
    left -= covered
    const state: InstalmentState = covered === r.amountCents ? 'paid' : r.dueOn <= asOf ? 'overdue' : covered > 0 ? 'part_paid' : 'upcoming'
    return { ...r, paidCents: covered, state }
  })
}
