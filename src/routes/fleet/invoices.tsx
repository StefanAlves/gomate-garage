import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon } from '~/components/tabs'

export const Route = createFileRoute('/fleet/invoices')({
  head: () => ({ meta: [{ title: 'Fleet invoices · Garage' }] }),
  component: () => (
    <ComingSoon title="Fleet invoices">
      Rental and sale invoices with tiles for paid, draft, overdue and due in the next 7 / 30 / 90 days. Filter by
      vehicle, customer, rental and payment method; tabs for Outstanding, Overdue, Partial, Paid, Draft, Sent and
      Waived. Paying an invoice records the income in Transactions. Comes after Rentals.
    </ComingSoon>
  ),
})
