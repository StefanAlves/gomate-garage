import { Button, Input, SearchField as AriaSearchField, type SearchFieldProps } from 'react-aria-components/SearchField'

/** React Aria search input with a clear button (Escape also clears). Styled in styles.css. */
export function SearchField({ placeholder, ...props }: Omit<SearchFieldProps, 'children' | 'className'> & { placeholder?: string }) {
  return (
    <AriaSearchField {...props} className="search-field">
      <Input placeholder={placeholder} />
      <Button className="search-clear" aria-label="Clear search">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </Button>
    </AriaSearchField>
  )
}
