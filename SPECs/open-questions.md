# Open Questions

Date: 2026-11-12
Related: GLOSSARY.md, docs/adr/0001-garage-owns-every-car.md, SPECs/car-purpose-and-ownership.md, SPECs/rentals.md, SPECs/finance-sales.md, SPECs/maintenance.md

Points still to discuss before (or while) the specs are built. When one is settled, update the spec and GLOSSARY.md, then delete it from this list.

## 1. Assumptions accepted for now

Decided while writing the specs. The business accepted them on 2026-11-12 so building can start; any of them can be revisited later.

1. **Payments live in the money ledger.** Rent, Deposit and Instalment payments are ledger entries linked to their Rental or Finance Sale. The part of a Bond kept at Return counts as income. *(rentals, finance-sales)*
2. **Ambiguous existing Cars become Sale Cars.** Cars currently flagged both "for rent" and "for sale", or neither, default to Sale Car, and the migration lists them for review. *(car-purpose-and-ownership)*
3. **Overpaying a Finance Sale is rejected.** A payment larger than the remaining balance isn't accepted. *(finance-sales)*
4. **Maintenance "due soon" thresholds.** Within 30 days or 1,000 km, plus an estimated km when the last reading is old. *(maintenance)*
5. **"Paid by renter" becomes "Paid by customer"** for fines and tolls, because it now covers Finance Sales too. *(rentals)*
6. **No partial week at Return.** The last week of Rent is charged in full even if the Car comes back mid-week. *(rentals)*
7. **Bond paid in full at the start.** It is set per Rental (no standard amount) and can't be paid in parts. *(rentals)*
8. **Shortfall after Return.** If deductions exceed the Bond, the debt stays on the closed Rental until it's paid. *(rentals)*
9. **Overdue means any Arrears at all.** Earlier we suggested "2+ weeks behind". *(rentals, finance-sales)*
10. **Instalment rounding.** Staff can override the Instalment amount, and the last Instalment absorbs the rounding difference. *(finance-sales)*
11. **The Customer page's Cars tab is removed** and replaced by Rentals and Finance Sales tabs. *(car-purpose-and-ownership)*

## 2. Not discussed yet

1. **After a Default:** is the Customer still liable for the remaining balance, or does the debt end when the garage takes the Car back?
2. **Default before the Car is recovered:** the spec moves the Car straight to Preparation. Do we need a state for "defaulted but not yet recovered"?
3. **Rego and insurance on Cars Under finance:** the garage still owns them. Who renews rego and insurance, and should those Cars stay in the "due in 30 days" panel?
4. **Sold Cars:** should they drop out of the rego/insurance/maintenance lists and the stock board after a while, or stay visible?
5. **Checks before renting or selling:** must a Customer have a licence (front/back) uploaded before a Rental or Finance Sale can start? Any other checks (e.g. credit)?
6. **Additional drivers on a Rental:** can more than one person drive a Rental Car? If so, who gets fines and tolls?
7. **Who pays for servicing:** is Maintenance on a Rental Car always a garage expense, or can some of it be charged to the Renter (e.g. damage-related)?
8. **GST / tax:** do Rent, sale prices and the ledger need GST shown or split out?
9. **Remaining placeholders:** what happens to the Customer page's Bookings, Invoices and Comms tabs, and to `/fleet/leads` and `/fleet/invoices`? Build, drop, or keep as placeholders?

## 3. Deferred: decided out of scope, revisit later

- Changing a Car's purpose (Rental Car ↔ Sale Car), e.g. retiring Rental Cars into sale. See the ADR.
- Rescheduling or changing Finance Sale terms, hardship arrangements, late fees, and interest calculation.
- Damage photos and inspection checklists at Return.
- Payment reminders, invoices, receipts and contracts sent to Customers.
- Maintenance for Sale Cars.
- Third-party finance lenders.
