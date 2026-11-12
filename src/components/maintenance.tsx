import { useServerFn } from '@tanstack/react-start'
import type { MaintenanceDue, MaintenanceState } from '~/lib/maintenance'
import { odometerReadingInputSchema, serviceInputSchema, serviceIntervalInputSchema } from '~/lib/schemas'
import {
  formatDate, formatDaysLeft, formatKm, formatKmLeft, labelOptions, maintenanceStateLabel, methodLabel,
} from '~/lib/format'
import { recordReading, recordService, setServiceInterval } from '~/server/maintenance.functions'
import { FormError, useSchemaForm } from './form'

const methodOptions = labelOptions(methodLabel)

export function MaintenanceBadge({ state }: { state: MaintenanceState }) {
  return <span className={`badge maint-${state}`}>{maintenanceStateLabel[state]}</span>
}

/** Next due date with days left, e.g. "1 Nov 2026 · in 152 days". */
export function DueDate({ due }: { due: Pick<MaintenanceDue, 'nextDueOn' | 'daysLeft'> }) {
  if (!due.nextDueOn || due.daysLeft == null) return <span className="muted">—</span>
  return (
    <span className={due.daysLeft < 0 ? 'urgent' : undefined}>
      {formatDate(due.nextDueOn)} <span className="small muted">· {formatDaysLeft(due.daysLeft)}</span>
    </span>
  )
}

/** Next due km with km left; marked "est." when worked out from an old reading. */
export function DueKm({ due }: { due: Pick<MaintenanceDue, 'nextDueKm' | 'kmLeft' | 'kmEstimated'> }) {
  if (due.nextDueKm == null) return <span className="muted">—</span>
  return (
    <span className={due.kmLeft != null && due.kmLeft < 0 ? 'urgent' : undefined}>
      {formatKm(due.nextDueKm)}
      {due.kmLeft != null && (
        <span className="small muted"> · {formatKmLeft(due.kmLeft)}{due.kmEstimated && ' (est.)'}</span>
      )}
    </span>
  )
}

/** The latest reading, plus an estimate when it's old. */
export function OdometerValue({ due }: { due: Pick<MaintenanceDue, 'latest' | 'estimatedKm' | 'kmPerDay' | 'daysSinceReading'> }) {
  if (!due.latest) return <span className="muted">No reading yet</span>
  return (
    <span>
      {formatKm(due.latest.km)}{' '}
      <span className="small muted">· {formatDate(due.latest.readOn)}</span>
      {due.estimatedKm != null && (
        <span className="small muted" title={`About ${due.kmPerDay} km a day from recent readings`}>
          {' '}· about {formatKm(due.estimatedKm)} now
        </span>
      )}
    </span>
  )
}

type Done = () => Promise<void>

export function ReadingForm({ carId, today, onDone, onCancel }: { carId: number; today: string; onDone: Done; onCancel: () => void }) {
  const record = useServerFn(recordReading)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: odometerReadingInputSchema,
    defaultValues: { readOn: today, km: '', note: '', correction: false },
    submit: (values) => record({ data: { id: carId, values } }),
    onSuccess: onDone,
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="readOn">{(f) => <f.TextField label="Date" type="date" max={today} required />}</form.AppField>
      <form.AppField name="km">{(f) => <f.TextField label="Odometer (km)" type="number" inputMode="numeric" min={0} step="1" required />}</form.AppField>
      <form.AppField name="note">{(f) => <f.TextField label="Note" hint="optional" placeholder="e.g. Photo from renter" className="span-all" />}</form.AppField>
      <form.AppField name="correction">
        {(f) => <f.CheckboxField label="This is a correction" hint="allows a reading lower than an earlier one" className="span-all" />}
      </form.AppField>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Save reading" /></form.AppForm>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}

export function ServiceForm({ carId, today, km, onDone, onCancel }: {
  carId: number; today: string; km: number | null; onDone: Done; onCancel: () => void
}) {
  const record = useServerFn(recordService)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: serviceInputSchema,
    defaultValues: { servicedOn: today, km: km == null ? '' : String(km), description: '', cost: '', method: '', correction: false },
    submit: (values) => record({ data: { id: carId, values } }),
    onSuccess: onDone,
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="servicedOn">{(f) => <f.TextField label="Date" type="date" max={today} required />}</form.AppField>
      <form.AppField name="km">{(f) => <f.TextField label="Odometer (km)" type="number" inputMode="numeric" min={0} step="1" required />}</form.AppField>
      <form.AppField name="description">
        {(f) => <f.TextField label="What was done" required placeholder="e.g. Logbook service, oil and filters" className="span-all" />}
      </form.AppField>
      <form.AppField name="cost">
        {(f) => <f.TextField label="Cost ($)" hint="goes to the car's expenses" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" />}
      </form.AppField>
      <form.AppField name="method">{(f) => <f.SelectField label="Paid by" options={methodOptions} emptyLabel="—" />}</form.AppField>
      <form.AppField name="correction">
        {(f) => <f.CheckboxField label="Odometer is a correction" hint="allows km lower than an earlier reading" className="span-all" />}
      </form.AppField>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Save service" /></form.AppForm>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}

export function IntervalForm({ carId, interval, onDone, onCancel }: {
  carId: number; interval: { km: number | null; months: number | null }; onDone: Done; onCancel?: () => void
}) {
  const save = useServerFn(setServiceInterval)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: serviceIntervalInputSchema,
    defaultValues: { km: interval.km == null ? '' : String(interval.km), months: interval.months == null ? '' : String(interval.months) },
    submit: (values) => save({ data: { id: carId, values } }),
    onSuccess: onDone,
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="km">
        {(f) => <f.TextField label="Every (km)" type="number" inputMode="numeric" min={500} step="500" placeholder="e.g. 10000" />}
      </form.AppField>
      <form.AppField name="months">
        {(f) => <f.TextField label="Or every (months)" type="number" inputMode="numeric" min={1} max={60} placeholder="e.g. 6" />}
      </form.AppField>
      <p className="muted small span-all">Whichever comes first. Leave one blank to go by the other only.</p>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Save interval" /></form.AppForm>
          {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </form>
  )
}
