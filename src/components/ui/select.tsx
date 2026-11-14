import { Button, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue } from 'react-aria-components/Select'

export type SelectOption = readonly [id: string, label: string]

/**
 * Single-choice dropdown (React Aria Select): a button that opens a listbox
 * popover, with full keyboard and screen-reader support. Styled in styles.css.
 * Option ids must be non-empty; map "no value" to a sentinel id at the call site.
 */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name; there is no visible label. */
  label: string
  value: string
  options: readonly SelectOption[]
  onChange: (id: string) => void
}) {
  return (
    <AriaSelect aria-label={label} value={value} onChange={(id) => id != null && onChange(String(id))} className="select">
      <Button className="select-trigger">
        <SelectValue />
        <svg className="select-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </Button>
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
