import { describe, expect, it } from 'vitest'
import { dueToDate, financePlan, financeSchedule, nextFinanceDue, scheduleWithState } from './finance'

const plan = (price: number, deposit: number, n: number, override: number | null = null) => {
  const out = financePlan(price, deposit, n, override)
  if (!out.ok) throw new Error(out.error)
  return out.plan
}

describe('finance plan', () => {
  it('splits the balance evenly and lets the last instalment absorb rounding', () => {
    // $10,000 − $1,000 deposit over 7 weeks: 7 × $1,285.71 = $8,999.97, last is $1,285.77.
    expect(plan(1_000_000, 100_000, 7)).toEqual({ instalmentCents: 128_571, lastCents: 128_574 })
    expect(plan(1_000_000, 100_000, 9)).toEqual({ instalmentCents: 100_000, lastCents: 100_000 })
  })

  it('takes an override and puts the difference on the last instalment', () => {
    expect(plan(1_000_000, 100_000, 10, 90_500)).toEqual({ instalmentCents: 90_500, lastCents: 85_500 })
  })

  it('rejects plans that cannot add up', () => {
    expect(financePlan(100, 200, 3)).toEqual({ ok: false, error: 'deposit_over_price' })
    expect(financePlan(1000, 500, 0)).toEqual({ ok: false, error: 'cash_sale_needs_full_deposit' })
    expect(financePlan(1000, 1000, 4)).toEqual({ ok: false, error: 'nothing_to_pay' })
    expect(financePlan(1000, 0, 4, 400)).toEqual({ ok: false, error: 'instalments_too_large' })
  })

  it('treats zero instalments with a full deposit as a cash sale', () => {
    expect(plan(500_000, 500_000, 0)).toEqual({ instalmentCents: 0, lastCents: 0 })
  })
})

describe('schedule and due to date', () => {
  const rows = financeSchedule('2026-01-01', 100_000, 3, { instalmentCents: 30_000, lastCents: 30_001 })

  it('dates the deposit at agreement and instalments weekly after it', () => {
    expect(rows.map((r) => [r.dueOn, r.amountCents])).toEqual([
      ['2026-01-01', 100_000], ['2026-01-08', 30_000], ['2026-01-15', 30_000], ['2026-01-22', 30_001],
    ])
  })

  it('owes only the deposit before the first instalment', () => {
    expect(dueToDate(rows, '2026-01-07')).toBe(100_000)
    expect(nextFinanceDue(rows, '2026-01-07')).toBe('2026-01-08')
  })

  it('owes the whole price after the last instalment', () => {
    expect(dueToDate(rows, '2026-03-01')).toBe(190_001)
    expect(nextFinanceDue(rows, '2026-03-01')).toBeNull()
  })

  it('marks rows paid, part paid, overdue or upcoming with partial payments', () => {
    const states = scheduleWithState(rows, 145_000, '2026-01-16').map((r) => [r.state, r.paidCents])
    expect(states).toEqual([['paid', 100_000], ['paid', 30_000], ['overdue', 15_000], ['upcoming', 0]])
    expect(scheduleWithState(rows, 145_000, '2026-01-10')[2]!.state).toBe('part_paid')
  })
})
