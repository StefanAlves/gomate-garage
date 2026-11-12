import { beforeEach, describe, expect, it } from 'vitest'
import { chargeInputSchema, customerInputSchema, newCarInputSchema, startRentalInputSchema } from '~/lib/schemas'
import { db } from './db.server'
import { getCar, insertCar } from './cars.server'
import { insertCharge } from './charges.server'
import { insertCustomer } from './customers.server'
import { ledgerTotals } from './transactions.server'
import {
  adjustRent, getRental, listRentals, recordRentPayment, rentalsForCar, rentalsForCustomer, returnRental,
  settlementPreview, startRental,
} from './rentals.server'

const car = (purpose: 'rental' | 'sale', plate: string, status: 'preparation' | 'ready' = 'ready') =>
  insertCar(newCarInputSchema.parse({ purpose, status, plate, make: 'Toyota', model: 'Corolla' }))
const customer = (firstName = 'Ana') => insertCustomer(customerInputSchema.parse({ firstName, phone: '0400 000 000' }))
const start = (values: Record<string, unknown>) =>
  startRental(startRentalInputSchema.parse({ startDate: '2026-01-01', weeklyRent: '200', bond: '1000', bondMethod: 'cash', ...values }))
const payment = (id: number, paidOn: string, amount: string) => recordRentPayment(id, { paidOn, amount: Number(amount), method: 'cash', notes: null })
const fine = (values: Record<string, unknown>) => insertCharge(chargeInputSchema.parse({ kind: 'fine', ...values }))
const started = (outcome: ReturnType<typeof startRental>) => {
  if (!outcome.ok) throw new Error(outcome.reason)
  return outcome.id
}

beforeEach(() => {
  db.exec(`DELETE FROM rental_deductions; DELETE FROM rental_rent_rates; DELETE FROM transactions; DELETE FROM rentals;
           DELETE FROM charges; DELETE FROM customer_documents; DELETE FROM cars; DELETE FROM customers`)
})

describe('starting a rental', () => {
  it('records the rental, its rent, the bond, and marks the car Rented', () => {
    const carId = car('rental', 'R1')
    const customerId = customer()
    const id = started(start({ carId, customerId }))
    expect(getCar(carId)?.status).toBe('rented')
    const { rental, rates, payments } = getRental(id, '2026-01-01')!
    expect(rental).toMatchObject({ status: 'active', bondCents: 100000, bondHeldCents: 100000, weeklyCents: 20000 })
    expect(rates).toEqual([{ effectiveFrom: '2026-01-01', weeklyCents: 20000 }])
    expect(payments).toMatchObject([{ category: 'bond_received', amountCents: 100000, method: 'cash' }])
  })

  it('creates a walk-in customer in the same step', () => {
    const carId = car('rental', 'R1')
    const id = started(start({ carId, customerMode: 'new', firstName: 'Walk', lastName: 'In', phone: '0411 111 111' }))
    expect(getRental(id, '2026-01-01')!.rental.customerName).toBe('Walk In')
  })

  it('needs a customer', () => {
    const parsed = startRentalInputSchema.safeParse({ carId: 1, startDate: '2026-01-01', weeklyRent: '200' })
    expect(parsed.success).toBe(false)
    const walkIn = startRentalInputSchema.safeParse({ carId: 1, customerMode: 'new', startDate: '2026-01-01', weeklyRent: '200' })
    expect(walkIn.success).toBe(false)
  })

  it('refuses a car that is not Ready, a sale car, or one already rented', () => {
    const customerId = customer()
    expect(start({ carId: car('rental', 'R1', 'preparation'), customerId })).toEqual({ ok: false, reason: 'car_not_available' })
    expect(start({ carId: car('sale', 'S1'), customerId })).toEqual({ ok: false, reason: 'car_not_available' })
    const carId = car('rental', 'R2')
    started(start({ carId, customerId }))
    expect(start({ carId, customerId })).toEqual({ ok: false, reason: 'car_not_available' })
    // The database itself allows only one active rental per car.
    expect(() => db.prepare(`INSERT INTO rentals (customer_id, car_id, start_date) VALUES (?, ?, '2026-01-01')`).run(customerId, carId))
      .toThrow(/UNIQUE/)
  })

  it('does nothing when the customer is missing', () => {
    const carId = car('rental', 'R1')
    expect(start({ carId, customerId: 999 })).toEqual({ ok: false, reason: 'customer_not_found' })
    expect(getCar(carId)?.status).toBe('ready')
  })

  it('lets a customer hold more than one rental', () => {
    const customerId = customer()
    started(start({ carId: car('rental', 'R1'), customerId }))
    started(start({ carId: car('rental', 'R2'), customerId }))
    expect(rentalsForCustomer(customerId, '2026-01-01')).toHaveLength(2)
  })
})

describe('rent and arrears', () => {
  it('works out arrears from rent due and payments of any amount', () => {
    const id = started(start({ carId: car('rental', 'R1'), customerId: customer() }))
    // Due 1 Jan and 8 Jan = $400; paid $250.
    payment(id, '2026-01-01', '200')
    payment(id, '2026-01-09', '50')
    const { rental } = getRental(id, '2026-01-10')!
    expect(rental).toMatchObject({ rentDueCents: 40000, rentPaidCents: 25000, arrearsCents: 15000, owedCents: 15000, weeksBehind: 1, nextDueOn: '2026-01-15' })
  })

  it('applies a rent change from its date only', () => {
    const id = started(start({ carId: car('rental', 'R1'), customerId: customer() }))
    expect(adjustRent(id, { effectiveFrom: '2026-01-15', weeklyRent: 250 })).toBe('ok')
    expect(adjustRent(id, { effectiveFrom: '2025-12-01', weeklyRent: 250 })).toBe('before_start')
    const { rental, rates } = getRental(id, '2026-01-15')!
    expect(rates).toHaveLength(2)
    expect(rental.rentDueCents).toBe(20000 + 20000 + 25000)
    expect(rental.weeklyCents).toBe(25000)
  })

  it('lists active rentals with the furthest behind first, and filters to those behind', () => {
    const a = started(start({ carId: car('rental', 'R1'), customerId: customer('Ana') }))
    const b = started(start({ carId: car('rental', 'R2'), customerId: customer('Bo') }))
    payment(a, '2026-01-01', '400')
    payment(b, '2026-01-01', '100')
    const search = { status: 'active', show: 'all', sort: 'arrears' } as const
    expect(listRentals(search, '2026-01-08').map((r) => r.customerName)).toEqual(['Bo', 'Ana'])
    expect(listRentals({ ...search, show: 'behind' }, '2026-01-08').map((r) => r.customerName)).toEqual(['Bo'])
  })
})

describe('return and bond settlement', () => {
  function setup() {
    const carId = car('rental', 'R1')
    const customerId = customer()
    const id = started(start({ carId, customerId }))
    return { carId, customerId, id }
  }

  it('suggests arrears and the fines and tolls from the rental period', () => {
    const { carId, customerId, id } = setup()
    payment(id, '2026-01-01', '200')
    const inside = fine({ carId, customerId, incurredOn: '2026-01-05', amount: '150', offenceType: 'Speeding' })
    const unassigned = fine({ carId, incurredOn: '2026-01-06', amount: '80' })
    fine({ carId, customerId, incurredOn: '2025-12-20', amount: '99' }) // before the rental
    fine({ carId, customerId, incurredOn: '2026-01-07', amount: '60', status: 'transferred' })
    const preview = settlementPreview(id, '2026-01-10')
    if (typeof preview === 'string') throw new Error(preview)
    expect(preview.rentArrearsCents).toBe(20000)
    expect(preview.bondHeldCents).toBe(100000)
    expect(preview.charges.map((c) => c.id)).toEqual([inside, unassigned])
  })

  it('refunds the rest of the bond, marks charges paid and puts the car in Preparation', () => {
    const { carId, customerId, id } = setup()
    payment(id, '2026-01-01', '200')
    const f = fine({ carId, incurredOn: '2026-01-05', amount: '150' })
    const out = returnRental(id, {
      returnedOn: '2026-01-10', reason: null, chargeIds: [f], refundMethod: 'bank_transfer',
      extras: [{ kind: 'damage', description: 'Scratched bumper', amount: 100 }],
    })
    // Deductions: arrears $200 + fine $150 + damage $100 = $450 of a $1,000 bond.
    expect(out).toEqual({ ok: true, appliedCents: 45000, refundCents: 55000, shortfallCents: 0 })
    expect(getCar(carId)?.status).toBe('preparation')
    const fineRow = db.prepare('SELECT status, customer_id AS customerId FROM charges WHERE id = ?').get(f)
    expect(fineRow).toEqual({ status: 'paid_by_customer', customerId })
    const { rental, payments, deductions } = getRental(id, '2026-03-01')!
    expect(rental).toMatchObject({ status: 'returned', returnedOn: '2026-01-10', bondHeldCents: 0, owedCents: 0, nextDueOn: null })
    expect(deductions.map((d) => [d.kind, d.amountCents])).toEqual([['rent_arrears', 20000], ['fine', 15000], ['damage', 10000]])
    expect(payments.filter((p) => p.category !== 'rental_income').map((p) => [p.category, p.amountCents]).sort())
      .toEqual([['bond_applied', 45000], ['bond_received', 100000], ['bond_returned', 55000]])
    // The kept bond is income; the car is free to rent again.
    const totals = ledgerTotals({ car: carId }, '2026-03-01')
    expect(totals).toMatchObject({ bondHeldCents: 0, bondAppliedCents: 45000, pnlCents: 20000 + 45000 })
    expect(start({ carId, customerId }).ok).toBe(false) // car is in Preparation now
  })

  it('settles exactly to zero', () => {
    const { id } = setup()
    payment(id, '2026-01-01', '200')
    const out = returnRental(id, { returnedOn: '2026-01-05', reason: null, chargeIds: [], refundMethod: null,
      extras: [{ kind: 'damage', description: 'Windscreen', amount: 1000 }] })
    expect(out).toEqual({ ok: true, appliedCents: 100000, refundCents: 0, shortfallCents: 0 })
    expect(getRental(id, '2026-02-01')!.rental.owedCents).toBe(0)
  })

  it('keeps a shortfall owed after return until it is paid', () => {
    const { carId, id } = setup()
    // Nothing paid; returned on 20 Jan for non-payment: 3 weeks due = $600, plus $700 damage.
    const out = returnRental(id, { returnedOn: '2026-01-20', reason: 'Stopped paying', chargeIds: [], refundMethod: null,
      extras: [{ kind: 'damage', description: 'Panel repair', amount: 700 }] })
    expect(out).toEqual({ ok: true, appliedCents: 100000, refundCents: 0, shortfallCents: 30000 })
    expect(getRental(id, '2026-03-01')!.rental).toMatchObject({ owedCents: 30000, returnReason: 'Stopped paying' })
    expect(listRentals({ status: 'returned', show: 'behind', sort: 'arrears' }, '2026-03-01')).toHaveLength(1)
    payment(id, '2026-02-01', '300')
    expect(getRental(id, '2026-03-01')!.rental.owedCents).toBe(0)
    expect(rentalsForCar(carId, '2026-03-01')[0]!.status).toBe('returned')
  })

  it('cannot return twice or before the start', () => {
    const { id } = setup()
    const values = { reason: null, chargeIds: [], extras: [], refundMethod: null }
    expect(returnRental(id, { ...values, returnedOn: '2025-12-31' })).toEqual({ ok: false, reason: 'before_start' })
    expect(returnRental(id, { ...values, returnedOn: '2026-01-02' }).ok).toBe(true)
    expect(returnRental(id, { ...values, returnedOn: '2026-01-03' })).toEqual({ ok: false, reason: 'not_active' })
  })
})
