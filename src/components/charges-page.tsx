import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import type { ChargeKind } from '~/lib/schemas'
import { chargeStatusLabel, formatDate, formatMoney, labelOptions } from '~/lib/format'
import { createCharge, deleteCharge, updateCharge } from '~/server/fleet.functions'
import type { Charge } from '~/server/charges.server'
import { ChargeForm, type PickerOptions } from './charge-form'
import { DeleteButton } from './form'
import { Pager, ParamSelect, SearchBox } from './list-toolbar'

type Data = { items: Charge[]; total: number; amountCents: number; page: number; pageCount: number }
type Search = { q?: string; status?: string; customer?: number; size: number }

/** Fines and tolls list: filters, inline add / edit form and a running total. */
export function ChargesPage({
  kind,
  from,
  data,
  search,
  options,
  today,
}: {
  kind: ChargeKind
  from: '/fleet/fines' | '/fleet/tolls'
  data: Data
  search: Search
  options: PickerOptions
  today: string
}) {
  const router = useRouter()
  const create = useServerFn(createCharge)
  const update = useServerFn(updateCharge)
  const remove = useServerFn(deleteCharge)
  const [editing, setEditing] = useState<'new' | Charge | null>(null)
  const fine = kind === 'fine'
  const noun = fine ? 'fine' : 'toll'
  const title = fine ? 'Fines' : 'Tolls'
  const filtered = !!search.q || !!search.status || search.customer !== undefined

  const done = async () => {
    setEditing(null)
    await router.invalidate()
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{title} <span className="muted">({data.total})</span></h1>
        <button type="button" onClick={() => setEditing('new')} disabled={editing === 'new'}>Add {noun}</button>
      </div>

      {editing && (
        <section className="panel stack" aria-label={editing === 'new' ? `Add ${noun}` : `Edit ${noun}`}>
          <h2>{editing === 'new' ? `Add ${noun}` : `Edit ${noun}`}</h2>
          <ChargeForm
            key={editing === 'new' ? 'new' : editing.id}
            kind={kind}
            options={options}
            today={today}
            initial={editing === 'new' ? undefined : editing}
            onSubmit={(values) => (editing === 'new' ? create({ data: values }) : update({ data: { id: editing.id, values } }))}
            onSuccess={done}
            onCancel={() => setEditing(null)}
          />
        </section>
      )}

      <div className="row wrap">
        <SearchBox from={from} q={search.q} placeholder={`Search ${fine ? 'rego, notice # or offence' : 'rego or notice #'}…`} />
        <ParamSelect from={from} param="status" label="Status" value={search.status ?? ''}
          options={[['', 'All statuses'], ...labelOptions(chargeStatusLabel)]} />
        <ParamSelect from={from} param="customer" label="Customer" value={search.customer === undefined ? '' : String(search.customer)}
          options={[['', 'All customers'], ...options.customers.map((c) => [String(c.id), c.name] as const)]} />
      </div>

      {data.items.length === 0 ? (
        <div className="panel muted">{filtered ? `No ${noun}s match these filters.` : `No ${noun}s recorded yet.`}</div>
      ) : (
        <div className="table-wrap panel flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>{fine ? 'Offence date' : 'Travel date'}</th>
                <th>Rego</th>
                <th>Customer</th>
                {fine && <th className="hide-narrow">Offence</th>}
                <th className="hide-narrow">Notice #</th>
                <th className="num">Amount</th>
                <th className="hide-narrow">Due</th>
                <th>Status</th>
                <th className="hide-narrow">Note</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.incurredOn)}</td>
                  <td>
                    {c.carId == null ? <span className="muted">Unknown</span> : (
                      <Link to="/cars/$carId" params={{ carId: String(c.carId) }} search={{ tab: fine ? 'fines' : 'tolls' }}>
                        <span className="plate">{c.carPlate}</span>
                      </Link>
                    )}
                  </td>
                  <td>
                    {c.customerId == null ? <span className="muted">—</span> : (
                      <Link to="/customers/$customerId" params={{ customerId: String(c.customerId) }}>{c.customerName}</Link>
                    )}
                  </td>
                  {fine && <td className="hide-narrow">{c.offenceType ?? '—'}</td>}
                  <td className="hide-narrow">{c.noticeNumber ?? '—'}</td>
                  <td className="num">{formatMoney(c.amountCents)}</td>
                  <td className={`hide-narrow ${c.status === 'not_paid' && c.dueOn && c.dueOn < today ? 'urgent' : ''}`}>{formatDate(c.dueOn)}</td>
                  <td><span className={`badge charge-${c.status}`}>{chargeStatusLabel[c.status]}</span></td>
                  <td className="hide-narrow muted small">{c.note}</td>
                  <td className="row tight">
                    <button type="button" className="ghost small" onClick={() => setEditing(c)}>Edit</button>
                    <DeleteButton label="Delete" onConfirm={async () => {
                      await remove({ data: { id: c.id } })
                      if (editing !== 'new' && editing?.id === c.id) setEditing(null)
                      await router.invalidate()
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small table-foot">{data.total} {noun}s · {formatMoney(data.amountCents)}</p>
        </div>
      )}
      <Pager from={from} page={data.page} pageCount={data.pageCount} shown={data.items.length} total={data.total} size={search.size} />
    </div>
  )
}
