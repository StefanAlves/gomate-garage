import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { createCustomer } from '~/server/garage.functions'
import { CustomerForm } from '~/components/customer-form'

export const Route = createFileRoute('/customers/new')({
  head: () => ({ meta: [{ title: 'New customer · Garage' }] }),
  component: NewCustomer,
})

function NewCustomer() {
  const navigate = useNavigate()
  const create = useServerFn(createCustomer)
  return (
    <div className="panel stack">
      <h1>New customer</h1>
      <p className="muted small">Address, marketing preferences, tags and licence details can be added on the customer page afterwards.</p>
      <CustomerForm
        compact
        submitLabel="Create customer"
        onSubmit={(values) => create({ data: values })}
        onSuccess={({ id }) => navigate({ to: '/customers/$customerId', params: { customerId: String(id) } })}
      />
    </div>
  )
}
