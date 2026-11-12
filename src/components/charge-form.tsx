import { chargeInputSchema, type ChargeKind, type ChargeValues } from '~/lib/schemas'
import { centsToInput, chargeStatusLabel, labelOptions } from '~/lib/format'
import type { Charge } from '~/server/charges.server'
import { FormError, useSchemaForm, type Result } from './form'

export type PickerOptions = {
  cars: { id: number; plate: string; name: string }[]
  customers: { id: number; name: string; phone: string }[]
}

const statusOptions = labelOptions(chargeStatusLabel)
const idStr = (id: number | null | undefined) => (id == null ? '' : String(id))

/** Add / edit a fine or toll. Picking a customer-owned car fills in that customer. */
export function ChargeForm({
  kind,
  options,
  initial,
  today,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  kind: ChargeKind
  options: PickerOptions
  initial?: Charge
  today: string
  onSubmit: (values: ChargeValues) => Promise<Result<{ id: number }>>
  onSuccess: () => void | Promise<void>
  onCancel: () => void
}) {
  const { form, formError, onSubmit: handle } = useSchemaForm({
    schema: chargeInputSchema,
    defaultValues: {
      kind: kind as string,
      incurredOn: initial?.incurredOn ?? today,
      dueOn: initial?.dueOn ?? '',
      carId: idStr(initial?.carId),
      customerId: idStr(initial?.customerId),
      offenceType: initial?.offenceType ?? '',
      noticeNumber: initial?.noticeNumber ?? '',
      amount: centsToInput(initial?.amountCents ?? null),
      paymentReference: initial?.paymentReference ?? '',
      status: (initial?.status ?? 'not_paid') as string,
      note: initial?.note ?? '',
    },
    submit: onSubmit,
    onSuccess,
  })
  const fine = kind === 'fine'
  const carOptions = options.cars.map((c) => [String(c.id), `${c.plate} · ${c.name}`] as const)
  const customerOptions = options.customers.map((c) => [String(c.id), `${c.name} · ${c.phone}`] as const)

  return (
    <form className="form form-grid" onSubmit={handle} noValidate>
      <form.AppField name="incurredOn">{(f) => <f.TextField label={fine ? 'Offence date' : 'Travel date'} type="date" required />}</form.AppField>
      <form.AppField name="dueOn">{(f) => <f.TextField label="Due date" type="date" />}</form.AppField>
      <form.AppField name="carId">
        {(f) => <f.SelectField label="Vehicle (rego)" options={carOptions} emptyLabel="Unknown vehicle" />}
      </form.AppField>
      <form.AppField name="customerId">{(f) => <f.SelectField label="Customer" options={customerOptions} emptyLabel="Unknown" />}</form.AppField>
      {fine && (
        <form.AppField name="offenceType">{(f) => <f.TextField label="Offence type" className="span-all" placeholder="e.g. Exceed speed limit" />}</form.AppField>
      )}
      <form.AppField name="noticeNumber">{(f) => <f.TextField label="Notice number" autoComplete="off" />}</form.AppField>
      <form.AppField name="amount">
        {(f) => <f.TextField label="Amount owed ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" />}
      </form.AppField>
      <form.AppField name="paymentReference">{(f) => <f.TextField label="Payment reference" hint="optional" autoComplete="off" />}</form.AppField>
      <form.AppField name="status">{(f) => <f.SelectField label="Status" options={statusOptions} emptyLabel={null} />}</form.AppField>
      <form.AppField name="note">{(f) => <f.TextField label="Note" hint="optional" className="span-all" />}</form.AppField>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Save" /></form.AppForm>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}
