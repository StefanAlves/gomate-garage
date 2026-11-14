import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { chargeListSearchDefaults, chargeListSearchSchema } from '~/lib/schemas'
import { garageToday } from '~/lib/period'
import { listCharges, listPickerOptions } from '~/server/fleet.functions'
import { ChargesPage } from '~/components/charges-page'

export const Route = createFileRoute('/fleet/tolls')({
  validateSearch: chargeListSearchSchema,
  search: { middlewares: [stripSearchParams(chargeListSearchDefaults)] },
  pendingMs: Infinity, // keep the current results on screen while a filter change loads
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [data, options] = await Promise.all([listCharges({ data: { ...deps, kind: 'toll' } }), listPickerOptions()])
    return { data, options, today: garageToday() }
  },
  head: () => ({ meta: [{ title: 'Tolls · Garage' }] }),
  component: function Tolls() {
    const { data, options, today } = Route.useLoaderData()
    return <ChargesPage kind="toll" from="/fleet/tolls" data={data} search={Route.useSearch()} options={options} today={today} />
  },
})
