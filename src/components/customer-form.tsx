import { AU_STATES, CONTACT_METHODS, customerInputSchema, type CustomerValues } from '~/lib/schemas'
import { contactLabel } from '~/lib/format'
import { FormError, FormSection, useSchemaForm, type Result } from './form'

const stateOptions = AU_STATES.map((s) => [s, s] as const)
const contactOptions = CONTACT_METHODS.map((m) => [m, contactLabel[m]] as const)

/** Stored customer → raw form values. */
function toFormValues(v: Partial<CustomerValues> = {}) {
  return {
    firstName: v.firstName ?? '',
    lastName: v.lastName ?? '',
    company: v.company ?? '',
    taxId: v.taxId ?? '',
    email: v.email ?? '',
    phone: v.phone ?? '',
    landline: v.landline ?? '',
    street: v.street ?? '',
    suburb: v.suburb ?? '',
    state: v.state ?? '',
    postcode: v.postcode ?? '',
    newsletterOptIn: v.newsletterOptIn ?? false,
    marketingOptIn: v.marketingOptIn ?? false,
    preferredContact: [...(v.preferredContact ?? [])] as string[],
    tags: v.tags?.join(', ') ?? '',
    licenceNumber: v.licenceNumber ?? '',
    licenceExpiry: v.licenceExpiry ?? '',
    passportNumber: v.passportNumber ?? '',
    notes: v.notes ?? '',
  }
}

/**
 * Customer form. `compact` shows only personal + contact details (the
 * quick "new customer" flow); the full form is the Contact tab.
 */
export function CustomerForm({
  initial,
  compact = false,
  submitLabel,
  onSubmit,
  onSuccess,
  children,
}: {
  initial?: Partial<CustomerValues>
  compact?: boolean
  submitLabel: string
  onSubmit: (values: CustomerValues) => Promise<Result<{ id: number }>>
  onSuccess: (value: { id: number }) => void | Promise<void>
  children?: React.ReactNode
}) {
  const { form, formError, onSubmit: handle } = useSchemaForm({
    schema: customerInputSchema,
    defaultValues: toFormValues(initial),
    submit: onSubmit,
    onSuccess,
  })

  return (
    <form className="stack form" onSubmit={handle} noValidate>
      <FormSection title="Personal details">
        <form.AppField name="firstName">{(f) => <f.TextField label="First name" required autoComplete="off" placeholder="e.g. John" />}</form.AppField>
        <form.AppField name="lastName">{(f) => <f.TextField label="Last name" autoComplete="off" placeholder="e.g. Smith" />}</form.AppField>
        <form.AppField name="company">{(f) => <f.TextField label="Company name" hint="optional" placeholder="e.g. Smith Auto Repairs" />}</form.AppField>
        <form.AppField name="taxId">{(f) => <f.TextField label="ABN" hint="optional, for invoices" placeholder="e.g. 51 824 753 556" />}</form.AppField>
      </FormSection>

      <FormSection title="Contact details">
        <form.AppField name="email">{(f) => <f.TextField label="Email" type="email" hint="optional" className="span-all" placeholder="e.g. john@example.com" />}</form.AppField>
        <form.AppField name="phone">{(f) => <f.TextField label="Mobile" type="tel" required placeholder="e.g. 0412 345 678" />}</form.AppField>
        <form.AppField name="landline">{(f) => <f.TextField label="Landline" type="tel" hint="optional" placeholder="e.g. 03 9876 5432" />}</form.AppField>
      </FormSection>

      {!compact && (
        <>
          <FormSection title="Address">
            <form.AppField name="street">{(f) => <f.TextField label="Street address" className="span-all" placeholder="e.g. 123 Main St" />}</form.AppField>
            <form.AppField name="suburb">{(f) => <f.TextField label="Suburb" placeholder="e.g. Richmond" />}</form.AppField>
            <form.AppField name="state">{(f) => <f.SelectField label="State" options={stateOptions} />}</form.AppField>
            <form.AppField name="postcode">{(f) => <f.TextField label="Postcode" inputMode="numeric" maxLength={4} placeholder="e.g. 3121" />}</form.AppField>
          </FormSection>

          <FormSection title="Marketing & communication">
            <form.AppField name="newsletterOptIn">{(f) => <f.CheckboxField label="Newsletter" />}</form.AppField>
            <form.AppField name="marketingOptIn">{(f) => <f.CheckboxField label="Marketing promotions" />}</form.AppField>
            <form.AppField name="preferredContact">
              {(f) => <f.CheckboxGroupField label="Preferred contact method" className="span-all" options={contactOptions} />}
            </form.AppField>
          </FormSection>

          <FormSection title="Tags" description="Group customers for coupons and filtering. Separate tags with commas.">
            <form.AppField name="tags">{(f) => <f.TextField label="Tags" className="span-all" placeholder="e.g. vip, fleet, rideshare" autoComplete="off" />}</form.AppField>
          </FormSection>

          <FormSection title="Documents">
            <form.AppField name="licenceNumber">{(f) => <f.TextField label="Driver's licence number" autoComplete="off" />}</form.AppField>
            <form.AppField name="licenceExpiry">{(f) => <f.TextField label="Licence expiry" type="date" />}</form.AppField>
            <form.AppField name="passportNumber">{(f) => <f.TextField label="Passport number" hint="if no Australian licence" autoComplete="off" />}</form.AppField>
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
