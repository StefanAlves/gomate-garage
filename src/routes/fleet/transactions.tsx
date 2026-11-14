import { Link, createFileRoute, stripSearchParams, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { PERIODS, transactionListSearchDefaults, transactionListSearchSchema, type TransactionCategory } from '~/lib/schemas'
import {
  categoryLabel, formatDate, formatMoney, formatMoneyShort, formatPercent, formatSigned, labelOptions, methodLabel,
} from '~/lib/format'
import { garageToday, periodLabel } from '~/lib/period'
import {
  createTransaction, deleteTransaction, exportTransactions, listPickerOptions, listTransactions, updateTransaction,
} from '~/server/fleet.functions'
import type { Transaction } from '~/server/transactions.server'
import { TransactionForm } from '~/components/transaction-form'
import { DeleteButton } from '~/components/form'
import { Pager, ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/fleet/transactions')({
  validateSearch: transactionListSearchSchema,
  search: { middlewares: [stripSearchParams(transactionListSearchDefaults)] },
  pendingMs: Infinity, // keep the current results on screen while a filter change loads
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [data, options] = await Promise.all([listTransactions({ data: deps }), listPickerOptions()])
    return { ...data, options, today: garageToday() }
  },
  head: () => ({ meta: [{ title: 'Transactions · Garage' }] }),
  component: Transactions,
})

const INCOMING: TransactionCategory[] = ['rental_income', 'sale_income', 'bond_received', 'bond_applied']

type Editing = { mode: 'new'; category?: TransactionCategory } | { mode: 'edit'; tx: Transaction } | null

function Transactions() {
  const search = Route.useSearch()
  const { items, total, page, pageCount, totals, options, today } = Route.useLoaderData()
  const router = useRouter()
  const create = useServerFn(createTransaction)
  const update = useServerFn(updateTransaction)
  const remove = useServerFn(deleteTransaction)
  const exportAll = useServerFn(exportTransactions)
  const [editing, setEditing] = useState<Editing>(null)
  const filtered = !!search.q || search.car !== undefined || !!search.category || !!search.method || search.period !== 'all'

  const tiles = [
    ['Investment', formatMoneyShort(totals.investedCents)],
    ['Rental income', formatMoneyShort(totals.rentalIncomeCents)],
    ['Sale income', formatMoneyShort(totals.saleIncomeCents)],
    ['Expenses', formatMoneyShort(totals.expensesCents)],
    ['Realised P&L', formatSigned(totals.pnlCents)],
    ['Realised ROI', formatPercent(totals.roi)],
    ['Bond held', formatMoneyShort(totals.bondHeldCents)],
  ] as const

  const done = async () => {
    setEditing(null)
    await router.invalidate()
  }

  async function downloadCsv() {
    const rows = await exportAll({ data: search })
    const cell = (v: string | number | null) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [
      ['Date', 'Rego', 'Vehicle', 'Customer', 'Category', 'Amount', 'Method', 'Notes'],
      ...rows.map((t) => [
        t.occurredOn, t.carPlate, t.carName, t.customerName, categoryLabel[t.category],
        (t.amountCents / 100).toFixed(2), t.method ? methodLabel[t.method] : '', t.notes,
      ]),
    ].map((r) => r.map(cell).join(','))
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `transactions-${today}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Transactions</h1>
        <ParamSelect from="/fleet/transactions" param="period" label="Period" value={search.period}
          options={PERIODS.map((p) => [p, periodLabel[p]] as const)} />
      </div>

      <section className="tiles compact" aria-label="Totals">
        {tiles.map(([label, value]) => (
          <div key={label} className="panel tile">
            <span className="muted small">{label}</span>
            <span className="tile-value">{value}</span>
          </div>
        ))}
      </section>

      {editing && (
        <section className="panel stack">
          <h2>{editing.mode === 'new' ? (editing.category === 'bond_received' ? 'Add bond' : 'Add transaction') : 'Edit transaction'}</h2>
          <TransactionForm
            key={editing.mode === 'new' ? `new-${editing.category ?? ''}` : editing.tx.id}
            options={options}
            today={today}
            initial={editing.mode === 'edit' ? editing.tx : undefined}
            defaults={editing.mode === 'new' ? { category: editing.category, carId: search.car } : undefined}
            onSubmit={(values) => (editing.mode === 'new' ? create({ data: values }) : update({ data: { id: editing.tx.id, values } }))}
            onSuccess={done}
            onCancel={() => setEditing(null)}
          />
        </section>
      )}

      <div className="row wrap">
        <SearchBox from="/fleet/transactions" q={search.q} placeholder="Search vehicle, customer or notes…" />
        <ParamSelect from="/fleet/transactions" param="car" label="Vehicle" value={search.car === undefined ? '' : String(search.car)}
          options={[['', 'All vehicles'], ...options.cars.map((c) => [String(c.id), `${c.plate} · ${c.name}`] as const)]} />
        <ParamSelect from="/fleet/transactions" param="category" label="Category" value={search.category ?? ''}
          options={[['', 'All categories'], ...labelOptions(categoryLabel)]} />
        <ParamSelect from="/fleet/transactions" param="method" label="Method" value={search.method ?? ''}
          options={[['', 'All methods'], ...labelOptions(methodLabel)]} />
      </div>
      <div className="row wrap">
        <button type="button" onClick={() => setEditing({ mode: 'new' })}>Add transaction</button>
        <button type="button" className="ghost" onClick={() => setEditing({ mode: 'new', category: 'bond_received' })}>Add bond</button>
        <button type="button" className="ghost" onClick={downloadCsv} disabled={total === 0}>Export CSV</button>
      </div>

      {items.length === 0 ? (
        <div className="panel muted">{filtered ? 'No transactions match these filters.' : 'No transactions recorded yet.'}</div>
      ) : (
        <div className="table-wrap panel flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Vehicle</th><th className="hide-narrow">Customer</th><th>Category</th>
                <th className="num">Amount</th><th className="hide-narrow">Method</th><th className="hide-narrow">Notes</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const incoming = INCOMING.includes(t.category)
                return (
                  <tr key={t.id}>
                    <td>{formatDate(t.occurredOn)}</td>
                    <td>
                      <Link to="/cars/$carId" params={{ carId: String(t.carId) }} search={{ tab: 'money' }}>
                        {t.carName} <span className="plate">{t.carPlate}</span>
                      </Link>
                    </td>
                    <td className="hide-narrow">
                      {t.customerId == null ? <span className="muted">—</span> : (
                        <Link to="/customers/$customerId" params={{ customerId: String(t.customerId) }}>{t.customerName}</Link>
                      )}
                    </td>
                    <td><span className={`category cat-${t.category}`}>{categoryLabel[t.category]}</span></td>
                    <td className={`num ${incoming ? 'positive' : 'urgent'}`}>{incoming ? '+' : '−'}{formatMoney(t.amountCents)}</td>
                    <td className="hide-narrow">{t.method ? methodLabel[t.method] : '—'}</td>
                    <td className="hide-narrow muted small">{t.notes}</td>
                    <td className="row tight">
                      <button type="button" className="ghost small" onClick={() => setEditing({ mode: 'edit', tx: t })}>Edit</button>
                      <DeleteButton label="Delete" onConfirm={async () => {
                        await remove({ data: { id: t.id } })
                        if (editing?.mode === 'edit' && editing.tx.id === t.id) setEditing(null)
                        await router.invalidate()
                      }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager from="/fleet/transactions" page={page} pageCount={pageCount} shown={items.length} total={total} size={search.size} />
    </div>
  )
}
