import {
  Button, FieldError, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue,
} from 'react-aria-components/Select'

export type SelectOption = readonly [id: string, label: string]

/** React Aria option ids can't be empty, so "" (no value) travels as this id. */
export const NO_VALUE = '__none__'

/**
 * Single-choice dropdown (React Aria Select): a button that opens a listbox
 * popover, with full keyboard and screen-reader support. Styled in styles.css.
 * Option ids must be non-empty; map "no value" to a sentinel id at the call site.
 *
 * Without `showLabel` the label is only the accessible name (toolbar filters);
 * with it, it renders as a form field with label, hint and error.
 */
export function Select({
  label,
  showLabel = false,
  hint,
  error,
  value,
  options,
  onChange,
  onBlur,
  isRequired,
  className,
}: {
  label: string
  showLabel?: boolean
  hint?: string
  error?: string
  value: string
  options: readonly SelectOption[]
  onChange: (id: string) => void
  onBlur?: () => void
  isRequired?: boolean
  className?: string
}) {
  return (
    <AriaSelect
      aria-label={showLabel ? undefined : label}
      value={value}
      onChange={(id) => id != null && onChange(String(id))}
      onBlur={onBlur}
      isRequired={isRequired}
      isInvalid={!!error}
      className={`select ${showLabel ? 'field' : ''} ${className ?? ''}`}
    >
      {showLabel && (
        <Label>
          <span>{label} {hint && <span className="hint">{hint}</span>}</span>
        </Label>
      )}
      <Button className="select-trigger">
        <SelectValue className="select-value" />
        <svg className="select-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </Button>
      {error && <FieldError className="field-error">{error}</FieldError>}
      <Popover className="select-popover" offset={4}>
        <ListBox className="select-list">
          {options.map(([id, text]) => (
            <ListBoxItem key={id} id={id} className="select-option">
              {text}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
