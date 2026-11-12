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

beforeEach(async () => {
  await db.exec(`DELETE FROM odometer_readings; DELETE FROM services; DELETE FROM rental_rent_rates; DELETE FROM transactions;
           DELETE FROM rentals; DELETE FROM cars; DELETE FROM customers`)
})

describe('odometer readings', () => {
  it('keeps the history and caches the latest as the odometer', async () => {
    const carId = await car()
    expect(await reading(carId, '2026-05-01', 100_000)).toMatchObject({ ok: true })
    expect(await reading(carId, '2026-05-20', 101_500)).toMatchObject({ ok: true })
    // A back-dated reading that fits doesn't move the odometer.
    expect(await reading(carId, '2026-05-10', 100_700)).toMatchObject({ ok: true })
    expect((await getCar(carId))?.mileageKm).toBe(101_500)
    expect((await getMaintenance(carId, TODAY))!.readings.map((r) => r.km)).toEqual([101_500, 100_700, 100_000])
  })

  it('rejects a reading lower than the previous one unless it is a correction', async () => {
    const carId = await car()
    await reading(carId, '2026-05-01', 100_000)
    expect(await reading(carId, '2026-05-02', 10_000)).toEqual({ ok: false, reason: 'lower_than_earlier' })
    expect((await getCar(carId))?.mileageKm).toBe(100_000)
    expect(await reading(carId, '2026-05-02', 10_000, { correction: 'on' })).toMatchObject({ ok: true })
    expect((await getCar(carId))?.mileageKm).toBe(10_000)
  })

  it('rejects future dates and sale cars', async () => {
    expect(await reading(await car(), '2026-06-02', 1)).toEqual({ ok: false, reason: 'future' })
    expect(await reading(await car('sale', 'S1'), '2026-05-01', 1)).toEqual({ ok: false, reason: 'not_rental' })
    expect(await reading(999, '2026-05-01', 1)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('links a reading to the rental the car is on', async () => {
    const carId = await car()
    const customerId = await insertCustomer(customerInputSchema.parse({ firstName: 'Ana', phone: '0400 000 000' }))
    const rental = await startRental(startRentalInputSchema.parse({ carId, customerId, startDate: '2026-05-01', weeklyRent: '200' }))
    if (!rental.ok) throw new Error(rental.reason)
    await reading(carId, '2026-05-15', 50_000)
    expect((await getMaintenance(carId, TODAY))!.readings[0]).toMatchObject({ rentalId: rental.id })
  })

  it('deleting a reading puts the odometer back', async () => {
    const carId = await car()
    await reading(carId, '2026-05-01', 100_000)
    const typo = await reading(carId, '2026-05-02', 190_000)
    if (!typo.ok) throw new Error(typo.reason)
    expect(await deleteReading(typo.id)).toBe('ok')
    expect((await getCar(carId))?.mileageKm).toBe(100_000)
  })

  it("a new rental car's odometer becomes its first reading", async () => {
    const carId = await car('rental', 'R2', 42_000)
    expect((await getMaintenance(carId, TODAY))!.readings).toMatchObject([{ km: 42_000 }])
  })
})

describe('services', () => {
  it('writes the service, its reading and the expense together', async () => {
    const carId = await car()
    await setServiceInterval(carId, { km: 10_000, months: 6 })
    expect(await service(carId, '2026-05-01', 80_000)).toMatchObject({ ok: true })
    const { services, readings, due } = (await getMaintenance(carId, TODAY))!
    expect(services).toMatchObject([{ servicedOn: '2026-05-01', km: 80_000, description: 'Oil and filter', costCents: 18_000 }])
    expect(readings).toMatchObject([{ km: 80_000, serviceId: services[0]!.id }])
    expect(await transactionsForCar(carId)).toMatchObject([{ category: 'expense', amountCents: 18_000, method: 'card', occurredOn: '2026-05-01' }])
    expect((await ledgerTotals({ car: carId }, TODAY)).expensesCents).toBe(18_000)
    expect((await getCar(carId))?.mileageKm).toBe(80_000)
    expect(due).toMatchObject({ nextDueOn: '2026-11-01', nextDueKm: 90_000 })
  })

  it('a free service writes no expense', async () => {
    const carId = await car()
    await service(carId, '2026-05-01', 80_000, { cost: '' })
    expect(await transactionsForCar(carId)).toEqual([])
  })

  it('checks the odometer like a reading, and writes nothing when rejected', async () => {
    const carId = await car()
    await reading(carId, '2026-05-01', 100_000)
    expect(await service(carId, '2026-05-02', 99_000)).toEqual({ ok: false, reason: 'lower_than_earlier' })
    expect((await getMaintenance(carId, TODAY))!.services).toEqual([])
    expect(await transactionsForCar(carId)).toEqual([])
  })

  it('deleting a service removes its reading and expense', async () => {
    const carId = await car()
    await reading(carId, '2026-04-01', 70_000)
    const done = await service(carId, '2026-05-01', 80_000)
    if (!done.ok) throw new Error(done.reason)
    expect(await deleteService(done.id)).toBe('ok')
    expect(await getMaintenance(carId, TODAY)).toMatchObject({ services: [], readings: [{ km: 70_000 }] })
    expect(await transactionsForCar(carId)).toEqual([])
    expect((await getCar(carId))?.mileageKm).toBe(70_000)
  })

  it('a reading made by a service is deleted with the service, not on its own', async () => {
    const carId = await car()
    const done = await service(carId, '2026-05-01', 80_000)
    if (!done.ok) throw new Error(done.reason)
    const [r] = (await getMaintenance(carId, TODAY))!.readings
    expect(await deleteReading(r!.id)).toBe('from_service')
  })
})

describe('service details on the car', () => {
  it('keeps the odometer and service fields for rental cars out of the Specifications form', async () => {
    const carId = await car()
    await reading(carId, '2026-05-01', 100_000)
    await updateCar(carId, carInputSchema.parse({
      plate: 'R1', make: 'Toyota', model: 'Corolla', mileageKm: '5', nextServiceKm: '7', nextServiceDate: '2026-01-01',
    }))
    expect(await getCar(carId)).toMatchObject({ mileageKm: 100_000, nextServiceKm: null, nextServiceDate: null })
  })
})

describe('due-soon list', () => {
  it('lists rental cars that are overdue or due soon, with the renter, most urgent first', async () => {
    const due = await car('rental', 'DUE')
    await setServiceInterval(due, { km: 10_000, months: 12 })
    await service(due, '2026-01-01', 50_000)
    await reading(due, '2026-05-30', 59_400) // 600 km left

    const late = await car('rental', 'LATE')
    await setServiceInterval(late, { km: null, months: 3 })
    await service(late, '2026-01-01', 10_000) // due 1 Apr

    const fine = await car('rental', 'FINE')
    await setServiceInterval(fine, { km: 10_000, months: 12 })
    await service(fine, '2026-05-01', 1_000)

    const unset = await car('rental', 'UNSET')
    await car('sale', 'SALE')

    const customerId = await insertCustomer(customerInputSchema.parse({ firstName: 'Ana', lastName: 'Lee', phone: '0400 111 222' }))
    await startRental(startRentalInputSchema.parse({ carId: due, customerId, startDate: '2026-05-01', weeklyRent: '200' }))

    const list = await dueSoonList(TODAY, 'due')
    expect(list.map((c) => [c.plate, c.due.state])).toEqual([['LATE', 'overdue'], ['DUE', 'due_soon']])
    expect(list[1]).toMatchObject({ renterName: 'Ana Lee', renterPhone: '0400 111 222' })
    expect((await dueSoonList(TODAY, 'all')).map((c) => c.plate)).toEqual(['LATE', 'DUE', 'UNSET', 'FINE'])
    expect(unset).toBeGreaterThan(0)
  })
})

describe('service interval', () => {
  it('is only for rental cars', async () => {
    expect(await setServiceInterval(await car('sale', 'S1'), { km: 10_000, months: 6 })).toBe('not_rental')
    expect(await setServiceInterval(999, { km: 10_000, months: 6 })).toBe('not_found')
    const carId = await car()
    expect(await setServiceInterval(carId, { km: 15_000, months: null })).toBe('ok')
    expect((await getMaintenance(carId, TODAY))!.interval).toEqual({ km: 15_000, months: null })
  })
})
