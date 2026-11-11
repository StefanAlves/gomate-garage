import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { newCarSearchSchema } from '~/lib/schemas'
import { createCar, listCustomerOptions } from '~/server/garage.functions'
import { CarForm } from '~/components/car-form'

export const Route = createFileRoute('/cars/new')({
  // ?customerId=… preselects the owner (used by "Register a car" on a customer page).
  validateSearch: newCarSearchSchema,
  loader: () => listCustomerOptions(),
  head: () => ({ meta: [{ title: 'New car · Garage' }] }),
  component: NewCar,
})

function NewCar() {
  const owners = Route.useLoaderData()
  const { customerId } = Route.useSearch()
  const navigate = useNavigate()
  const create = useServerFn(createCar)
  return (
    <div className="panel stack">
      <h1>New car</h1>
      <p className="muted small">Full specifications, maintenance, rego and insurance details can be added on the car page afterwards.</p>
      <CarForm
        compact
        owners={owners}
        initial={{ customerId: owners.some((o) => o.id === customerId) ? customerId : null }}
        submitLabel="Add car"
        onSubmit={(values) => create({ data: values })}
        onSuccess={({ id }) => navigate({ to: '/cars/$carId', params: { carId: String(id) } })}
      />
    </div>
  )
}
