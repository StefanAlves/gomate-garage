import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useStore } from '@tanstack/react-form'
import { newRentalSearchSchema, startFinanceSaleInputSchema } from '~/lib/schemas'
import { centsToInput, formatDate, formatMoney, labelOptions, methodLabel } from '~/lib/format'
import { financePlan } from '~/lib/finance'
import { addDays } from '~/lib/period'
import { startFinanceSale, startFinanceSaleOptions } from '~/server/finance.functions'
import { FormError, FormSection, useSchemaForm } from '~/components/form'

export const Route = createFileRoute('/finance-sales/new')({
  validateSearch: newRentalSearchSchema,
  loader: () => startFinanceSaleOptions(),
  head: () => ({ meta: [{ title: 'Start finance sale · Garage' }] }),
  component: StartFinanceSale,
})

const methodOptions = labelOptions(methodLabel)
const toCents = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100))

function StartFinanceSale() {
  const search = Route.useSearch()
  const { cars, customers, today } = Route.useLoaderData()
  const navigate = useNavigate()
  const start = useServerFn(startFinanceSale)
  const preselected = cars.find((c) => c.id === search.car)

  const { form, formError, onSubmit } = useSchemaForm({
    schema: startFinanceSaleInputSchema,
    defaultValues: {
      carId: preselected ? String(preselected.id) : '',
      customerMode: 'existing',
      customerId: search.customer ? String(search.customer) : '',
      firstName: '',
      lastName: '',
      phone: '',
      agreedOn: today,
      price: centsToInput(preselected?.askingPriceCents ?? null),
      deposit: '',
      depositMethod: '',
      instalmentCount: '52',
      instalmentAmount: '',
      notes: '',
    },
    submit: (values) => start({ data: values }),
    onSuccess: ({ id }) => navigate({ to: '/finance-sales/$saleId', params: { saleId: String(id) } }),
  })
  const values = useStore(form.store, (s) => s.values)
  const chosen = customers.find((c) => String(c.id) === values.customerId)

  // Live preview of the plan the server will store.
  const price = toCents(values.price)
  const deposit = toCents(values.deposit) ?? 0
  const count = Number.parseInt(values.instalmentCount, 10)
  const planned = price != null && Number.isInteger(count) && count >= 0 ? financePlan(price, deposit, count, toCents(values.instalmentAmount)) : null

  const carOptions = cars.map((c) => [String(c.id), `${c.plate} · ${c.name}`] as const)
  const customerOptions = customers.map((c) => [String(c.id), `${c.name} · ${c.phone}`] as const)

  return (
    <div className="panel stack">
      <Link to="/fleet/sales" className="muted small">← Finance sales</Link>
      <h1>Start finance sale</h1>
      {search.car !== undefined && !preselected && (
        <p className="notice warn">That car isn't a Ready sale car, so it can't be sold right now. Pick another one.</p>
      )}
      <form className="form stack" onSubmit={onSubmit} noValidate>
        <FormSection title="Car">
          <form.AppField
            name="carId"
            listeners={{
              onChange: ({ value }) => {
                const car = cars.find((c) => String(c.id) === value)
                if (car?.askingPriceCents != null && !form.getFieldMeta('price')?.isDirty)
                  form.setFieldValue('price', centsToInput(car.askingPriceCents), { dontUpdateMeta: true })
              },
            }}
          >
            {(f) => (
              <f.SelectField label="Sale car" options={carOptions} required className="span-all"
                emptyLabel={cars.length ? 'Select a Ready sale car…' : 'No sale cars are Ready'} />
            )}
          </form.AppField>
        </FormSection>

        <FormSection title="Buyer">
          <form.AppField name="customerMode">
            {(f) => <f.SelectField label="Customer" emptyLabel={null}
              options={[['existing', 'Existing customer'], ['new', 'New customer (walk-in)']]} />}
          </form.AppField>
          {values.customerMode === 'existing' ? (
            <form.AppField name="customerId">
              {(f) => <f.SelectField label="Choose customer" options={customerOptions} emptyLabel="Select a customer…" required />}
            </form.AppField>
          ) : (
            <>
              <form.AppField name="firstName">{(f) => <f.TextField label="First name" required />}</form.AppField>
              <form.AppField name="lastName">{(f) => <f.TextField label="Last name" hint="optional" />}</form.AppField>
              <form.AppField name="phone">{(f) => <f.TextField label="Mobile" type="tel" required />}</form.AppField>
            </>
          )}
          {values.customerMode === 'new' && (
            <p className="notice warn span-all small">Add the buyer's licence photo on their page once the sale has started.</p>
          )}
          {values.customerMode === 'existing' && chosen && !chosen.hasLicence && (
            <p className="notice warn span-all small">
              No licence photo on file for {chosen.name}.{' '}
              <Link to="/customers/$customerId" params={{ customerId: String(chosen.id) }}>Upload it on their page</Link>.
            </p>
          )}
        </FormSection>

        <FormSection title="Terms" description="Locked once the sale starts. Any interest is part of the price. Set 0 instalments for a cash sale.">
          <form.AppField name="agreedOn">{(f) => <f.TextField label="Agreement date" type="date" required />}</form.AppField>
          <form.AppField name="price">
            {(f) => <f.TextField label="Sale price ($)" type="number" inputMode="decimal" min={0} step="0.01" required />}
          </form.AppField>
          <form.AppField name="deposit">
            {(f) => <f.TextField label="Deposit received ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" />}
          </form.AppField>
          <form.AppField name="depositMethod">
            {(f) => <f.SelectField label="Deposit paid by" options={methodOptions} emptyLabel="—" />}
          </form.AppField>
          <form.AppField name="instalmentCount">
            {(f) => <f.TextField label="Weekly instalments" type="number" inputMode="numeric" min={0} step="1" required />}
          </form.AppField>
          <form.AppField name="instalmentAmount">
            {(f) => <f.TextField label="Instalment amount ($)" hint="blank = split evenly" type="number" inputMode="decimal" min={0} step="0.01" />}
          </form.AppField>
          <div className="span-all">
            {planned?.ok ? (
              count === 0 ? (
                <p className="notice small">Cash sale: the deposit pays the full price and the car becomes Sold straight away.</p>
              ) : (
                <p className="notice small">
                  Deposit {formatMoney(deposit)}, then {count === 1 ? '1 instalment' : `${count - 1} × ${formatMoney(planned.plan.instalmentCents)} and a last instalment`}{' '}
                  of {formatMoney(planned.plan.lastCents)}, weekly from {formatDate(addDays(values.agreedOn || today, 7))} to{' '}
                  {formatDate(addDays(values.agreedOn || today, 7 * count))}. Total {formatMoney(price)}.
                </p>
              )
            ) : null}
          </div>
          <form.AppField name="notes">{(f) => <f.TextareaField label="Notes" hint="optional" className="span-all" />}</form.AppField>
        </FormSection>

        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Start finance sale" /></form.AppForm>
          <Link to="/fleet/sales" className="button ghost">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
