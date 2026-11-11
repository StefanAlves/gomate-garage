import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon } from '~/components/tabs'

export const Route = createFileRoute('/fleet/rentals')({
  head: () => ({ meta: [{ title: 'Rentals · Garage' }] }),
  component: () => (
    <ComingSoon title="Rentals">
      Rent or loan fleet cars to customers. Board (Preparation, Available, Awaiting pickup, Active, Returning soon,
      Overdue), timeline and table views. Each rental has a renter, start and end dates (or long term), billing cycle
      (daily, weekly, fortnightly, monthly, fixed) and rate, a bond, the renter's payment method, pickup and return
      handoffs (odometer, fuel, condition photos), payments and a rental agreement. Statuses: Awaiting pickup, Active,
      Completed, Cancelled.
    </ComingSoon>
  ),
})
