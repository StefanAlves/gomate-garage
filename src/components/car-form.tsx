import {
  CAR_PURPOSES, COLOURS, type CarPurpose, FUEL_TYPES, MANUAL_CAR_STATUSES, carInputSchema, newCarInputSchema, type CarValues, type NewCarValues,
} from '~/lib/schemas'
import { carPurposeLabel, carStatusLabel, formatMonth, fuelLabel } from '~/lib/format'
import { FormError, FormSection, useSchemaForm, type Result } from './form'

const purposeOptions = CAR_PURPOSES.map((p) => [p, carPurposeLabel[p]] as const)
const statusOptions = MANUAL_CAR_STATUSES.map((s) => [s, carStatusLabel[s]] as const)
const colourOptions = COLOURS.map((c) => [c, c] as const)
const fuelOptions = FUEL_TYPES.map((f) => [f, fuelLabel[f]] as const)

const str = (v: string | number | null | undefined) => (v == null ? '' : String(v))

/** Stored car → raw form values. */
function toFormValues(v: Partial<CarValues> = {}) {
  return {
    // Only read by the new-car schema; the edit schema drops them.
    purpose: '',
    status: 'preparation',
    plate: v.plate ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    variant: str(v.variant),
    year: str(v.year),
    color: str(v.color),
    vin: str(v.vin),
    engineNumber: str(v.engineNumber),
    buildDate: formatMonth(v.buildDate ?? null),
    complianceDate: formatMonth(v.complianceDate ?? null),
    engineType: str(v.engineType),
    cylinders: str(v.cylinders),
    fuelType: str(v.fuelType),
    transmission: str(v.transmission),
    bodyStyle: str(v.bodyStyle),
    radioPin: str(v.radioPin),
    mileageKm: str(v.mileageKm),
    nextServiceDate: str(v.nextServiceDate),
    nextServiceKm: str(v.nextServiceKm),
    nextTransmissionDate: str(v.nextTransmissionDate),
    nextTransmissionKm: str(v.nextTransmissionKm),
    regoExpiry: str(v.regoExpiry),
    insuranceProvider: str(v.insuranceProvider),
    insurancePolicy: str(v.insurancePolicy),
    insuranceExpiry: str(v.insuranceExpiry),
    ppsrChecked: v.ppsrChecked ?? false,
    writtenOff: v.writtenOff ?? false,
    notes: str(v.notes),
  }
}

type Submit<T> = (values: T) => Promise<Result<{ id: number }>>

/**
 * Car form. `isNew` is the quick "add a car" form: purpose (fixed for life),
 * starting status and the basic details. Otherwise it's the full
 * Specifications tab, where purpose and status can't be changed.
 */
export function CarForm({
  initial,
  purpose,
  submitLabel,
  onSuccess,
  children,
  ...mode
}: {
  initial?: Partial<CarValues>
  /** The saved car's purpose. Rental cars' odometer and next service come from the Maintenance tab. */
  purpose?: CarPurpose
  submitLabel: string
  onSuccess: (value: { id: number }) => void | Promise<void>
  children?: React.ReactNode
} & ({ isNew: true; onSubmit: Submit<NewCarValues> } | { isNew?: false; onSubmit: Submit<CarValues> })) {
  const { form, formError, onSubmit: handle } = useSchemaForm<ReturnType<typeof toFormValues>, CarValues, { id: number }>({
    schema: mode.isNew ? newCarInputSchema : carInputSchema,
    defaultValues: toFormValues(initial),
    // The new-car schema's output always carries purpose and status.
    submit: mode.isNew ? (values) => mode.onSubmit(values as NewCarValues) : mode.onSubmit,
    onSuccess,
  })
  const compact = !!mode.isNew
  const maintained = !mode.isNew && purpose === 'rental'
  const color = initial?.color
  const colours = color && !(COLOURS as readonly string[]).includes(color) ? [...colourOptions, [color, color] as const] : colourOptions
  const upper = { textTransform: 'uppercase' } as const

  return (
    <form className="stack form" onSubmit={handle} noValidate>
      {compact && (
        <FormSection title="Purpose" description="Every car is kept for renting or for selling. This can't be changed later.">
          <form.AppField name="purpose">
            {(f) => <f.SelectField label="Purpose" options={purposeOptions} emptyLabel="Choose…" required />}
          </form.AppField>
          <form.AppField name="status">{(f) => <f.SelectField label="Status" options={statusOptions} emptyLabel={null} />}</form.AppField>
        </FormSection>
      )}

      <FormSection title="Vehicle details">
        <form.AppField name="make">{(f) => <f.TextField label="Make" required placeholder="e.g. Toyota" />}</form.AppField>
        <form.AppField name="model">{(f) => <f.TextField label="Model" required placeholder="e.g. Corolla" />}</form.AppField>
        <form.AppField name="variant">{(f) => <f.TextField label="Variant" hint="optional" placeholder="e.g. XTR" />}</form.AppField>
        <form.AppField name="year">{(f) => <f.TextField label="Year" type="number" inputMode="numeric" placeholder="e.g. 2021" />}</form.AppField>
        <form.AppField name="plate">
          {(f) => <f.TextField label="Registration" required autoComplete="off" placeholder="e.g. ABC123" style={upper} />}
        </form.AppField>
        <form.AppField name="color">{(f) => <f.SelectField label="Colour" options={colours} />}</form.AppField>
        {!maintained && (
          <form.AppField name="mileageKm">{(f) => <f.TextField label="Odometer (km)" type="number" inputMode="numeric" min={0} />}</form.AppField>
        )}
        <form.AppField name="fuelType">{(f) => <f.SelectField label="Fuel" options={fuelOptions} />}</form.AppField>
        <form.AppField name="transmission">{(f) => <f.TextField label="Transmission" placeholder="e.g. Automatic" />}</form.AppField>
      </FormSection>

      {!compact && (
        <>
          <FormSection title="Specifications">
            <form.AppField name="vin">
              {(f) => <f.TextField label="VIN" hint="17 chars" className="span-all" maxLength={17} autoComplete="off"
                placeholder="e.g. 1HGCM82633A004352" style={upper} />}
            </form.AppField>
            <form.AppField name="engineNumber">{(f) => <f.TextField label="Engine no." autoComplete="off" />}</form.AppField>
            <form.AppField name="engineType">{(f) => <f.TextField label="Engine type" placeholder="e.g. 2.0L Turbo" />}</form.AppField>
            <form.AppField name="cylinders">
              {(f) => <f.TextField label="Cylinders" type="number" inputMode="numeric" min={1} max={16} placeholder="e.g. 4" />}
            </form.AppField>
            <form.AppField name="bodyStyle">{(f) => <f.TextField label="Body style" placeholder="e.g. Sedan" />}</form.AppField>
            <form.AppField name="buildDate">{(f) => <f.TextField label="Build date" placeholder="MM/YYYY" inputMode="numeric" />}</form.AppField>
            <form.AppField name="complianceDate">{(f) => <f.TextField label="Compliance date" placeholder="MM/YYYY" inputMode="numeric" />}</form.AppField>
            <form.AppField name="radioPin">{(f) => <f.TextField label="Radio PIN" autoComplete="off" placeholder="e.g. 1234" />}</form.AppField>
          </FormSection>

          <FormSection
            title="Maintenance tracking"
            description={maintained ? 'The odometer and next service are worked out on the Maintenance tab.' : undefined}
          >
            {!maintained && (
              <>
                <form.AppField name="nextServiceDate">{(f) => <f.TextField label="Next service date" type="date" />}</form.AppField>
                <form.AppField name="nextServiceKm">{(f) => <f.TextField label="Next service (km)" type="number" inputMode="numeric" min={0} />}</form.AppField>
              </>
            )}
            <form.AppField name="nextTransmissionDate">{(f) => <f.TextField label="Next transmission service" type="date" />}</form.AppField>
            <form.AppField name="nextTransmissionKm">
              {(f) => <f.TextField label="Next transmission (km)" type="number" inputMode="numeric" min={0} />}
            </form.AppField>
          </FormSection>

          <FormSection title="Registration & compliance">
            <form.AppField name="regoExpiry">{(f) => <f.TextField label="Rego expiry" type="date" />}</form.AppField>
            <form.AppField name="insuranceProvider">{(f) => <f.TextField label="Insurance provider" />}</form.AppField>
            <form.AppField name="insurancePolicy">{(f) => <f.TextField label="Policy number" autoComplete="off" />}</form.AppField>
            <form.AppField name="insuranceExpiry">{(f) => <f.TextField label="Insurance expiry" type="date" />}</form.AppField>
            <form.AppField name="ppsrChecked">{(f) => <f.CheckboxField label="PPSR checked" />}</form.AppField>
            <form.AppField name="writtenOff">{(f) => <f.CheckboxField label="Written off" />}</form.AppField>
          </FormSection>

          <FormSection title="Notes">
            <form.AppField name="notes">{(f) => <f.TextareaField label="Notes" hint="internal only" className="span-all" />}</form.AppField>
          </FormSection>
        </>
      )}

      <FormError error={formError} />
      <div className="row wrap between">
        <form.AppForm><form.SubmitButton label={submitLabel} /></form.AppForm>
        {children}
      </div>
    </form>
  )
}
