# Garage

A business that rents out and sells its own cars. Every car belongs to the garage; customers only ever rent one or buy one on in-house finance.

## Cars

**Car**:
A vehicle owned by the garage, held as stock until it is rented out or sold.
_Avoid_: Vehicle (in prose), customer car, fleet car (all cars are fleet)

**Rental Car**:
A Car the garage keeps to rent out. It is never sold on a Finance Sale, and it stays a Rental Car for life.
_Avoid_: Rent car, fleet car

**Sale Car**:
A Car the garage keeps to sell. It is never rented out, and it stays a Sale Car for life.
_Avoid_: Stock car, car for sale

**Preparation**:
The state of a Car being made ready: newly acquired, just returned from a Rental, or taken back after a Default.
_Avoid_: Returned, workshop

**Ready**:
The state of a Car in stock and available to start a Rental (Rental Car) or a Finance Sale (Sale Car).
_Avoid_: Available, in stock

**Rented**:
The state of a Rental Car during a Rental.
_Avoid_: Out, hired

**Maintenance**:
Servicing a Rental Car needs every so many kilometres or months, whichever comes first.
_Avoid_: Booking, job, repair

## Customers

**Customer**:
A person or company who rents or buys a Car from the garage. A Customer never owns a Car the garage manages.
_Avoid_: Client, owner

## Renting

**Rental**:
An open-ended arrangement where a Customer takes a Car, pays a Bond up front and then weekly Rent until they return it.
_Avoid_: Hire, booking, lease

**Bond**:
Money a Customer pays at the start of a Rental, held by the garage and returned (less any deductions) when the Car comes back. Never income.
_Avoid_: Deposit (that word belongs to Finance Sales)

**Rent**:
The weekly amount a Customer pays during a Rental. It stays fixed until the garage adjusts it from a given date.
_Avoid_: Rental payment, hire fee

**Return**:
The end of a Rental, when the Car comes back and the Bond is settled: unpaid Rent (Arrears), fines, tolls and damage are deducted, and the rest goes back to the Customer.
_Avoid_: Check-in, close, end of hire

## Selling

**Finance Sale**:
A sale of a Sale Car to a Customer, paid as a Deposit followed by a fixed number of weekly Instalments collected by the garage itself. The garage keeps ownership of the Car until the last Instalment is paid. A rare cash sale is a Finance Sale whose Deposit is the full price and which has no Instalments.
_Avoid_: Loan, lease, rent-to-own, finance deal, cash sale

**Deposit**:
The up-front amount a Customer pays when a Finance Sale is agreed.
_Avoid_: Bond, down payment

**Instalment**:
One of the fixed, equal weekly payments due under a Finance Sale.
_Avoid_: Repayment, rent

**Under finance**:
The state of a Sale Car whose Finance Sale has started but whose last Instalment is not yet paid. The garage still owns it.
_Avoid_: Out, sold

**Sold**:
The state of a Car whose Finance Sale is fully paid. Ownership has passed to the Customer.
_Avoid_: Under finance, out

**Arrears**:
The amount a Customer is overdue: Rent or Instalments due to date minus what they have paid. Customers usually pay weekly but may catch up on Arrears with any amount.
_Avoid_: Debt, balance, owing

**Payoff**:
Paying the whole remaining balance of a Finance Sale early, with no discount. The Car becomes Sold at once.
_Avoid_: Settlement, early repayment

**Default**:
Ending a Finance Sale because the Customer stopped paying, always a staff decision. The garage takes the Car back into Preparation and keeps what was already paid.
_Avoid_: Repossession (the physical act), cancellation
