import { beforeEach, describe, expect, it } from 'vitest'
import {
  carInputSchema, customerInputSchema, newCarInputSchema, odometerReadingInputSchema, serviceInputSchema, startRentalInputSchema,
} from '~/lib/schemas'
import { db } from './db.server'
import { getCar, insertCar, updateCar } from './cars.server'
import { insertCustomer } from './customers.server'
import { ledgerTotals, transactionsForCar } from './transactions.server'
import { startRental } from './rentals.server'
import {
  deleteReading, deleteService, dueSoonList, getMaintenance, recordReading, recordService, setServiceInterval,
} from './maintenance.server'

const TODAY = '2026-06-01'
const car = (purpose: 'rental' | 'sale' = 'rental', plate = 'R1', mileageKm: number | '' = '') =>
  insertCar(newCarInputSchema.parse({ purpose, status: 'ready', plate, make: 'Toyota', model: 'Corolla', mileageKm }))
const reading = (carId: number, readOn: string, km: number, extra: Record<string, unknown> = {}) =>
  recordReading(carId, odometerReadingInputSchema.parse({ readOn, km, ...extra }), TODAY)
const service = (carId: number, servicedOn: string, km: number, extra: Record<string, unknown> = {}) =>
  recordService(carId, serviceInputSchema.parse({ servicedOn, km, description: 'Oil and filter', cost: '180', method: 'card', ...extra }), TODAY)

beforeEach(() => {
  db.exec(`DELETE FROM odometer_readings; DELETE FROM services; DELETE FROM rental_rent_rates; DELETE FROM transactions;
           DELETE FROM rentals; DELETE FROM cars; DELETE FROM customers`)
})

describe('odometer readings', () => {
  it('keeps the history and caches the latest as the odometer', () => {
    const carId = car()
    expect(reading(carId, '2026-05-01', 100_000)).toMatchObject({ ok: true })
    expect(reading(carId, '2026-05-20', 101_500)).toMatchObject({ ok: true })
    // A back-dated reading that fits doesn't move the odometer.
    expect(reading(carId, '2026-05-10', 100_700)).toMatchObject({ ok: true })
    expect(getCar(carId)?.mileageKm).toBe(101_500)
    expect(getMaintenance(carId, TODAY)!.readings.map((r) => r.km)).toEqual([101_500, 100_700, 100_000])
  })

  it('rejects a reading lower than the previous one unless it is a correction', () => {
    const carId = car()
    reading(carId, '2026-05-01', 100_000)
    expect(reading(carId, '2026-05-02', 10_000)).toEqual({ ok: false, reason: 'lower_than_earlier' })
    expect(getCar(carId)?.mileageKm).toBe(100_000)
    expect(reading(carId, '2026-05-02', 10_000, { correction: 'on' })).toMatchObject({ ok: true })
    expect(getCar(carId)?.mileageKm).toBe(10_000)
  })

  it('rejects future dates and sale cars', () => {
    expect(reading(car(), '2026-06-02', 1)).toEqual({ ok: false, reason: 'future' })
    expect(reading(car('sale', 'S1'), '2026-05-01', 1)).toEqual({ ok: false, reason: 'not_rental' })
    expect(reading(999, '2026-05-01', 1)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('links a reading to the rental the car is on', () => {
    const carId = car()
    const customerId = insertCustomer(customerInputSchema.parse({ firstName: 'Ana', phone: '0400 000 000' }))
    const rental = startRental(startRentalInputSchema.parse({ carId, customerId, startDate: '2026-05-01', weeklyRent: '200' }))
    if (!rental.ok) throw new Error(rental.reason)
    reading(carId, '2026-05-15', 50_000)
    expect(getMaintenance(carId, TODAY)!.readings[0]).toMatchObject({ rentalId: rental.id })
  })

  it('deleting a reading puts the odometer back', () => {
    const carId = car()
    reading(carId, '2026-05-01', 100_000)
    const typo = reading(carId, '2026-05-02', 190_000)
    if (!typo.ok) throw new Error(typo.reason)
    expect(deleteReading(typo.id)).toBe('ok')
    expect(getCar(carId)?.mileageKm).toBe(100_000)
  })

  it("a new rental car's odometer becomes its first reading", () => {
    const carId = car('rental', 'R2', 42_000)
    expect(getMaintenance(carId, TODAY)!.readings).toMatchObject([{ km: 42_000 }])
  })
})

describe('services', () => {
  it('writes the service, its reading and the expense together', () => {
    const carId = car()
    setServiceInterval(carId, { km: 10_000, months: 6 })
    expect(service(carId, '2026-05-01', 80_000)).toMatchObject({ ok: true })
    const { services, readings, due } = getMaintenance(carId, TODAY)!
    expect(services).toMatchObject([{ servicedOn: '2026-05-01', km: 80_000, description: 'Oil and filter', costCents: 18_000 }])
    expect(readings).toMatchObject([{ km: 80_000, serviceId: services[0]!.id }])
    expect(transactionsForCar(carId)).toMatchObject([{ category: 'expense', amountCents: 18_000, method: 'card', occurredOn: '2026-05-01' }])
    expect(ledgerTotals({ car: carId }, TODAY).expensesCents).toBe(18_000)
    expect(getCar(carId)?.mileageKm).toBe(80_000)
    expect(due).toMatchObject({ nextDueOn: '2026-11-01', nextDueKm: 90_000 })
  })

  it('a free service writes no expense', () => {
    const carId = car()
    service(carId, '2026-05-01', 80_000, { cost: '' })
    expect(transactionsForCar(carId)).toEqual([])
  })

  it('checks the odometer like a reading, and writes nothing when rejected', () => {
    const carId = car()
    reading(carId, '2026-05-01', 100_000)
    expect(service(carId, '2026-05-02', 99_000)).toEqual({ ok: false, reason: 'lower_than_earlier' })
    expect(getMaintenance(carId, TODAY)!.services).toEqual([])
    expect(transactionsForCar(carId)).toEqual([])
  })

  it('deleting a service removes its reading and expense', () => {
    const carId = car()
    reading(carId, '2026-04-01', 70_000)
    const done = service(carId, '2026-05-01', 80_000)
    if (!done.ok) throw new Error(done.reason)
    expect(deleteService(done.id)).toBe('ok')
    expect(getMaintenance(carId, TODAY)).toMatchObject({ services: [], readings: [{ km: 70_000 }] })
    expect(transactionsForCar(carId)).toEqual([])
    expect(getCar(carId)?.mileageKm).toBe(70_000)
  })

  it('a reading made by a service is deleted with the service, not on its own', () => {
    const carId = car()
    const done = service(carId, '2026-05-01', 80_000)
    if (!done.ok) throw new Error(done.reason)
    const [r] = getMaintenance(carId, TODAY)!.readings
    expect(deleteReading(r!.id)).toBe('from_service')
  })
})

describe('service details on the car', () => {
  it('keeps the odometer and service fields for rental cars out of the Specifications form', () => {
    const carId = car()
    reading(carId, '2026-05-01', 100_000)
    updateCar(carId, carInputSchema.parse({
      plate: 'R1', make: 'Toyota', model: 'Corolla', mileageKm: '5', nextServiceKm: '7', nextServiceDate: '2026-01-01',
    }))
    expect(getCar(carId)).toMatchObject({ mileageKm: 100_000, nextServiceKm: null, nextServiceDate: null })
  })
})

describe('due-soon list', () => {
  it('lists rental cars that are overdue or due soon, with the renter, most urgent first', () => {
    const due = car('rental', 'DUE')
    setServiceInterval(due, { km: 10_000, months: 12 })
    service(due, '2026-01-01', 50_000)
    reading(due, '2026-05-30', 59_400) // 600 km left

    const late = car('rental', 'LATE')
    setServiceInterval(late, { km: null, months: 3 })
    service(late, '2026-01-01', 10_000) // due 1 Apr

    const fine = car('rental', 'FINE')
    setServiceInterval(fine, { km: 10_000, months: 12 })
    service(fine, '2026-05-01', 1_000)

    const unset = car('rental', 'UNSET')
    car('sale', 'SALE')

    const customerId = insertCustomer(customerInputSchema.parse({ firstName: 'Ana', lastName: 'Lee', phone: '0400 111 222' }))
    startRental(startRentalInputSchema.parse({ carId: due, customerId, startDate: '2026-05-01', weeklyRent: '200' }))

    const list = dueSoonList(TODAY, 'due')
    expect(list.map((c) => [c.plate, c.due.state])).toEqual([['LATE', 'overdue'], ['DUE', 'due_soon']])
    expect(list[1]).toMatchObject({ renterName: 'Ana Lee', renterPhone: '0400 111 222' })
    expect(dueSoonList(TODAY, 'all').map((c) => c.plate)).toEqual(['LATE', 'DUE', 'UNSET', 'FINE'])
    expect(unset).toBeGreaterThan(0)
  })
})

describe('service interval', () => {
  it('is only for rental cars', () => {
    expect(setServiceInterval(car('sale', 'S1'), { km: 10_000, months: 6 })).toBe('not_rental')
    expect(setServiceInterval(999, { km: 10_000, months: 6 })).toBe('not_found')
    const carId = car()
    expect(setServiceInterval(carId, { km: 15_000, months: null })).toBe('ok')
    expect(getMaintenance(carId, TODAY)!.interval).toEqual({ km: 15_000, months: null })
  })
})
