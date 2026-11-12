import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useStore } from '@tanstack/react-form'
import { newRentalSearchSchema, startRentalInputSchema } from '~/lib/schemas'
import { centsToInput, labelOptions, methodLabel } from '~/lib/format'
import { startRental, startRentalOptions } from '~/server/rentals.functions'
import { FormError, FormSection, useSchemaForm } from '~/components/form'

export const Route = createFileRoute('/rentals/new')({
  validateSearch: newRentalSearchSchema,
  loader: () => startRentalOptions(),
  head: () => ({ meta: [{ title: 'Start rental · Garage' }] }),
  component: StartRental,
})

const methodOptions = labelOptions(methodLabel)

function StartRental() {
  const search = Route.useSearch()
  const { cars, customers, today } = Route.useLoaderData()
  const navigate = useNavigate()
  const start = useServerFn(startRental)
  const preselected = cars.find((c) => c.id === search.car)

  const { form, formError, onSubmit } = useSchemaForm({
    schema: startRentalInputSchema,
    defaultValues: {
      carId: preselected ? String(preselected.id) : '',
      customerMode: 'existing',
      customerId: search.customer ? String(search.customer) : '',
      firstName: '',
      lastName: '',
      phone: '',
      startDate: today,
      weeklyRent: centsToInput(preselected?.weeklyRateCents ?? null),
      bond: '',
      bondMethod: '',
      notes: '',
    },
    submit: (values) => start({ data: values }),
    onSuccess: ({ id }) => navigate({ to: '/rentals/$rentalId', params: { rentalId: String(id) } }),
  })
  const mode = useStore(form.store, (s) => s.values.customerMode)
  const customerId = useStore(form.store, (s) => s.values.customerId)
  const chosen = customers.find((c) => String(c.id) === customerId)

  const carOptions = cars.map((c) => [String(c.id), `${c.plate} · ${c.name}`] as const)
  const customerOptions = customers.map((c) => [String(c.id), `${c.name} · ${c.phone}`] as const)

  return (
    <div className="panel stack">
      <Link to="/fleet/rentals" className="muted small">← Rentals</Link>
      <h1>Start rental</h1>
      {search.car !== undefined && !preselected && (
        <p className="notice warn">That car isn't a Ready rental car, so it can't be rented right now. Pick another one.</p>
      )}
      <form className="form stack" onSubmit={onSubmit} noValidate>
        <FormSection title="Car">
          <form.AppField
            name="carId"
            listeners={{
              onChange: ({ value }) => {
                // Prefill the rent from the car's weekly rate until staff type their own.
                const car = cars.find((c) => String(c.id) === value)
                if (car?.weeklyRateCents != null && !form.getFieldMeta('weeklyRent')?.isDirty)
                  form.setFieldValue('weeklyRent', centsToInput(car.weeklyRateCents), { dontUpdateMeta: true })
              },
            }}
          >
            {(f) => (
              <f.SelectField label="Rental car" options={carOptions} required className="span-all"
                emptyLabel={cars.length ? 'Select a Ready rental car…' : 'No rental cars are Ready'} />
            )}
          </form.AppField>
        </FormSection>

        <FormSection title="Customer">
          <form.AppField name="customerMode">
            {(f) => <f.SelectField label="Customer" emptyLabel={null}
              options={[['existing', 'Existing customer'], ['new', 'New customer (walk-in)']]} />}
          </form.AppField>
          {mode === 'existing' ? (
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
          {mode === 'new' && (
            <p className="notice warn span-all small">Add the customer's licence photo on their page once the rental has started.</p>
          )}
          {mode === 'existing' && chosen && !chosen.hasLicence && (
            <p className="notice warn span-all small">
              No licence photo on file for {chosen.name}.{' '}
              <Link to="/customers/$customerId" params={{ customerId: String(chosen.id) }}>Upload it on their page</Link>.
            </p>
          )}
        </FormSection>

        <FormSection title="Rent and bond" description="Rent is paid weekly in advance; the first week is due on the start date.">
          <form.AppField name="startDate">{(f) => <f.TextField label="Start date" type="date" required />}</form.AppField>
          <form.AppField name="weeklyRent">
            {(f) => <f.TextField label="Weekly rent ($)" type="number" inputMode="decimal" min={0} step="0.01" required />}
          </form.AppField>
          <form.AppField name="bond">
            {(f) => <f.TextField label="Bond received ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" />}
          </form.AppField>
          <form.AppField name="bondMethod">
            {(f) => <f.SelectField label="Bond paid by" options={methodOptions} emptyLabel="—" />}
          </form.AppField>
          <form.AppField name="notes">{(f) => <f.TextareaField label="Notes" hint="optional" className="span-all" />}</form.AppField>
        </FormSection>

        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Start rental" /></form.AppForm>
          <Link to="/fleet/rentals" className="button ghost">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
