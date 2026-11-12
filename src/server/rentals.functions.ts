import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import {
  adjustRentSchema, idSchema, recordRentPaymentSchema, rentalListSearchSchema, returnRentalSchema,
  settlementPreviewSchema, startRentalInputSchema,
} from '~/lib/schemas'
import { garageToday } from '~/lib/period'
import * as rentals from './rentals.server'

// Rentals RPCs. Same conventions as garage.functions.ts: expected failures come
// back as { ok: false, errors } keyed by form field.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

export const listRentals = createServerFn({ method: 'GET' })
  .validator(rentalListSearchSchema)
  .handler(async ({ data }) => ({ items: await rentals.listRentals(data, garageToday()) }))

export const getRental = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const today = garageToday()
    const found = await rentals.getRental(data.id, today)
    if (!found) throw notFound()
    return { ...found, today }
  })

export const rentalsForCustomer = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(async ({ data }) => await rentals.rentalsForCustomer(data.id, garageToday()))

export const rentalsForCar = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(async ({ data }) => await rentals.rentalsForCar(data.id, garageToday()))

/** Ready Rental cars and customers (with licence-on-file) for the Start rental form. */
export const startRentalOptions = createServerFn({ method: 'GET' }).handler(async () => ({
  cars: await rentals.availableRentalCars(),
  customers: await rentals.rentalCustomerOptions(),
  today: garageToday(),
}))

export const startRental = createServerFn({ method: 'POST' })
  .validator(startRentalInputSchema)
  .handler(async ({ data }): Promise<Result<{ id: number }>> => {
    const out = await rentals.startRental(data)
    if (out.ok) return { ok: true, value: { id: out.id } }
    return out.reason === 'car_not_available'
      ? { ok: false, errors: { carId: 'This car is no longer Ready to rent. Pick another one.' } }
      : { ok: false, errors: { customerId: 'That customer no longer exists' } }
  })

export const recordRentPayment = createServerFn({ method: 'POST' })
  .validator(recordRentPaymentSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    if (await rentals.recordRentPayment(data.id, data.values) === 'not_found') throw notFound()
    return { ok: true, value: null }
  })

export const adjustRent = createServerFn({ method: 'POST' })
  .validator(adjustRentSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    switch (await rentals.adjustRent(data.id, data.values)) {
      case 'not_found':
        throw notFound()
      case 'not_active':
        return { ok: false, errors: { form: 'This rental has ended; its rent can no longer change.' } }
      case 'before_start':
        return { ok: false, errors: { effectiveFrom: 'Must be on or after the rental start date' } }
      case 'ok':
        return { ok: true, value: null }
    }
  })

export const getSettlementPreview = createServerFn({ method: 'GET' })
  .validator(settlementPreviewSchema)
  .handler(async ({ data }) => {
    const preview = await rentals.settlementPreview(data.id, data.returnedOn)
    if (preview === 'not_found') throw notFound()
    return preview
  })

export const returnRental = createServerFn({ method: 'POST' })
  .validator(returnRentalSchema)
  .handler(async ({ data }): Promise<Result<{ refundCents: number; shortfallCents: number }>> => {
    const out = await rentals.returnRental(data.id, data.values)
    if (out.ok) return { ok: true, value: { refundCents: out.refundCents, shortfallCents: out.shortfallCents } }
    if (out.reason === 'not_found') throw notFound()
    return out.reason === 'not_active'
      ? { ok: false, errors: { form: 'This rental has already been returned.' } }
      : { ok: false, errors: { returnedOn: 'Must be on or after the rental start date' } }
  })
