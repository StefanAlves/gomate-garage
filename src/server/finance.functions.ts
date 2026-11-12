import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import {
  PAYMENT_METHODS, defaultFinanceSaleSchema, financeListSearchSchema, idSchema, recordFinancePaymentSchema, startFinanceSaleInputSchema,
} from '~/lib/schemas'
import { formatMoney } from '~/lib/format'
import { garageToday } from '~/lib/period'
import * as finance from './finance.server'
import { rentalCustomerOptions } from './rentals.server'

// Finance Sale RPCs. Same conventions as garage.functions.ts.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

export const listFinanceSales = createServerFn({ method: 'GET' })
  .validator(financeListSearchSchema)
  .handler(({ data }) => ({ items: finance.listFinanceSales(data, garageToday()) }))

export const getFinanceSale = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => {
    const today = garageToday()
    const found = finance.getFinanceSale(data.id, today)
    if (!found) throw notFound()
    return { ...found, today }
  })

export const financeSalesForCustomer = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => finance.financeSalesForCustomer(data.id, garageToday()))

export const financeSalesForCar = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => finance.financeSalesForCar(data.id, garageToday()))

/** Ready Sale cars and customers (with licence-on-file) for the Start finance sale form. */
export const startFinanceSaleOptions = createServerFn({ method: 'GET' }).handler(() => ({
  cars: finance.availableSaleCars(),
  customers: rentalCustomerOptions(),
  today: garageToday(),
}))

export const startFinanceSale = createServerFn({ method: 'POST' })
  .validator(startFinanceSaleInputSchema)
  .handler(({ data }): Result<{ id: number }> => {
    const out = finance.startFinanceSale(data)
    if (out.ok) return { ok: true, value: { id: out.id } }
    switch (out.reason) {
      case 'car_not_available':
        return { ok: false, errors: { carId: 'This car is no longer Ready to sell. Pick another one.' } }
      case 'customer_not_found':
        return { ok: false, errors: { customerId: 'That customer no longer exists' } }
      case 'invalid_plan':
        return { ok: false, errors: { instalmentAmount: "The deposit and instalments don't add up to the price" } }
    }
  })

function paymentResult(out: finance.PaymentOutcome): Result<{ completed: boolean }> {
  if (out.ok) return { ok: true, value: { completed: out.completed } }
  switch (out.reason) {
    case 'not_found':
      throw notFound()
    case 'not_active':
      return { ok: false, errors: { form: 'This finance sale has ended; it no longer takes payments.' } }
    case 'overpaid':
      return { ok: false, errors: { amount: `More than the remaining balance of ${formatMoney(out.balanceCents)}` } }
  }
}

export const recordFinancePayment = createServerFn({ method: 'POST' })
  .validator(recordFinancePaymentSchema)
  .handler(({ data }) => paymentResult(finance.recordFinancePayment(data.id, data.values)))

export const payoffFinanceSale = createServerFn({ method: 'POST' })
  .validator(idSchema.extend({ paidOn: z.iso.date(), method: z.enum(PAYMENT_METHODS).nullable() }))
  .handler(({ data }) => paymentResult(finance.payoff(data.id, { paidOn: data.paidOn, method: data.method })))

export const defaultFinanceSale = createServerFn({ method: 'POST' })
  .validator(defaultFinanceSaleSchema)
  .handler(({ data }): Result<null> => {
    switch (finance.defaultFinanceSale(data.id, data.values)) {
      case 'not_found':
        throw notFound()
      case 'not_active':
        return { ok: false, errors: { form: 'This finance sale has already ended.' } }
      case 'before_start':
        return { ok: false, errors: { defaultedOn: 'Must be on or after the agreement date' } }
      case 'ok':
        return { ok: true, value: null }
    }
  })

export const updateFinanceNotes = createServerFn({ method: 'POST' })
  .validator(idSchema.extend({ notes: z.string().trim().max(2000).transform((v) => v || null) }))
  .handler(({ data }): Result<null> => {
    if (!finance.updateFinanceNotes(data.id, data.notes)) throw notFound()
    return { ok: true, value: null }
  })
