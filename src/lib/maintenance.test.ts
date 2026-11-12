import { describe, expect, it } from 'vitest'
import { addMonths, checkReading, maintenanceDue } from './maintenance'

const base = { createdOn: '2026-01-01', interval: { km: 10_000, months: 6 } }

describe('addMonths', () => {
  it('keeps the day, clamping to the end of shorter months', () => {
    expect(addMonths('2026-01-15', 6)).toBe('2026-07-15')
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29')
  })
})

describe('maintenanceDue', () => {
  it('asks for an interval when none is set', () => {
    const due = maintenanceDue({ ...base, interval: { km: null, months: null }, lastService: null, readings: [], today: '2026-02-01' })
    expect(due.state).toBe('no_interval')
    expect(due.nextDueOn).toBeNull()
  })

  it('counts from the last service', () => {
    const due = maintenanceDue({
      ...base,
      lastService: { servicedOn: '2026-03-01', km: 100_000 },
      readings: [{ readOn: '2026-03-01', km: 100_000 }, { readOn: '2026-04-01', km: 103_000 }],
      today: '2026-04-02',
    })
    expect(due).toMatchObject({ state: 'ok', nextDueOn: '2026-09-01', nextDueKm: 110_000, daysLeft: 152, kmLeft: 7_000 })
  })

  it('is due by date before km', () => {
    const due = maintenanceDue({
      ...base,
      lastService: { servicedOn: '2026-01-10', km: 50_000 },
      readings: [{ readOn: '2026-06-20', km: 52_000 }],
      today: '2026-06-25',
    })
    expect(due).toMatchObject({ state: 'due_soon', nextDueOn: '2026-07-10', daysLeft: 15, kmLeft: 8_000 })
  })

  it('is due by km before date', () => {
    const due = maintenanceDue({
      ...base,
      lastService: { servicedOn: '2026-05-01', km: 50_000 },
      readings: [{ readOn: '2026-06-01', km: 59_500 }],
      today: '2026-06-02',
    })
    expect(due).toMatchObject({ state: 'due_soon', kmLeft: 500, daysLeft: 152 })
  })

  it('is overdue once either measure has passed', () => {
    const due = maintenanceDue({
      ...base,
      lastService: { servicedOn: '2026-05-01', km: 50_000 },
      readings: [{ readOn: '2026-06-01', km: 60_200 }],
      today: '2026-06-02',
    })
    expect(due).toMatchObject({ state: 'overdue', kmLeft: -200 })
  })

  it('with no service yet, counts from the first reading', () => {
    const due = maintenanceDue({
      ...base,
      lastService: null,
      readings: [{ readOn: '2026-02-01', km: 80_000 }, { readOn: '2026-02-08', km: 80_700 }],
      today: '2026-02-09',
    })
    expect(due).toMatchObject({ nextDueOn: '2026-08-01', nextDueKm: 90_000, kmLeft: 9_300, latest: { km: 80_700 } })
  })

  it('with no service and no reading, only the date counts, from when the car was added', () => {
    const due = maintenanceDue({ ...base, lastService: null, readings: [], today: '2026-02-01' })
    expect(due).toMatchObject({ state: 'ok', nextDueOn: '2026-07-01', nextDueKm: null, kmLeft: null })
  })

  it('works with only a km interval or only a months interval', () => {
    const reading = { readOn: '2026-02-01', km: 1_000 }
    expect(maintenanceDue({ ...base, interval: { km: 5_000, months: null }, lastService: null, readings: [reading], today: '2027-06-01' }))
      .toMatchObject({ state: 'ok', nextDueOn: null, nextDueKm: 6_000 })
    expect(maintenanceDue({ ...base, interval: { km: null, months: 12 }, lastService: null, readings: [reading], today: '2027-06-01' }))
      .toMatchObject({ state: 'overdue', nextDueOn: '2027-02-01', nextDueKm: null })
  })

  it('estimates the km when the latest reading is old', () => {
    // 1,000 km in the 20 days before the latest reading = 50 km/day; 30 days since.
    const due = maintenanceDue({
      ...base,
      lastService: { servicedOn: '2026-01-01', km: 40_000 },
      readings: [
        { readOn: '2026-01-01', km: 40_000 }, // older than the 60-day window: ignored
        { readOn: '2026-03-12', km: 47_000 },
        { readOn: '2026-04-01', km: 48_000 },
      ],
      today: '2026-05-01',
    })
    expect(due).toMatchObject({ kmPerDay: 50, estimatedKm: 49_500, kmLeft: 500, kmEstimated: true, state: 'due_soon' })
  })

  it('does not estimate from a recent reading or a single reading', () => {
    const recent = maintenanceDue({
      ...base,
      lastService: null,
      readings: [{ readOn: '2026-03-01', km: 1_000 }, { readOn: '2026-03-20', km: 2_000 }],
      today: '2026-03-22',
    })
    expect(recent).toMatchObject({ estimatedKm: null, kmEstimated: false, kmLeft: 9_000 })
    const single = maintenanceDue({ ...base, lastService: null, readings: [{ readOn: '2026-01-01', km: 1_000 }], today: '2026-03-22' })
    expect(single).toMatchObject({ estimatedKm: null, kmLeft: 10_000 })
  })

  it('uses a correction as the latest reading even though it is lower', () => {
    const due = maintenanceDue({
      ...base,
      lastService: { servicedOn: '2026-01-01', km: 40_000 },
      readings: [{ readOn: '2026-02-01', km: 49_000 }, { readOn: '2026-02-02', km: 44_000 }],
      today: '2026-02-03',
    })
    expect(due).toMatchObject({ latest: { km: 44_000 }, kmLeft: 6_000, estimatedKm: null })
  })
})

describe('checkReading', () => {
  const readings = [{ readOn: '2026-02-01', km: 10_000 }, { readOn: '2026-03-01', km: 12_000 }]

  it('accepts a reading in order', () => {
    expect(checkReading(readings, { readOn: '2026-03-10', km: 12_500 })).toBe('ok')
    expect(checkReading(readings, { readOn: '2026-02-15', km: 11_000 })).toBe('ok')
    expect(checkReading([], { readOn: '2026-02-15', km: 0 })).toBe('ok')
  })

  it('flags a reading lower than an earlier one', () => {
    expect(checkReading(readings, { readOn: '2026-03-10', km: 11_999 })).toBe('lower_than_earlier')
  })

  it('flags a back-dated reading higher than a later one', () => {
    expect(checkReading(readings, { readOn: '2026-02-15', km: 12_100 })).toBe('higher_than_later')
  })
})
