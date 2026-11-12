import { describe, expect, it } from 'vitest'
import { dueDates, nextDueDate, rateOn, rentDue, settle, weeksBehind } from './rent'

const rates = [{ effectiveFrom: '2026-01-01', weeklyCents: 20000 }]

describe('rent due to date', () => {
  it('makes the first week due on the start date', () => {
    expect(rentDue(rates, '2026-01-01', '2026-01-01')).toBe(20000)
    expect(rentDue(rates, '2026-01-01', '2026-01-07')).toBe(20000)
    expect(rentDue(rates, '2026-01-01', '2026-01-08')).toBe(40000)
  })

  it('owes nothing before a future start date', () => {
    expect(rentDue(rates, '2026-02-01', '2026-01-20')).toBe(0)
    expect(nextDueDate('2026-02-01', '2026-01-20')).toBe('2026-02-01')
  })

  it('charges each week at the rate in effect on its due date', () => {
    const changed = [...rates, { effectiveFrom: '2026-01-10', weeklyCents: 25000 }]
    // Weeks due 1 Jan, 8 Jan (old rate), 15 Jan (new rate).
    expect(rentDue(changed, '2026-01-01', '2026-01-15')).toBe(65000)
    expect(rateOn(changed, '2026-01-09')).toBe(20000)
    expect(rateOn(changed, '2026-01-10')).toBe(25000)
  })

  it('treats a rate starting on a due day as applying to that week', () => {
    const changed = [...rates, { effectiveFrom: '2026-01-08', weeklyCents: 25000 }]
    expect(rentDue(changed, '2026-01-01', '2026-01-08')).toBe(45000)
  })

  it('stops new weeks falling due at Return, without pro-rating', () => {
    // Returned mid-week 2: weeks 1 Jan and 8 Jan are due, 15 Jan is not.
    expect(dueDates('2026-01-01', '2026-02-01', '2026-01-11')).toEqual(['2026-01-01', '2026-01-08'])
    // Returned exactly on a due day: that week doesn't fall due.
    expect(dueDates('2026-01-01', '2026-02-01', '2026-01-15')).toEqual(['2026-01-01', '2026-01-08'])
    // Returned on the start date: the first week was still due at handover.
    expect(rentDue(rates, '2026-01-01', '2026-02-01', '2026-01-01')).toBe(20000)
    expect(nextDueDate('2026-01-01', '2026-02-01', '2026-01-11')).toBeNull()
  })

  it('finds the next due date', () => {
    expect(nextDueDate('2026-01-01', '2026-01-01')).toBe('2026-01-08')
    expect(nextDueDate('2026-01-01', '2026-01-07')).toBe('2026-01-08')
    expect(nextDueDate('2026-01-01', '2026-01-08')).toBe('2026-01-15')
  })
})

describe('weeks behind', () => {
  it('rounds up and is 0 when nothing is owed', () => {
    expect(weeksBehind(0, 20000)).toBe(0)
    expect(weeksBehind(-5000, 20000)).toBe(0)
    expect(weeksBehind(1, 20000)).toBe(1)
    expect(weeksBehind(40000, 20000)).toBe(2)
    expect(weeksBehind(40001, 20000)).toBe(3)
  })
})

describe('bond settlement', () => {
  it('refunds what the deductions leave', () => {
    expect(settle(100000, 30000)).toEqual({ appliedCents: 30000, refundCents: 70000, shortfallCents: 0 })
  })
  it('settles exactly at zero', () => {
    expect(settle(100000, 100000)).toEqual({ appliedCents: 100000, refundCents: 0, shortfallCents: 0 })
  })
  it('leaves a shortfall when deductions exceed the bond', () => {
    expect(settle(100000, 130000)).toEqual({ appliedCents: 100000, refundCents: 0, shortfallCents: 30000 })
  })
})
