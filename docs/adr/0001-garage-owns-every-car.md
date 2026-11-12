---
status: accepted
---

# The garage owns every Car until a Finance Sale is fully paid

The app started as a customer-and-car registry in which a Car could be owned by a Customer. The business, though, only rents out and sells its own cars, so we removed customer ownership entirely. A Customer relates to a Car only through a Rental or a Finance Sale. Because the garage finances sales in-house, it keeps ownership of a Car that is Under finance and ownership passes to the Customer only when the last Instalment (or a Payoff) is paid. That lets the garage take the Car back on Default without a transfer in the other direction.

## Considered Options

- **Keep customer ownership as an optional field**: rejected. It invites recording customer cars the business never manages, and that is the workshop use case we dropped (see the retired `SPECs/bookings-module.md`).
- **Transfer ownership at the start of a Finance Sale and treat the balance as a debt**: rejected. A Default would then mean reclaiming a Car the system says belongs to someone else.

## Consequences

- A Car's purpose (Rental Car or Sale Car) is fixed for life. If the business starts retiring Rental Cars into sale, revisit this.
- Fines and tolls on a Car Under finance arrive in the garage's name and are passed to the Customer, exactly as for a Rental.
