import { beforeEach, describe, expect, it } from 'vitest'
import { newCarInputSchema, carStockInputSchema } from '~/lib/schemas'
import { db } from './db.server'
import { getCar, insertCar, listCars, listStock, updateCarStock } from './cars.server'

const newCar = (purpose: 'rental' | 'sale', plate: string, status = 'preparation') =>
  insertCar(newCarInputSchema.parse({ purpose, status, plate, make: 'Toyota', model: 'Corolla' }))
const stock = (values: Record<string, unknown>) => carStockInputSchema.parse(values)

beforeEach(async () => {
  await db.exec('DELETE FROM transactions; DELETE FROM charges; DELETE FROM cars')
})

describe('car purpose', () => {
  it('requires a purpose when a car is added', async () => {
    const parsed = newCarInputSchema.safeParse({ plate: 'ABC1', make: 'Toyota', model: 'Corolla' })
    expect(parsed.success).toBe(false)
  })

  it('only lets a new car start in Preparation or Ready', async () => {
    expect(newCarInputSchema.safeParse({ purpose: 'rental', status: 'rented', plate: 'A1', make: 'a', model: 'b' }).success).toBe(false)
    const id = await newCar('rental', 'A1', 'ready')
    expect(await getCar(id)).toMatchObject({ purpose: 'rental', status: 'ready' })
  })

  it('rejects a status that does not belong to the purpose', async () => {
    const id = await newCar('rental', 'R1')
    await expect(db.run(`UPDATE cars SET status = 'sold' WHERE id = ?`, [id])).rejects.toThrow(/CHECK/)
  })

  it('filters the cars list and the stock board by purpose', async () => {
    await newCar('rental', 'R1')
    await newCar('sale', 'S1')
    const base = { page: 1, size: 25 as const, sort: 'recent' as const }
    expect((await listCars({ ...base, purpose: 'rental' })).items.map((c) => c.plate)).toEqual(['R1'])
    expect((await listStock({ view: 'board', purpose: 'sale', sort: 'rego' })).map((c) => c.plate)).toEqual(['S1'])
  })
})

describe('stock tab', () => {
  it('moves a car between Preparation and Ready', async () => {
    const id = await newCar('sale', 'S1')
    expect(await updateCarStock(id, stock({ status: 'ready' }))).toBe('ok')
    expect((await getCar(id))?.status).toBe('ready')
    expect(await updateCarStock(id, stock({ status: 'preparation' }))).toBe('ok')
    expect((await getCar(id))?.status).toBe('preparation')
  })

  it('never accepts Rented, Under finance or Sold from the form', async () => {
    for (const status of ['rented', 'under_finance', 'sold']) expect(carStockInputSchema.safeParse({ status }).success).toBe(false)
  })

  it('locks the status of a car that is out with a customer', async () => {
    const id = await newCar('rental', 'R1', 'ready')
    await db.run(`UPDATE cars SET status = 'rented' WHERE id = ?`, [id])
    expect(await updateCarStock(id, stock({ status: 'ready' }))).toBe('status_locked')
    expect((await getCar(id))?.status).toBe('rented')
    // The rest of the tab can still be saved.
    expect(await updateCarStock(id, stock({ weeklyRate: '250' }))).toBe('ok')
    expect(await getCar(id)).toMatchObject({ status: 'rented', weeklyRateCents: 25000 })
  })

  it("leaves a rental car's odometer to Maintenance readings, but saves a sale car's", async () => {
    const rental = await newCar('rental', 'R2', 'ready')
    const sale = await newCar('sale', 'S2', 'ready')
    await updateCarStock(rental, stock({ mileageKm: '1200' }))
    await updateCarStock(sale, stock({ mileageKm: '1200' }))
    expect((await getCar(rental))?.mileageKm).toBeNull()
    expect((await getCar(sale))?.mileageKm).toBe(1200)
  })

  it('saves only the prices for the car purpose', async () => {
    const rental = await newCar('rental', 'R1')
    const sale = await newCar('sale', 'S1')
    const prices = { weeklyRate: '190', askingPrice: '15000', minPrice: '14000' }
    await updateCarStock(rental, stock(prices))
    await updateCarStock(sale, stock(prices))
    expect(await getCar(rental)).toMatchObject({ weeklyRateCents: 19000, askingPriceCents: null, minPriceCents: null })
    expect(await getCar(sale)).toMatchObject({ weeklyRateCents: null, askingPriceCents: 1500000, minPriceCents: 1400000 })
  })

  it('reports a missing car', async () => {
    expect(await updateCarStock(999, stock({}))).toBe('not_found')
  })
})

describe('cars list: what needs attention', () => {
  const today = '2026-11-13'
  const base = { page: 1, size: 25 as const, sort: 'urgent' as const }
  const car = async (plate: string, rego: string | null, status = 'ready') => {
    const id = await newCar('sale', plate, 'ready')
    await db.run(`UPDATE cars SET rego_expiry = ?, status = ? WHERE id = ?`, [rego, status, id])
  }

  beforeEach(async () => {
    await car('OK1', '2027-06-01')
    await car('SOON', '2026-12-10') // 27 days
    await car('NOREGO', null)
    await car('LATE', '2026-11-01') // expired
    await car('EDGE', '2026-12-13') // exactly 30 days
    await car('SOLD', '2020-01-01', 'sold')
  })

  it('puts expired first, then missing dates, then expiring, then the rest by plate', async () => {
    const { items } = await listCars(base, today)
    expect(items.map((c) => c.plate)).toEqual(['LATE', 'NOREGO', 'SOON', 'EDGE', 'OK1', 'SOLD'])
  })

  it('counts and filters the cars that need attention, never sold ones', async () => {
    const all = await listCars(base, today)
    expect(all).toMatchObject({ total: 6, attentionCount: 4 })
    const flagged = await listCars({ ...base, attention: true }, today)
    expect(flagged.total).toBe(4)
    expect(flagged.items.map((c) => c.plate)).toEqual(['LATE', 'NOREGO', 'SOON', 'EDGE'])
  })

  it('ignores insurance', async () => {
    await db.run(`UPDATE cars SET insurance_expiry = '2020-01-01' WHERE plate = 'OK1'`)
    expect((await listCars(base, today)).attentionCount).toBe(4)
  })

  it('sorts by rego expiry, soonest first, with missing dates last', async () => {
    const { items } = await listCars({ ...base, sort: 'rego_expiry' }, today)
    expect(items.map((c) => c.plate)).toEqual(['SOLD', 'LATE', 'SOON', 'EDGE', 'OK1', 'NOREGO'])
  })
})
