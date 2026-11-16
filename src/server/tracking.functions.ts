import { createServerFn } from '@tanstack/react-start'
import { idSchema } from '~/lib/schemas'
import { fleetLocations } from './tracking.server'

// GPS tracking RPCs. Read-only: positions live in Traccar, not in our database.

/** Every car and its tracker's latest position, for the fleet map. */
export const getFleetLocations = createServerFn({ method: 'GET' }).handler(() => fleetLocations())

/** One car's tracker, for the car page's Location tab. */
export const getCarLocation = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => fleetLocations({ carId: data.id }))
