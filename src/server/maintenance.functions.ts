import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import {
  idSchema, maintenanceListSearchSchema, recordReadingSchema, recordServiceSchema, setServiceIntervalSchema,
} from '~/lib/schemas'
import { garageToday } from '~/lib/period'
import * as maintenance from './maintenance.server'

// Maintenance RPCs. Same conventions as garage.functions.ts: expected failures
// come back as { ok: false, errors } keyed by form field.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

/** Field errors for a refused reading or service; `dateField` names the form's date input. */
type RecordFailure = Exclude<Awaited<ReturnType<typeof maintenance.recordReading>>, { ok: true }>['reason']

function readingError(reason: RecordFailure, dateField: string): Result<never> {
  switch (reason) {
    case 'not_found':
      throw notFound()
    case 'not_rental':
      return { ok: false, errors: { form: 'Maintenance is tracked for Rental cars only.' } }
    case 'future':
      return { ok: false, errors: { [dateField]: "Can't be in the future" } }
    case 'lower_than_earlier':
      return { ok: false, errors: { km: 'Lower than an earlier reading. Tick "This is a correction" if it\'s right.' } }
    case 'higher_than_later':
      return { ok: false, errors: { km: 'Higher than a later reading. Tick "This is a correction" if it\'s right.' } }
  }
}

export const getMaintenance = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const today = garageToday()
    const found = await maintenance.getMaintenance(data.id, today)
    if (!found) throw notFound()
    return { ...found, today }
  })

export const listMaintenance = createServerFn({ method: 'GET' })
  .validator(maintenanceListSearchSchema)
  .handler(async ({ data }) => {
    const today = garageToday()
    const all = await maintenance.dueSoonList(today, 'all')
    return {
      today,
      items: data.show === 'all' ? all : all.filter(maintenance.isDue),
      counts: await maintenance.maintenanceCounts(today, all),
    }
  })

export const setServiceInterval = createServerFn({ method: 'POST' })
  .validator(setServiceIntervalSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    switch (await maintenance.setServiceInterval(data.id, data.values)) {
      case 'not_found':
        throw notFound()
      case 'not_rental':
        return { ok: false, errors: { form: 'Maintenance is tracked for Rental cars only.' } }
      case 'ok':
        return { ok: true, value: null }
    }
  })

export const recordReading = createServerFn({ method: 'POST' })
  .validator(recordReadingSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    const out = await maintenance.recordReading(data.id, data.values, garageToday())
    return out.ok ? { ok: true, value: null } : readingError(out.reason, 'readOn')
  })

export const deleteReading = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    if (await maintenance.deleteReading(data.id) === 'from_service')
      return { ok: false, errors: { form: 'This reading came from a service. Delete the service instead.' } }
    return { ok: true, value: null }
  })

export const recordService = createServerFn({ method: 'POST' })
  .validator(recordServiceSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    const out = await maintenance.recordService(data.id, data.values, garageToday())
    return out.ok ? { ok: true, value: null } : readingError(out.reason, 'servicedOn')
  })

export const deleteService = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    await maintenance.deleteService(data.id)
    return { ok: true, value: null }
  })
