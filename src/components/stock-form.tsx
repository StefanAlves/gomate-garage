import { MANUAL_CAR_STATUSES, carStockInputSchema, type CarStockValues } from '~/lib/schemas'
import { carStatusLabel, centsToInput, featureLabel, labelOptions } from '~/lib/format'
import type { Car } from '~/server/cars.server'
import { FormError, FormSection, useSchemaForm, type Result } from './form'

const statusOptions = MANUAL_CAR_STATUSES.map((s) => [s, carStatusLabel[s]] as const)
const featureOptions = labelOptions(featureLabel)

/**
 * The car's Stock tab: status, the prices for the car's purpose, and listing.
 * Staff can only switch between Preparation and Ready; once a car is Rented,
 * Under finance or Sold the status is shown read-only.
 */
export function StockForm({
  car,
  onSubmit,
  onSuccess,
}: {
  car: Car
  onSubmit: (values: CarStockValues) => Promise<Result<{ id: number }>>
  onSuccess: () => void | Promise<void>
}) {
  const manual = (MANUAL_CAR_STATUSES as readonly string[]).includes(car.status)
  const rental = car.purpose === 'rental'
  const { form, formError, onSubmit: handle } = useSchemaForm({
    schema: carStockInputSchema,
    defaultValues: {
      status: manual ? (car.status as string) : undefined,
      weeklyRate: centsToInput(car.weeklyRateCents),
      askingPrice: centsToInput(car.askingPriceCents),
      minPrice: centsToInput(car.minPriceCents),
      mileageKm: car.mileageKm == null ? '' : String(car.mileageKm),
      listingDescription: car.listingDescription ?? '',
      features: [...car.features] as string[],
    },
    submit: onSubmit,
    onSuccess,
  })

  return (
    <form className="stack form" onSubmit={handle} noValidate>
      <FormSection title="Status">
        {manual ? (
          <form.AppField name="status">
            {(f) => <f.SelectField label="Stock status" options={statusOptions} emptyLabel={null}
              hint={rental ? 'Preparation → Ready → Rented' : 'Preparation → Ready → Under finance → Sold'} className="span-all" />}
          </form.AppField>
        ) : (
          <p className="span-all">
            <span className={`badge status-${car.status}`}>{carStatusLabel[car.status]}</span>{' '}
            <span className="muted small">
              {car.status === 'sold' ? 'This car has been paid off.' : 'Changes when the rental or finance sale ends.'}
            </span>
          </p>
        )}
      </FormSection>

      <FormSection title="Price">
        {rental ? (
          <form.AppField name="weeklyRate">
            {(f) => <f.TextField label="Weekly rent ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="e.g. 190" />}
          </form.AppField>
        ) : (
          <>
            <form.AppField name="askingPrice">
              {(f) => <f.TextField label="Asking price ($)" type="number" inputMode="decimal" min={0} step="0.01" />}
            </form.AppField>
            <form.AppField name="minPrice">
              {(f) => <f.TextField label="Minimum price ($)" hint="internal" type="number" inputMode="decimal" min={0} step="0.01" />}
            </form.AppField>
          </>
        )}
      </FormSection>

      <FormSection title="Listing details">
        <form.AppField name="mileageKm">{(f) => <f.TextField label="Odometer (km)" type="number" inputMode="numeric" min={0} />}</form.AppField>
        <form.AppField name="listingDescription">
          {(f) => <f.TextareaField label="Description" hint="shown to buyers and renters" className="span-all" />}
        </form.AppField>
        <form.AppField name="features">{(f) => <f.CheckboxGroupField label="Features" className="span-all" options={featureOptions} />}</form.AppField>
      </FormSection>

      <FormError error={formError} />
      <div className="row">
        <form.AppForm><form.SubmitButton label="Save stock details" /></form.AppForm>
      </div>
    </form>
  )
}
