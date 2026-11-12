import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { customerListSearchDefaults, customerListSearchSchema } from '~/lib/schemas'
import { customerName, formatShortDate, initials, whatsappUrl } from '~/lib/format'
import { listCustomers } from '~/server/garage.functions'
import { Pager, ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/customers/')({
  validateSearch: customerListSearchSchema,
  search: { middlewares: [stripSearchParams(customerListSearchDefaults)] },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listCustomers({ data: deps }),
  head: () => ({ meta: [{ title: 'Customers · Garage' }] }),
  component: CustomerList,
})

const sortOptions = [
  ['recent', 'Recently added'],
  ['oldest', 'Oldest first'],
  ['name_asc', 'Name A–Z'],
  ['name_desc', 'Name Z–A'],
] as const

function CustomerList() {
  const { q, sort, size } = Route.useSearch()
  const { items, total, page, pageCount } = Route.useLoaderData()
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Customers <span className="muted">({total})</span></h1>
        <Link to="/customers/new" className="button">New customer</Link>
      </div>
      <div className="row wrap">
        <SearchBox from="/customers/" q={q} placeholder="Search name, company, phone, email, ABN or suburb…" />
        <ParamSelect from="/customers/" param="sort" label="Sort" value={sort} options={sortOptions} />
      </div>
      {items.length === 0 ? (
        <div className="panel muted">
          {q ? 'No customers match this search.' : <>No customers yet. <Link to="/customers/new">Register the first one</Link>.</>}
        </div>
      ) : (
        <div className="table-wrap panel flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hide-narrow">Email</th>
                <th>Mobile</th>
                <th className="hide-narrow">Location</th>
                <th className="hide-narrow">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const wa = whatsappUrl(c.phone)
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to="/customers/$customerId" params={{ customerId: String(c.id) }} className="row name-cell">
                        <span className="avatar" aria-hidden="true">{initials(c)}</span>
                        <span>
                          <strong>{customerName(c)}</strong>
                          {c.company && <span className="muted small block">{c.company}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="hide-narrow">{c.email ?? <span className="muted">—</span>}</td>
                    <td className="nowrap">
                      {c.phone}
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="wa" aria-label={`WhatsApp ${customerName(c)}`}>WA</a>
                      )}
                    </td>
                    <td className="hide-narrow">
                      {c.suburb ? `${c.suburb}${c.state ? `, ${c.state}` : ''}` : <span className="muted">—</span>}
                    </td>
                    <td className="hide-narrow muted nowrap">{formatShortDate(c.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager from="/customers/" page={page} pageCount={pageCount} shown={items.length} total={total} size={size} />
    </div>
  )
}
