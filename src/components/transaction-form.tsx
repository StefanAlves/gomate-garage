import { transactionInputSchema, type TransactionCategory, type TransactionValues } from '~/lib/schemas'
import { categoryLabel, centsToInput, labelOptions, methodLabel } from '~/lib/format'
import type { Transaction } from '~/server/transactions.server'
import type { PickerOptions } from './charge-form'
import { FormError, useSchemaForm, type Result } from './form'

const categoryOptions = labelOptions(categoryLabel)
const methodOptions = labelOptions(methodLabel)
const idStr = (id: number | null | undefined) => (id == null ? '' : String(id))

/** Add / edit one ledger entry. */
export function TransactionForm({
  options,
  initial,
  defaults,
  today,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  options: PickerOptions
  initial?: Transaction
  /** Prefills for a new entry, e.g. "Add bond" or a car page. */
  defaults?: { carId?: number; category?: TransactionCategory }
  today: string
  onSubmit: (values: TransactionValues) => Promise<Result<{ id: number }>>
  onSuccess: () => void | Promise<void>
  onCancel: () => void
}) {
  const { form, formError, onSubmit: handle } = useSchemaForm({
    schema: transactionInputSchema,
    defaultValues: {
      carId: idStr(initial?.carId ?? defaults?.carId),
      customerId: idStr(initial?.customerId),
      occurredOn: initial?.occurredOn ?? today,
      category: (initial?.category ?? defaults?.category ?? '') as string,
      amount: centsToInput(initial?.amountCents ?? null),
      method: (initial?.method ?? '') as string,
      notes: initial?.notes ?? '',
    },
    submit: onSubmit,
    onSuccess,
  })
  const carOptions = options.cars.map((c) => [String(c.id), `${c.plate} · ${c.name}`] as const)
  const customerOptions = options.customers.map((c) => [String(c.id), `${c.name} · ${c.phone}`] as const)

  return (
    <form className="form form-grid" onSubmit={handle} noValidate>
      <form.AppField name="carId">
        {(f) => <f.SelectField label="Vehicle" options={carOptions} emptyLabel="Select a vehicle…" required className="span-all" />}
      </form.AppField>
      <form.AppField name="occurredOn">{(f) => <f.TextField label="Date" type="date" required />}</form.AppField>
      <form.AppField name="category">{(f) => <f.SelectField label="Category" options={categoryOptions} required />}</form.AppField>
      <form.AppField name="amount">
        {(f) => <f.TextField label="Amount ($)" type="number" inputMode="decimal" min={0} step="0.01" required placeholder="e.g. 500" />}
      </form.AppField>
      <form.AppField name="method">{(f) => <f.SelectField label="Payment method" options={methodOptions} emptyLabel="—" />}</form.AppField>
      <form.AppField name="customerId">
        {(f) => <f.SelectField label="Customer" hint="optional" options={customerOptions} emptyLabel="None" />}
      </form.AppField>
      <form.AppField name="notes">{(f) => <f.TextField label="Notes" hint="optional" />}</form.AppField>
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
