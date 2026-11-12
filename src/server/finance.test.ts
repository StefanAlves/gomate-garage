import { beforeEach, describe, expect, it } from 'vitest'
import { customerInputSchema, newCarInputSchema, startFinanceSaleInputSchema } from '~/lib/schemas'
import { db } from './db.server'
import { getCar, insertCar } from './cars.server'
import { insertCustomer } from './customers.server'
import { ledgerTotals } from './transactions.server'
import {
  defaultFinanceSale, financeSalesForCustomer, getFinanceSale, listFinanceSales, overdueFinanceSales, payoff,
  recordFinancePayment, startFinanceSale,
} from './finance.server'

const car = (purpose: 'rental' | 'sale', plate: string, status: 'preparation' | 'ready' = 'ready') =>
  insertCar(newCarInputSchema.parse({ purpose, status, plate, make: 'Toyota', model: 'Corolla' }))
const customer = (firstName = 'Ana') => insertCustomer(customerInputSchema.parse({ firstName, phone: '0400 000 000' }))
// $10,000: $1,000 deposit + 9 × $1,000 weekly, agreed 1 Jan.
const start = (values: Record<string, unknown>) =>
  startFinanceSale(startFinanceSaleInputSchema.parse({
    agreedOn: '2026-01-01', price: '10000', deposit: '1000', depositMethod: 'cash', instalmentCount: '9', ...values,
  }))
const started = (out: Awaited<ReturnType<typeof startFinanceSale>>) => {
  if (!out.ok) throw new Error(out.reason)
  return out.id
}
const pay = (id: number, paidOn: string, amount: number) => recordFinancePayment(id, { paidOn, amount, method: 'cash', notes: null })

beforeEach(async () => {
  await db.exec(`DELETE FROM rental_deductions; DELETE FROM rental_rent_rates; DELETE FROM transactions; DELETE FROM rentals;
           DELETE FROM finance_sales; DELETE FROM charges; DELETE FROM cars; DELETE FROM customers`)
})

describe('starting a finance sale', () => {
  it('records the deal and the deposit, and puts the car Under finance', async () => {
    const carId = await car('sale', 'S1')
    const id = await started((await start({ carId, customerId: await customer() })))
    expect((await getCar(carId))?.status).toBe('under_finance')
    const { sale, schedule, payments } = (await getFinanceSale(id, '2026-01-01'))!
    expect(sale).toMatchObject({ status: 'active', paidCents: 100_000, balanceCents: 900_000, arrearsCents: 0, nextDueOn: '2026-01-08' })
    expect(schedule).toHaveLength(10)
    expect(payments).toMatchObject([{ amountCents: 100_000, notes: 'Deposit' }])
  })

  it('validates that the plan adds up', async () => {
    const base = { carId: 1, customerId: 1, agreedOn: '2026-01-01', price: '10000' }
    expect(startFinanceSaleInputSchema.safeParse({ ...base, deposit: '1000', instalmentCount: '0' }).success).toBe(false)
    expect(startFinanceSaleInputSchema.safeParse({ ...base, deposit: '1000', instalmentCount: '3', instalmentAmount: '5000' }).success).toBe(false)
    expect(startFinanceSaleInputSchema.safeParse({ ...base, deposit: '1000', instalmentCount: '7' }).success).toBe(true)
  })

  it('completes a cash sale at once and marks the car Sold', async () => {
    const carId = await car('sale', 'S1')
    const id = await started((await start({ carId, customerId: await customer(), deposit: '10000', instalmentCount: '0' })))
    expect((await getCar(carId))?.status).toBe('sold')
    expect((await getFinanceSale(id, '2026-01-01'))!.sale).toMatchObject({ status: 'completed', closedOn: '2026-01-01', balanceCents: 0 })
  })

  it('refuses a rental car, a car that is not Ready, or a second sale on the same car', async () => {
    const customerId = await customer()
    expect(await start({ carId: await car('rental', 'R1'), customerId })).toEqual({ ok: false, reason: 'car_not_available' })
    expect(await start({ carId: await car('sale', 'S1', 'preparation'), customerId })).toEqual({ ok: false, reason: 'car_not_available' })
    const carId = await car('sale', 'S2')
    await started((await start({ carId, customerId })))
    expect(await start({ carId, customerId })).toEqual({ ok: false, reason: 'car_not_available' })
    await expect(db.run(`INSERT INTO finance_sales (customer_id, car_id, agreed_on, price_cents, deposit_cents, instalment_count,
      instalment_cents) VALUES (?, ?, '2026-01-01', 1000, 0, 1, 1000)`, [customerId, carId])).rejects.toThrow(/UNIQUE/)
  })

  it('creates a walk-in buyer in the same step', async () => {
    const id = await started((await start({ carId: await car('sale', 'S1'), customerMode: 'new', firstName: 'New', lastName: 'Buyer', phone: '0411 111 111' })))
    expect((await getFinanceSale(id, '2026-01-01'))!.sale.customerName).toBe('New Buyer')
  })
})

describe('payments, arrears and completion', () => {
  it('shows arrears and weeks behind from the schedule', async () => {
    const id = await started((await start({ carId: await car('sale', 'S1'), customerId: await customer() })))
    await pay(id, '2026-01-08', 500)
    // Due by 16 Jan: deposit + 2 instalments = $3,000; paid $1,500.
    const { sale, schedule } = (await getFinanceSale(id, '2026-01-16'))!
    expect(sale).toMatchObject({ dueToDateCents: 300_000, paidCents: 150_000, arrearsCents: 150_000, weeksBehind: 2, overdue: true })
    expect(schedule.slice(0, 3).map((r) => r.state)).toEqual(['paid', 'overdue', 'overdue'])
  })

  it('completes on the exact final payment and makes the car Sold', async () => {
    const carId = await car('sale', 'S1')
    const id = await started((await start({ carId, customerId: await customer() })))
    expect(await pay(id, '2026-02-01', 8_999)).toEqual({ ok: true, completed: false })
    expect(await pay(id, '2026-02-02', 1)).toEqual({ ok: true, completed: true })
    expect((await getCar(carId))?.status).toBe('sold')
    expect((await getFinanceSale(id, '2026-03-01'))!.sale).toMatchObject({ status: 'completed', closedOn: '2026-02-02', balanceCents: 0, overdue: false })
    expect(await pay(id, '2026-02-03', 1)).toEqual({ ok: false, reason: 'not_active' })
  })

  it('rejects a payment above the remaining balance', async () => {
    const id = await started((await start({ carId: await car('sale', 'S1'), customerId: await customer() })))
    expect(await pay(id, '2026-01-08', 9_000.01)).toEqual({ ok: false, reason: 'overpaid', balanceCents: 900_000 })
  })

  it('pays off the remaining balance in one step', async () => {
    const carId = await car('sale', 'S1')
    const id = await started((await start({ carId, customerId: await customer() })))
    await pay(id, '2026-01-08', 1_000)
    expect(await payoff(id, { paidOn: '2026-01-10', method: 'bank_transfer' })).toEqual({ ok: true, completed: true })
    expect((await getCar(carId))?.status).toBe('sold')
    expect((await ledgerTotals({ car: carId }, '2026-02-01')).saleIncomeCents).toBe(1_000_000)
  })

  it('lists active sales, most behind first, and counts the overdue ones', async () => {
    const a = await started((await start({ carId: await car('sale', 'S1'), customerId: await customer('Ana') })))
    await started((await start({ carId: await car('sale', 'S2'), customerId: await customer('Bo') })))
    await pay(a, '2026-01-08', 1_000)
    const search = { status: 'active', show: 'all', sort: 'arrears' } as const
    expect((await listFinanceSales(search, '2026-01-08')).map((f) => f.customerName)).toEqual(['Bo', 'Ana'])
    expect((await listFinanceSales({ ...search, show: 'overdue' }, '2026-01-08')).map((f) => f.customerName)).toEqual(['Bo'])
    expect(await overdueFinanceSales('2026-01-08')).toEqual({ count: 1, arrearsCents: 100_000 })
  })
})

describe('default', () => {
  it('ends the sale, keeps the payments and puts the car back in Preparation', async () => {
    const carId = await car('sale', 'S1')
    const customerId = await customer()
    const id = await started((await start({ carId, customerId })))
    await pay(id, '2026-01-08', 1_000)
    expect(await defaultFinanceSale(id, { defaultedOn: '2026-02-01', reason: 'Stopped paying' })).toBe('ok')
    expect((await getCar(carId))?.status).toBe('preparation')
    const { sale, payments } = (await getFinanceSale(id, '2026-03-01'))!
    expect(sale).toMatchObject({ status: 'defaulted', closedOn: '2026-02-01', defaultReason: 'Stopped paying', paidCents: 200_000, nextDueOn: null })
    expect(payments).toHaveLength(2)
    expect(await defaultFinanceSale(id, { defaultedOn: '2026-02-02', reason: 'again' })).toBe('not_active')
    expect(await pay(id, '2026-02-03', 10)).toEqual({ ok: false, reason: 'not_active' })
    // The car can be prepared and sold again; the history stays with the customer.
    await db.run(`UPDATE cars SET status = 'ready' WHERE id = ?`, [carId])
    await started((await start({ carId, customerId })))
    expect((await financeSalesForCustomer(customerId, '2026-03-01')).map((f) => f.status)).toEqual(['active', 'defaulted'])
  })
})
