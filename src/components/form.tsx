import { useState } from 'react'
import { createFormHook, createFormHookContexts, revalidateLogic, useStore } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { z } from 'zod'
import { Button } from 'react-aria-components/Button'
import { CheckboxGroup } from 'react-aria-components/CheckboxGroup'
import { FieldError, Input, Label, TextArea, TextField as AriaTextField } from 'react-aria-components/TextField'
import { fieldErrors } from '~/lib/schemas'
import { Checkbox } from '~/components/ui/checkbox'
import { NO_VALUE, Select, type SelectOption } from '~/components/ui/select'

export type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }
type Options = readonly (readonly [string, string])[]

// ---- TanStack Form wiring --------------------------------------------------------

export const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts()

/** First error on the bound field, from client validation or the server. */
function useFieldError() {
  const field = useFieldContext<unknown>()
  const errors = useStore(field.store, (s) => s.meta.errors)
  const first = errors.find(Boolean)
  return first == null ? undefined : String(first)
}

/** Label + hint + error around a control. Also usable on its own (no form context). */
export function FieldShell({ label, hint, error, className, children }: {
  label: string
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={className}>
      <span>
        {label} {hint && <span className="hint">{hint}</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

type TextFieldProps = { label: string; hint?: string; className?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'className' | 'style'
> & { style?: React.CSSProperties }

// Form fields are React Aria components. Validation comes from the Zod schema
// and the server, so React Aria only shows the error (validationBehavior="aria",
// no native browser validation).

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <Label>
      <span>{label} {hint && <span className="hint">{hint}</span>}</span>
    </Label>
  )
}

function TextField({ label, hint, className, required, ...input }: TextFieldProps) {
  const field = useFieldContext<string>()
  const error = useFieldError()
  return (
    <AriaTextField
      name={field.name}
      value={field.state.value}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      isInvalid={!!error}
      isRequired={required}
      validationBehavior="aria"
      className={`field ${className ?? ''}`}
    >
      <FieldLabel label={label} hint={hint} />
      <Input {...input} />
      {error && <FieldError className="field-error">{error}</FieldError>}
    </AriaTextField>
  )
}

function TextareaField({ label, hint, className, rows = 3 }: { label: string; hint?: string; className?: string; rows?: number }) {
  const field = useFieldContext<string>()
  const error = useFieldError()
  return (
    <AriaTextField
      name={field.name}
      value={field.state.value}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      isInvalid={!!error}
      validationBehavior="aria"
      className={`field ${className ?? ''}`}
    >
      <FieldLabel label={label} hint={hint} />
      <TextArea rows={rows} />
      {error && <FieldError className="field-error">{error}</FieldError>}
    </AriaTextField>
  )
}

/** React Aria Select with an optional empty choice; `options` are [value, label] pairs. */
function SelectField({ label, hint, className, options, emptyLabel = 'Select…', required }: {
  label: string
  hint?: string
  className?: string
  options: Options
  /** Label for the "" option; pass null to omit it. */
  emptyLabel?: string | null
  required?: boolean
}) {
  const field = useFieldContext<string>()
  const error = useFieldError()
  const value = field.state.value
  // Keep a stored value that is no longer offered (e.g. a deleted customer) selectable.
  const missing = value !== '' && !options.some(([v]) => v === value)
  const choices: SelectOption[] = [
    ...(emptyLabel !== null ? [[NO_VALUE, emptyLabel] as const] : []),
    ...(missing ? [[value, value] as const] : []),
    ...options,
  ]
  return (
    <Select
      label={label}
      showLabel
      hint={hint}
      error={error}
      value={value || NO_VALUE}
      options={choices}
      onChange={(id) => field.handleChange(id === NO_VALUE ? '' : id)}
      onBlur={field.handleBlur}
      isRequired={required}
      className={className}
    />
  )
}

function CheckboxField({ label, hint, className }: { label: string; hint?: string; className?: string }) {
  const field = useFieldContext<boolean>()
  return (
    <Checkbox
      name={field.name}
      isSelected={field.state.value}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      className={className}
    >
      {label} {hint && <span className="hint">{hint}</span>}
    </Checkbox>
  )
}

/** Several checkboxes editing one string[] value (React Aria CheckboxGroup). */
function CheckboxGroupField({ label, options, className }: { label: string; options: Options; className?: string }) {
  const field = useFieldContext<string[]>()
  const error = useFieldError()
  return (
    <CheckboxGroup
      name={field.name}
      value={field.state.value}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      isInvalid={!!error}
      validationBehavior="aria"
      className={`check-group ${className ?? ''}`}
    >
      <Label className="group-label">{label}</Label>
      <div className="row wrap">
        {options.map(([value, text]) => (
          <Checkbox key={value} value={value}>{text}</Checkbox>
        ))}
      </div>
      {error && <FieldError className="field-error">{error}</FieldError>}
    </CheckboxGroup>
  )
}

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext()
  const submitting = useStore(form.store, (s) => s.isSubmitting)
  return (
    <Button type="submit" isDisabled={submitting}>
      {submitting ? 'Saving…' : label}
    </Button>
  )
}

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, CheckboxField, CheckboxGroupField },
  formComponents: { SubmitButton },
})

// ---- Schema-backed forms ----------------------------------------------------------

/** Server errors live in the field's `onServer` slot until that field is edited or the form is resubmitted. */
function setServerError(field: AnyFieldApi | undefined, message: string | undefined) {
  field?.setMeta((m) => ({ ...m, errorMap: { ...m.errorMap, onServer: message } }))
}

/**
 * A TanStack form validated by the shared Zod schema: on submit, then on every
 * change once submitted. Valid values are parsed (so the server gets the
 * schema's output) and sent to a server function, which validates again and
 * may return field errors (e.g. duplicate plate).
 *
 * `defaultValues` are the raw input values (strings, booleans, string[]).
 */
export function useSchemaForm<TValues extends Record<string, unknown>, TOut, T>({
  schema,
  defaultValues,
  submit,
  onSuccess,
}: {
  schema: z.ZodType<TOut>
  defaultValues: TValues
  submit: (values: TOut) => Promise<Result<T>>
  onSuccess: (value: T) => void | Promise<void>
}) {
  const [formError, setFormError] = useState<string>()

  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => {
        const parsed = schema.safeParse(value)
        if (parsed.success) return undefined
        const { form: formLevel, ...fields } = fieldErrors(parsed.error)
        return { form: formLevel, fields } as never
      },
    },
    listeners: {
      onChange: ({ fieldApi }) => {
        if (fieldApi.state.meta.errorMap.onServer) setServerError(fieldApi, undefined)
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await submit(schema.parse(value))
        if (result.ok) return await onSuccess(result.value)
        const { form: formLevel, ...fields } = result.errors
        for (const [name, message] of Object.entries(fields)) setServerError((formApi.getFieldInfo(name as never).instance ?? undefined) as AnyFieldApi | undefined, message)
        setFormError(formLevel)
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Something went wrong')
      }
    },
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    e.stopPropagation()
    setFormError(undefined)
    for (const info of Object.values(form.fieldInfo) as { instance: AnyFieldApi | null }[]) {
      if (info.instance?.state.meta.errorMap.onServer) setServerError(info.instance, undefined)
    }
    void form.handleSubmit()
  }

  return { form, formError, onSubmit }
}

// ---- Plain building blocks ----------------------------------------------------------

/** A titled group of fields inside a form (e.g. "Contact details"). */
export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      {description && <p className="muted small">{description}</p>}
      <div className="form-grid">{children}</div>
    </fieldset>
  )
}

export function FormError({ error }: { error?: string }) {
  return error ? <p className="notice error" role="alert">{error}</p> : null
}

/** Two-step delete button, so no browser confirm() dialog is needed. */
export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!armed)
    return <Button className="ghost danger" onPress={() => setArmed(true)}>{label}</Button>
  return (
    <span className="row">
      <Button
        className="danger"
        isDisabled={busy}
        onPress={async () => {
          setBusy(true)
          try { await onConfirm() } finally { setBusy(false); setArmed(false) }
        }}
      >
        {busy ? 'Deleting…' : 'Confirm delete'}
      </Button>
      <Button className="ghost" onPress={() => setArmed(false)}>Cancel</Button>
    </span>
  )
}
