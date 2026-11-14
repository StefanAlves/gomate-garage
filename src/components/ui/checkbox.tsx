import { CheckboxButton, CheckboxField, type CheckboxFieldProps } from 'react-aria-components/Checkbox'

/** React Aria checkbox with its label. Styled in styles.css. */
export function Checkbox({ children, ...props }: Omit<CheckboxFieldProps, 'children' | 'className'> & { children: React.ReactNode }) {
  return (
    <CheckboxField {...props} className="checkbox">
      <CheckboxButton className="checkbox-button">
        <span className="checkbox-box" aria-hidden="true">
          <svg viewBox="0 0 18 18">
            <polyline points="3.5 9.5 7.5 13 14.5 5" />
          </svg>
        </span>
        {children}
      </CheckboxButton>
    </CheckboxField>
  )
}
