import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon } from '~/components/tabs'

export const Route = createFileRoute('/fleet/leads')({
  head: () => ({ meta: [{ title: 'Leads · Garage' }] }),
  component: () => (
    <ComingSoon title="Leads">
      Every buyer enquiry becomes a lead you move through a pipeline (Open, Won, Lost) on a board or table. A lead has
      a name, phone, email, what they're looking for, an optional car they're after, a budget range, when they want to
      buy (this week, within a month, 1–3 months, just researching) and where they came from. Recording a sale for the
      car they're after marks the lead as won; matching leads show on a car's Stock tab.
    </ComingSoon>
  ),
})
