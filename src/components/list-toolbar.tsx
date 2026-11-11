import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PAGE_SIZES } from '~/lib/schemas'

// The URL is the state for every list control: search, sort, filters, page.
// Changing anything except the page resets to page 1.

type ListRoute = '/customers/' | '/cars/' | '/fleet/' | '/fleet/stock' | '/fleet/fines' | '/fleet/tolls' | '/fleet/transactions'
type Params = Record<string, unknown>

export function useSetSearch(from: ListRoute) {
  const navigate = useNavigate({ from })
  return (patch: Params) =>
    navigate({ search: ((prev: Params) => ({ ...prev, page: undefined, ...patch })) as never, replace: true })
}

/** Debounced search box that writes `q` to the URL. */
export function SearchBox({ from, q, placeholder }: { from: ListRoute; q?: string; placeholder: string }) {
  const setSearch = useSetSearch(from)
  const [value, setValue] = useState(q ?? '')
  useEffect(() => setValue(q ?? ''), [q])
  useEffect(() => {
    if ((q ?? '') === value) return
    const t = setTimeout(() => setSearch({ q: value || undefined }), 250)
    return () => clearTimeout(t)
  }, [value, q]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      type="search"
      className="grow"
      aria-label="Search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}

/** A <select> bound to one search param. `options` are [value, label]; "" clears the param. */
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
    <select aria-label={label} value={value} onChange={(e) => setSearch({ [param]: e.target.value || undefined })}>
      {options.map(([v, text]) => (
        <option key={v} value={v}>{text}</option>
      ))}
    </select>
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
