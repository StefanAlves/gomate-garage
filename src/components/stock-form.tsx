import { CAR_STATUSES, carStockInputSchema, type CarStockValues } from '~/lib/schemas'
import { carStatusLabel, centsToInput, featureLabel, labelOptions } from '~/lib/format'
import type { Car } from '~/server/cars.server'
import { FormError, FormSection, useSchemaForm, type Result } from './form'

const statusOptions = CAR_STATUSES.map((s) => [s, carStatusLabel[s]] as const)
const featureOptions = labelOptions(featureLabel)

/**
 * The car's Stock tab: lifecycle status, sale / rent listing and odometer.
 * Prices stay in the form state when a listing is switched off, so turning
 * it back on doesn't lose them.
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
  const { form, formError, onSubmit: handle } = useSchemaForm({
    schema: carStockInputSchema,
    defaultValues: {
      status: car.status as string,
      forRent: car.forRent,
      weeklyRate: centsToInput(car.weeklyRateCents),
      forSale: car.forSale,
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
        <form.AppField name="status">
          {(f) => <f.SelectField label="Stock status" options={statusOptions} emptyLabel={null}
            hint="Preparation → Ready → Out (with a customer) → Sold / Returned" className="span-all" />}
        </form.AppField>
      </FormSection>

      <FormSection title="Listing" description="What this car is offered for. Both can be on.">
        <form.AppField name="forRent">{(f) => <f.CheckboxField label="For rent" className="span-all" />}</form.AppField>
        <form.Subscribe selector={(s) => s.values.forRent}>
          {(forRent) => (
            <div className="form-grid span-all" hidden={!forRent}>
              <form.AppField name="weeklyRate">
                {(f) => <f.TextField label="Weekly rate ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="e.g. 190" />}
              </form.AppField>
            </div>
          )}
        </form.Subscribe>
        <form.AppField name="forSale">{(f) => <f.CheckboxField label="For sale" className="span-all" />}</form.AppField>
        <form.Subscribe selector={(s) => s.values.forSale}>
          {(forSale) => (
            <div className="form-grid span-all" hidden={!forSale}>
              <form.AppField name="askingPrice">
                {(f) => <f.TextField label="Asking price ($)" type="number" inputMode="decimal" min={0} step="0.01" />}
              </form.AppField>
              <form.AppField name="minPrice">
                {(f) => <f.TextField label="Minimum price ($)" hint="internal" type="number" inputMode="decimal" min={0} step="0.01" />}
              </form.AppField>
            </div>
          )}
        </form.Subscribe>
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
