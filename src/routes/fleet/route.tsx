import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

// The fleet section (GoMate's "Cars" group): business-owned cars as stock,
// rentals, fines & tolls, leads and the money ledger. Sub-navigation for all pages.
export const Route = createFileRoute('/fleet')({ component: FleetLayout })

const links = [
  { to: '/fleet', label: 'Overview', exact: true },
  { to: '/fleet/stock', label: 'Stock' },
  { to: '/fleet/rentals', label: 'Rentals' },
  { to: '/fleet/fines', label: 'Fines' },
  { to: '/fleet/tolls', label: 'Tolls' },
  { to: '/fleet/leads', label: 'Leads' },
  { to: '/fleet/invoices', label: 'Invoices' },
  { to: '/fleet/transactions', label: 'Transactions' },
] as const

function FleetLayout() {
  return (
    <div className="stack">
      <nav className="subnav" aria-label="Fleet">
        {links.map((l) => (
          <Link key={l.to} to={l.to} activeOptions={{ exact: 'exact' in l, includeSearch: false }} activeProps={{ className: 'active' }}>
            {l.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
