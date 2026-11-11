import { useState } from 'react'
import { createFormHook, createFormHookContexts, revalidateLogic, useStore } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { z } from 'zod'
import { fieldErrors } from '~/lib/schemas'

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
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur'
>

function TextField({ label, hint, className, ...input }: TextFieldProps) {
  const field = useFieldContext<string>()
  const error = useFieldError()
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      <input
        {...input}
        name={field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={!!error}
      />
    </FieldShell>
  )
}

function TextareaField({ label, hint, className, rows = 3 }: { label: string; hint?: string; className?: string; rows?: number }) {
  const field = useFieldContext<string>()
  const error = useFieldError()
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      <textarea
        name={field.name}
        rows={rows}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={!!error}
      />
    </FieldShell>
  )
}

/** <select> with an optional empty choice; `options` are [value, label] pairs. */
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
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      <select
        name={field.name}
        value={value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={!!error}
        required={required}
      >
        {emptyLabel !== null && <option value="">{emptyLabel}</option>}
        {missing && <option value={value}>{value}</option>}
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </FieldShell>
  )
}

function CheckboxField({ label, hint, className }: { label: string; hint?: string; className?: string }) {
  const field = useFieldContext<boolean>()
  return (
    <label className={`check ${className ?? ''}`}>
      <input
        type="checkbox"
        name={field.name}
        checked={field.state.value}
        onChange={(e) => field.handleChange(e.target.checked)}
        onBlur={field.handleBlur}
      />
      <span>
        {label} {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  )
}

/** Several checkboxes editing one string[] value. */
function CheckboxGroupField({ label, options, className }: { label: string; options: Options; className?: string }) {
  const field = useFieldContext<string[]>()
  const error = useFieldError()
  const selected = field.state.value
  return (
    <div role="group" aria-label={label} className={`check-group ${className ?? ''}`}>
      <span className="group-label">{label}</span>
      <div className="row wrap">
        {options.map(([value, text]) => (
          <label key={value} className="check">
            <input
              type="checkbox"
              name={field.name}
              value={value}
              checked={selected.includes(value)}
              onChange={(e) =>
                field.handleChange(e.target.checked ? [...selected, value] : selected.filter((s) => s !== value))
              }
              onBlur={field.handleBlur}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext()
  const submitting = useStore(form.store, (s) => s.isSubmitting)
  return (
    <button type="submit" disabled={submitting}>
      {submitting ? 'Saving…' : label}
    </button>
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
    return <button type="button" className="ghost danger" onClick={() => setArmed(true)}>{label}</button>
  return (
    <span className="row">
      <button
        type="button"
        className="danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try { await onConfirm() } finally { setBusy(false); setArmed(false) }
        }}
      >
        {busy ? 'Deleting…' : 'Confirm delete'}
      </button>
      <button type="button" className="ghost" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  )
}
