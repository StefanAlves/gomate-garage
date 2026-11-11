import { createFileRoute, redirect } from '@tanstack/react-router'

// No dashboard yet: the cars list is the front desk.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/cars' })
  },
})
