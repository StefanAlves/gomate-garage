import { Link, createFileRoute, notFound, stripSearchParams, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { customerTabSearchSchema, idSchema, type CUSTOMER_TABS } from '~/lib/schemas'
import { customerName, formatDate, whatsappUrl } from '~/lib/format'
import { deleteCustomer, getCustomer, updateCustomer } from '~/server/garage.functions'
import { CustomerForm } from '~/components/customer-form'
import { CustomerDocuments } from '~/components/customer-documents'
import { DeleteButton, FormError } from '~/components/form'
import { ComingSoon, DetailTabs } from '~/components/tabs'

type TabKey = (typeof CUSTOMER_TABS)[number]

export const Route = createFileRoute('/customers/$customerId')({
  validateSearch: customerTabSearchSchema,
  search: { middlewares: [stripSearchParams({ tab: 'contact' })] },
  loader: ({ params }) => {
    const parsed = idSchema.safeParse({ id: params.customerId })
    if (!parsed.success) throw notFound()
    return getCustomer({ data: parsed.data })
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData ? customerName(loaderData.customer) : 'Customer'} · Garage` }],
  }),
  component: CustomerPage,
})

function CustomerPage() {
  const { customer } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const wa = whatsappUrl(customer.phone)

  return (
    <div className="stack">
      <Link to="/customers" className="muted small">← All customers</Link>

      <header className="row between wrap">
        <div>
          <h1>{customerName(customer)}</h1>
          <p className="muted small">
            {customer.company && <>{customer.company} · </>}Customer since {formatDate(customer.createdAt)}
          </p>
          {customer.tags.length > 0 && (
            <div className="row wrap tag-row">
              {customer.tags.map((t) => <span key={t} className="badge">{t}</span>)}
            </div>
          )}
        </div>
        <div className="row wrap">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="button ghost">WhatsApp</a>}
          {customer.email && <a href={`mailto:${customer.email}`} className="button ghost">Email</a>}
        </div>
      </header>

      <DetailTabs<TabKey>
        selected={tab}
        onChange={(t) => navigate({ search: { tab: t === 'contact' ? undefined : t }, replace: true })}
        tabs={[
          { id: 'contact', label: 'Contact' },
          { id: 'bookings', label: 'Bookings' },
          { id: 'invoices', label: 'Invoices' },
          { id: 'comms', label: 'Comms' },
          { id: 'rentals', label: 'Rentals' },
        ]}
        render={(key) => {
          switch (key) {
            case 'contact':
              return <ContactTab />
            case 'bookings':
              return <ComingSoon title="Bookings">Workshop bookings for this customer: date, status, vehicle and service.</ComingSoon>
            case 'invoices':
              return <ComingSoon title="Invoices">Invoices for this customer, filterable by Draft, Sent, Accepted, Declined, Paid and Overdue.</ComingSoon>
            case 'comms':
              return <ComingSoon title="Communications">Emails, SMS and WhatsApp messages sent to this customer.</ComingSoon>
            case 'rentals':
              return <ComingSoon title="Rental & loan history">Fleet cars rented or loaned to this customer: vehicle, type, dates, weekly rate and status.</ComingSoon>
          }
        }}
      />
    </div>
  )
}

function ContactTab() {
  const { customer, documents } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const update = useServerFn(updateCustomer)
  const remove = useServerFn(deleteCustomer)
  const [saved, setSaved] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()

  return (
    <div className="stack">
    <section className="panel stack">
      {saved && <p className="notice" role="status">Saved.</p>}
      <CustomerForm
        key={customer.updatedAt}
        initial={customer}
        submitLabel="Save changes"
        onSubmit={(values) => update({ data: { id: customer.id, values } })}
        onSuccess={async () => {
          await router.invalidate()
          setSaved(true)
        }}
      >
        <DeleteButton
          label="Delete customer"
          onConfirm={async () => {
            const res = await remove({ data: { id: customer.id } })
            if (res.ok) await navigate({ to: '/customers' })
            else setDeleteError(res.errors.form)
          }}
        />
      </CustomerForm>
      <FormError error={deleteError} />
    </section>
    <CustomerDocuments customerId={customer.id} documents={documents} />
    </div>
  )
}
