import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { PAGE_SIZES } from '~/lib/schemas'
import { Link } from '~/components/ui/link'
import { SearchField } from '~/components/ui/search-field'
import { NO_VALUE, Select } from '~/components/ui/select'

// The URL is the state for every list control: search, sort, filters, page.
// Changing anything except the page resets to page 1.

type ListRoute = '/customers/' | '/cars/' | '/fleet/' | '/fleet/stock' | '/fleet/rentals' | '/fleet/sales' | '/fleet/maintenance' | '/fleet/fines' | '/fleet/tolls' | '/fleet/transactions'
type Params = Record<string, unknown>

export function useSetSearch(from: ListRoute) {
  const navigate = useNavigate({ from })
  return (patch: Params) =>
    navigate({ search: ((prev: Params) => ({ ...prev, page: undefined, ...patch })) as never, replace: true })
}

const SEARCH_DELAY_MS = 400

/**
 * Debounced search box that writes `q` to the URL. The URL only catches up
 * once the new results have loaded, by which time staff may have typed more,
 * so the box ignores `q` values it sent itself and follows only changes made
 * elsewhere (back button, a link that clears the search).
 */
export function SearchBox({ from, q, placeholder }: { from: ListRoute; q?: string; placeholder: string }) {
  const setSearch = useSetSearch(from)
  const [value, setValue] = useState(q ?? '')
  const wanted = useRef(q ?? '') // what the URL should end up holding
  const sent = useRef<string[]>([]) // values sent to the URL that haven't come back yet

  useEffect(() => {
    const incoming = q ?? ''
    const echo = sent.current.indexOf(incoming)
    if (echo >= 0) {
      sent.current = sent.current.slice(echo + 1) // our own earlier value: keep what's typed
      return
    }
    sent.current = []
    wanted.current = incoming
    setValue(incoming)
  }, [q])

  useEffect(() => {
    if (value === wanted.current) return
    const t = setTimeout(() => {
      wanted.current = value
      sent.current.push(value)
      setSearch({ q: value || undefined })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return <SearchField aria-label="Search" placeholder={placeholder} value={value} onChange={setValue} />
}

/** A React Aria Select bound to one search param. `options` are [value, label]; "" clears the param. */
export function ParamSelect({
  from,
  param,
  label,
  value,
  options,
}: {
  from: ListRoute
  param: string
  label: string
  value: string
  options: readonly (readonly [string, string])[]
}) {
  const setSearch = useSetSearch(from)
  return (
    <Select
      label={label}
      value={value || NO_VALUE}
      options={options.map(([v, text]) => [v || NO_VALUE, text] as const)}
      onChange={(id) => setSearch({ [param]: id === NO_VALUE ? undefined : id })}
    />
  )
}

export function Pager({
  from,
  page,
  pageCount,
  shown,
  total,
  size,
}: {
  from: ListRoute
  page: number
  pageCount: number
  shown: number
  total: number
  size: number
}) {
  return (
    <nav className="row wrap between pager" aria-label="Pagination">
      <span className="muted small">Showing {shown} of {total}</span>
      {pageCount > 1 && (
        <span className="row">
          <Link from={from} search={(p: Params) => ({ ...p, page: page - 1 }) as never} disabled={page <= 1} className="button ghost">← Prev</Link>
          <span className="muted small">Page {page} of {pageCount}</span>
          <Link from={from} search={(p: Params) => ({ ...p, page: page + 1 }) as never} disabled={page >= pageCount} className="button ghost">Next →</Link>
        </span>
      )}
      <ParamSelect from={from} param="size" label="Rows per page" value={String(size)}
        options={PAGE_SIZES.map((n) => [String(n), `${n} per page`] as const)} />
    </nav>
  )
}
