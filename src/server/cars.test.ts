import { beforeEach, describe, expect, it } from 'vitest'
import { newCarInputSchema, carStockInputSchema } from '~/lib/schemas'
import { db } from './db.server'
import { getCar, insertCar, listCars, listStock, updateCarStock } from './cars.server'

const newCar = (purpose: 'rental' | 'sale', plate: string, status = 'preparation') =>
  insertCar(newCarInputSchema.parse({ purpose, status, plate, make: 'Toyota', model: 'Corolla' }))
const stock = (values: Record<string, unknown>) => carStockInputSchema.parse(values)

beforeEach(() => {
  db.exec('DELETE FROM transactions; DELETE FROM charges; DELETE FROM cars')
})

describe('car purpose', () => {
  it('requires a purpose when a car is added', () => {
    const parsed = newCarInputSchema.safeParse({ plate: 'ABC1', make: 'Toyota', model: 'Corolla' })
    expect(parsed.success).toBe(false)
  })

  it('only lets a new car start in Preparation or Ready', () => {
    expect(newCarInputSchema.safeParse({ purpose: 'rental', status: 'rented', plate: 'A1', make: 'a', model: 'b' }).success).toBe(false)
    const id = newCar('rental', 'A1', 'ready')
    expect(getCar(id)).toMatchObject({ purpose: 'rental', status: 'ready' })
  })

  it('rejects a status that does not belong to the purpose', () => {
    const id = newCar('rental', 'R1')
    expect(() => db.prepare(`UPDATE cars SET status = 'sold' WHERE id = ?`).run(id)).toThrow(/CHECK/)
  })

  it('filters the cars list and the stock board by purpose', () => {
    newCar('rental', 'R1')
    newCar('sale', 'S1')
    const base = { page: 1, size: 25 as const, sort: 'recent' as const }
    expect(listCars({ ...base, purpose: 'rental' }).items.map((c) => c.plate)).toEqual(['R1'])
    expect(listStock({ view: 'board', purpose: 'sale', sort: 'rego' }).map((c) => c.plate)).toEqual(['S1'])
  })
})

describe('stock tab', () => {
  it('moves a car between Preparation and Ready', () => {
    const id = newCar('sale', 'S1')
    expect(updateCarStock(id, stock({ status: 'ready' }))).toBe('ok')
    expect(getCar(id)?.status).toBe('ready')
    expect(updateCarStock(id, stock({ status: 'preparation' }))).toBe('ok')
    expect(getCar(id)?.status).toBe('preparation')
  })

  it('never accepts Rented, Under finance or Sold from the form', () => {
    for (const status of ['rented', 'under_finance', 'sold']) expect(carStockInputSchema.safeParse({ status }).success).toBe(false)
  })

  it('locks the status of a car that is out with a customer', () => {
    const id = newCar('rental', 'R1', 'ready')
    db.prepare(`UPDATE cars SET status = 'rented' WHERE id = ?`).run(id)
    expect(updateCarStock(id, stock({ status: 'ready' }))).toBe('status_locked')
    expect(getCar(id)?.status).toBe('rented')
    // The rest of the tab can still be saved.
    expect(updateCarStock(id, stock({ mileageKm: '1200' }))).toBe('ok')
    expect(getCar(id)).toMatchObject({ status: 'rented', mileageKm: 1200 })
  })

  it('saves only the prices for the car purpose', () => {
    const rental = newCar('rental', 'R1')
    const sale = newCar('sale', 'S1')
    const prices = { weeklyRate: '190', askingPrice: '15000', minPrice: '14000' }
    updateCarStock(rental, stock(prices))
    updateCarStock(sale, stock(prices))
    expect(getCar(rental)).toMatchObject({ weeklyRateCents: 19000, askingPriceCents: null, minPriceCents: null })
    expect(getCar(sale)).toMatchObject({ weeklyRateCents: null, askingPriceCents: 1500000, minPriceCents: 1400000 })
  })

  it('reports a missing car', () => {
    expect(updateCarStock(999, stock({}))).toBe('not_found')
  })
})
