import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { createCar } from '~/server/garage.functions'
import { CarForm } from '~/components/car-form'

export const Route = createFileRoute('/cars/new')({
  head: () => ({ meta: [{ title: 'New car · Garage' }] }),
  component: NewCar,
})

function NewCar() {
  const navigate = useNavigate()
  const create = useServerFn(createCar)
  return (
    <div className="stack">
      <h1>New car</h1>
      <p className="muted small">Full specifications, maintenance, rego and insurance details can be added on the car page afterwards.</p>
      <CarForm
        isNew
        submitLabel="Add car"
        onSubmit={(values) => create({ data: values })}
        onSuccess={({ id }) => navigate({ to: '/cars/$carId', params: { carId: String(id) } })}
      />
    </div>
  )
}
