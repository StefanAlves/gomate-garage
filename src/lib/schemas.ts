import { z } from 'zod'

// Shared, isomorphic schemas: used for form validation in the browser,
// search-param validation on routes, and input validation in server functions.

// ---- Option lists ------------------------------------------------------------

/** What a car is kept for. Chosen when the car is added and never changed (see GLOSSARY.md). */
export const CAR_PURPOSES = ['rental', 'sale'] as const
/** Where a car is in its lifecycle (the Stock board columns). */
export const CAR_STATUSES = ['preparation', 'ready', 'rented', 'under_finance', 'sold'] as const
/** Statuses staff set by hand. The others follow from a Rental or Finance Sale. */
export const MANUAL_CAR_STATUSES = ['preparation', 'ready'] as const
export const STATUSES_BY_PURPOSE = {
  rental: ['preparation', 'ready', 'rented'],
  sale: ['preparation', 'ready', 'under_finance', 'sold'],
} as const satisfies Record<(typeof CAR_PURPOSES)[number], readonly (typeof CAR_STATUSES)[number][]>
export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'electric'] as const
export const COLOURS = [
  'White', 'Black', 'Silver', 'Grey', 'Red', 'Blue', 'Green', 'Yellow', 'Orange',
  'Brown', 'Gold', 'Beige', 'Maroon', 'Navy', 'Purple', 'Other',
] as const
export const CONTACT_METHODS = ['email', 'sms', 'whatsapp', 'phone'] as const
export const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'] as const

export type CarPurpose = (typeof CAR_PURPOSES)[number]
export type CarStatus = (typeof CAR_STATUSES)[number]
export type ManualCarStatus = (typeof MANUAL_CAR_STATUSES)[number]
export type FuelType = (typeof FUEL_TYPES)[number]
export type ContactMethod = (typeof CONTACT_METHODS)[number]
export type AuState = (typeof AU_STATES)[number]

export const CAR_FEATURES = [
  'full_service_history', 'logbook', 'recently_serviced', 'cold_ac', 'extra_key', 'apple_carplay',
  'bluetooth', 'reverse_camera', 'new_tyres', 'new_brakes', 'automatic', 'cruise_control', 'sunroof',
] as const
export const CHARGE_KINDS = ['fine', 'toll'] as const
export const CHARGE_STATUSES = ['not_paid', 'transferred', 'business_paid', 'paid_by_customer'] as const
export const TRANSACTION_CATEGORIES = [
  'initial_investment', 'expense', 'rental_income', 'sale_income', 'bond_received', 'bond_returned', 'bond_applied',
] as const
export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'other'] as const
export const PERIODS = ['today', 'week', 'month', '30d', 'year', 'all'] as const
export const DOCUMENT_KINDS = ['licence_front', 'licence_back', 'passport'] as const
export const RENTAL_STATUSES = ['active', 'returned'] as const
export const DEDUCTION_KINDS = ['rent_arrears', 'fine', 'toll', 'damage', 'other'] as const
/** Deductions staff type in at Return; the others come from Arrears and linked fines / tolls. */
export const MANUAL_DEDUCTION_KINDS = ['damage', 'other'] as const

export type CarFeature = (typeof CAR_FEATURES)[number]
export type ChargeKind = (typeof CHARGE_KINDS)[number]
export type ChargeStatus = (typeof CHARGE_STATUSES)[number]
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number]
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type Period = (typeof PERIODS)[number]
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
export type RentalStatus = (typeof RENTAL_STATUSES)[number]
export type DeductionKind = (typeof DEDUCTION_KINDS)[number]

// ---- Field helpers -----------------------------------------------------------

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().default(null)

const optionalInt = (min: number, max: number) =>
  z.union([z.literal(''), z.coerce.number().int().min(min).max(max)])
    .transform((v) => (v === '' ? null : v)).nullable().default(null)

/** `<input type="date">` value (YYYY-MM-DD) or empty. */
const optionalDate = z.union([z.literal(''), z.iso.date('Invalid date')])
  .transform((v) => v || null).nullable().default(null)

/**
 * "MM/YYYY" typed by the user, stored as "YYYY-MM". The stored form is also
 * accepted because the server re-validates what the browser already parsed.
 */
const optionalMonth = z.union([
  z.literal(''),
  z.string().trim().regex(/^(0?[1-9]|1[0-2])\/\d{4}$|^\d{4}-(0[1-9]|1[0-2])$/, 'Use MM/YYYY'),
]).transform((v) => {
  if (!v) return null
  if (v.includes('-')) return v
  const [m = '', y = ''] = v.split('/')
  return `${y}-${m.padStart(2, '0')}`
}).nullable().default(null)

/**
 * Dollar amount, at most 2 decimals. Kept in dollars here (the server converts
 * to cents) so re-validating the browser's output on the server is a no-op.
 */
const optionalMoney = z.union([
  z.literal(''),
  z.coerce.number('Enter an amount').min(0, 'Must be 0 or more').max(10_000_000)
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'At most 2 decimals'),
]).transform((v) => (v === '' ? null : v)).nullable().default(null)

/** Unchecked checkboxes are absent from FormData; checked ones send "on". */
const checkbox = z.preprocess((v) => v === true || v === 'on' || v === 'true' || v === '1', z.boolean()).default(false)

const optionalId = z.union([z.literal(''), z.coerce.number().int().positive()])
  .transform((v) => (v === '' ? null : v)).nullable().default(null)

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.literal(''), z.enum(values)]).transform((v) => (v === '' ? null : v)).nullable().default(null)

/** A repeated form field (checkbox group): absent, one value, or many. */
const multi = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(values)))
    .transform((v) => [...new Set(v)])
    .default([])

// ---- Customers ---------------------------------------------------------------

export const customerInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: optionalText(60),
  company: optionalText(120),
  taxId: optionalText(30),
  email: z.union([z.literal(''), z.email('Invalid email')]).transform((v) => v || null).nullable().default(null),
  phone: z.string().trim().min(6, 'Mobile is required').max(30).regex(/^[+\d][\d\s()-]*$/, 'Invalid phone number'),
  landline: z.union([z.literal(''), z.string().trim().max(30).regex(/^[+\d][\d\s()-]*$/, 'Invalid phone number')])
    .transform((v) => v || null).nullable().default(null),
  street: optionalText(160),
  suburb: optionalText(80),
  state: optionalEnum(AU_STATES),
  postcode: z.union([z.literal(''), z.string().trim().regex(/^\d{4}$/, 'Postcode is 4 digits')])
    .transform((v) => v || null).nullable().default(null),
  newsletterOptIn: checkbox,
  marketingOptIn: checkbox,
  preferredContact: multi(CONTACT_METHODS),
  /** Comma-separated in the form; stored lowercase, de-duplicated. */
  tags: z.union([z.string(), z.array(z.string())]).default('')
    .transform((v) => [...new Set((Array.isArray(v) ? v : v.split(',')).map((t) => t.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.string().max(30, 'Tags are at most 30 characters')).max(20, 'At most 20 tags')),
  licenceNumber: optionalText(30),
  licenceExpiry: optionalDate,
  passportNumber: optionalText(30),
  notes: optionalText(2000),
})
export type CustomerInput = z.input<typeof customerInputSchema>
export type CustomerValues = z.output<typeof customerInputSchema>

// ---- Cars --------------------------------------------------------------------

const currentYear = new Date().getFullYear()

/** Vehicle details (the Specifications tab). Purpose and status are set elsewhere. */
export const carInputSchema = z.object({
  plate: z
    .string()
    .trim()
    .min(2, 'Registration is required')
    .max(15)
    .regex(/^[A-Za-z0-9 -]+$/, 'Only letters, digits, spaces and dashes')
    .transform((v) => v.toUpperCase().replace(/\s+/g, ' ')),
  make: z.string().trim().min(1, 'Make is required').max(60),
  model: z.string().trim().min(1, 'Model is required').max(60),
  variant: optionalText(60),
  year: optionalInt(1900, currentYear + 1),
  /** Free text so older values survive; the form offers COLOURS. */
  color: optionalText(40),
  vin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN must be 17 characters (no I, O, Q)')])
    .transform((v) => v || null).nullable().default(null),
  engineNumber: optionalText(40),
  buildDate: optionalMonth,
  complianceDate: optionalMonth,
  engineType: optionalText(60),
  cylinders: optionalInt(1, 16),
  fuelType: optionalEnum(FUEL_TYPES),
  transmission: optionalText(40),
  bodyStyle: optionalText(40),
  radioPin: optionalText(20),
  mileageKm: optionalInt(0, 5_000_000),
  nextServiceDate: optionalDate,
  nextServiceKm: optionalInt(0, 5_000_000),
  nextTransmissionDate: optionalDate,
  nextTransmissionKm: optionalInt(0, 5_000_000),
  regoExpiry: optionalDate,
  insuranceProvider: optionalText(80),
  insurancePolicy: optionalText(60),
  insuranceExpiry: optionalDate,
  ppsrChecked: checkbox,
  writtenOff: checkbox,
  notes: optionalText(2000),
})
export type CarInput = z.input<typeof carInputSchema>
export type CarValues = z.output<typeof carInputSchema>

/** Adding a car: details plus its fixed purpose and a starting status. */
export const newCarInputSchema = carInputSchema.extend({
  purpose: z.enum(CAR_PURPOSES, 'Choose rental or sale'),
  status: z.enum(MANUAL_CAR_STATUSES).default('preparation'),
})
export type NewCarValues = z.output<typeof newCarInputSchema>

/**
 * The car's Stock tab: status, prices and listing. `status` is only sent while
 * the car is in Preparation or Ready. Only the prices for the car's purpose are
 * saved (weekly rate for rental cars, asking / minimum for sale cars).
 */
export const carStockInputSchema = z.object({
  status: z.enum(MANUAL_CAR_STATUSES).optional(),
  weeklyRate: optionalMoney,
  askingPrice: optionalMoney,
  minPrice: optionalMoney,
  mileageKm: optionalInt(0, 5_000_000),
  listingDescription: optionalText(4000),
  features: multi(CAR_FEATURES),
}).refine((v) => v.askingPrice == null || v.minPrice == null || v.minPrice <= v.askingPrice, {
  path: ['minPrice'], message: 'Minimum price is above the asking price',
})
export type CarStockValues = z.output<typeof carStockInputSchema>

export const idSchema = z.object({ id: z.coerce.number().int().positive() })
export const updateCustomerSchema = idSchema.extend({ values: customerInputSchema })
export const updateCarSchema = idSchema.extend({ values: carInputSchema })
export const updateCarStockSchema = idSchema.extend({ values: carStockInputSchema })

// ---- Fines & tolls -------------------------------------------------------------

export const chargeInputSchema = z.object({
  kind: z.enum(CHARGE_KINDS),
  incurredOn: z.iso.date('Date is required'),
  dueOn: optionalDate,
  /** Empty = vehicle unknown. */
  carId: optionalId,
  /** Empty = customer unknown (or the business). */
  customerId: optionalId,
  offenceType: optionalText(120),
  noticeNumber: optionalText(40),
  amount: optionalMoney.transform((v) => v ?? 0),
  paymentReference: optionalText(60),
  status: z.enum(CHARGE_STATUSES).default('not_paid'),
  note: optionalText(500),
})
export type ChargeValues = z.output<typeof chargeInputSchema>
export const updateChargeSchema = idSchema.extend({ values: chargeInputSchema })

// ---- Transactions (per-car money ledger) ----------------------------------------

export const transactionInputSchema = z.object({
  carId: z.coerce.number('Choose a vehicle').int().positive('Choose a vehicle'),
  customerId: optionalId,
  occurredOn: z.iso.date('Date is required'),
  category: z.enum(TRANSACTION_CATEGORIES, 'Choose a category'),
  amount: optionalMoney.refine((v) => v != null && v > 0, 'Enter an amount above 0').transform((v) => v!),
  method: optionalEnum(PAYMENT_METHODS),
  notes: optionalText(500),
})
export type TransactionValues = z.output<typeof transactionInputSchema>
export const updateTransactionSchema = idSchema.extend({ values: transactionInputSchema })

// ---- Rentals ---------------------------------------------------------------------

const requiredMoney = (message: string) =>
  optionalMoney.refine((v) => v != null && v > 0, message).transform((v) => v!)
const phonePattern = /^[+\d][\d\s()-]*$/

/**
 * Starting a Rental. The Customer is either picked (`customerId`) or created
 * on the spot from a name and mobile, so a walk-in is one form.
 */
export const startRentalInputSchema = z.object({
  carId: z.coerce.number('Choose a car').int().positive('Choose a car'),
  customerMode: z.enum(['existing', 'new']).default('existing'),
  customerId: optionalId,
  firstName: optionalText(60),
  lastName: optionalText(60),
  phone: optionalText(30),
  startDate: z.iso.date('Start date is required'),
  weeklyRent: requiredMoney('Enter the weekly rent'),
  bond: optionalMoney.transform((v) => v ?? 0),
  bondMethod: optionalEnum(PAYMENT_METHODS),
  notes: optionalText(2000),
}).superRefine((v, ctx) => {
  if (v.customerMode === 'existing') {
    if (v.customerId == null) ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Choose a customer' })
    return
  }
  if (!v.firstName) ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'First name is required' })
  if (!v.phone || v.phone.length < 6) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Mobile is required' })
  else if (!phonePattern.test(v.phone)) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Invalid phone number' })
})
export type StartRentalValues = z.output<typeof startRentalInputSchema>

export const rentPaymentInputSchema = z.object({
  paidOn: z.iso.date('Date is required'),
  amount: requiredMoney('Enter an amount above 0'),
  method: optionalEnum(PAYMENT_METHODS),
  notes: optionalText(500),
})
export type RentPaymentValues = z.output<typeof rentPaymentInputSchema>
export const recordRentPaymentSchema = idSchema.extend({ values: rentPaymentInputSchema })

export const rentChangeInputSchema = z.object({
  effectiveFrom: z.iso.date('Date is required'),
  weeklyRent: requiredMoney('Enter the weekly rent'),
})
export type RentChangeValues = z.output<typeof rentChangeInputSchema>
export const adjustRentSchema = idSchema.extend({ values: rentChangeInputSchema })

export const returnRentalInputSchema = z.object({
  returnedOn: z.iso.date('Return date is required'),
  reason: optionalText(500),
  /** Fines and tolls from the settlement preview to take out of the Bond. */
  chargeIds: z.array(z.coerce.number().int().positive()).max(200).default([]),
  extras: z.array(z.object({
    kind: z.enum(MANUAL_DEDUCTION_KINDS),
    description: z.string().trim().min(1, 'Describe the deduction').max(200),
    amount: requiredMoney('Enter an amount above 0'),
  })).max(20).default([]),
  refundMethod: optionalEnum(PAYMENT_METHODS),
})
export type ReturnRentalValues = z.output<typeof returnRentalInputSchema>
export const returnRentalSchema = idSchema.extend({ values: returnRentalInputSchema })
export const settlementPreviewSchema = idSchema.extend({ returnedOn: z.iso.date() })

// ---- List search params --------------------------------------------------------

export const PAGE_SIZES = [25, 50, 100] as const
const pageSearch = {
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  size: z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100)])).default(25).catch(25),
}

export const CUSTOMER_SORTS = ['recent', 'oldest', 'name_asc', 'name_desc'] as const
export const customerListSearchSchema = z.object({
  ...pageSearch,
  sort: z.enum(CUSTOMER_SORTS).default('recent').catch('recent'),
})
export const customerListSearchDefaults = customerListSearchSchema.parse({})

export const CAR_SORTS = ['recent', 'oldest', 'make_asc', 'make_desc'] as const
export const carListSearchSchema = z.object({
  ...pageSearch,
  sort: z.enum(CAR_SORTS).default('recent').catch('recent'),
  purpose: z.enum(CAR_PURPOSES).optional().catch(undefined),
  status: z.enum(CAR_STATUSES).optional().catch(undefined),
})
export const carListSearchDefaults = carListSearchSchema.parse({})

const periodParam = z.enum(PERIODS).default('all').catch('all')

/** Stock board/table. */
export const STOCK_SORTS = ['longest', 'value', 'rego'] as const
export const stockSearchSchema = z.object({
  view: z.enum(['board', 'table']).default('board').catch('board'),
  purpose: z.enum(['all', ...CAR_PURPOSES]).default('all').catch('all'),
  sort: z.enum(STOCK_SORTS).default('longest').catch('longest'),
  q: z.string().trim().max(100).optional().catch(undefined),
})
export const stockSearchDefaults = stockSearchSchema.parse({})

export const chargeListSearchSchema = z.object({
  ...pageSearch,
  status: z.enum(CHARGE_STATUSES).optional().catch(undefined),
  customer: z.coerce.number().int().positive().optional().catch(undefined),
})
export const chargeListSearchDefaults = chargeListSearchSchema.parse({})
export const chargeListInputSchema = chargeListSearchSchema.extend({ kind: z.enum(CHARGE_KINDS) })

export const transactionListSearchSchema = z.object({
  ...pageSearch,
  period: periodParam,
  car: z.coerce.number().int().positive().optional().catch(undefined),
  category: z.enum(TRANSACTION_CATEGORIES).optional().catch(undefined),
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
})
export const transactionListSearchDefaults = transactionListSearchSchema.parse({})

export const RENTAL_SORTS = ['arrears', 'start', 'recent'] as const
export const rentalListSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum([...RENTAL_STATUSES, 'all']).default('active').catch('active'),
  show: z.enum(['all', 'behind']).default('all').catch('all'),
  sort: z.enum(RENTAL_SORTS).default('arrears').catch('arrears'),
})
export const rentalListSearchDefaults = rentalListSearchSchema.parse({})

export const newRentalSearchSchema = z.object({
  car: z.coerce.number().int().positive().optional().catch(undefined),
  customer: z.coerce.number().int().positive().optional().catch(undefined),
})

export const overviewSearchSchema = z.object({ period: periodParam })

// ---- Detail page tabs ----------------------------------------------------------

export const CUSTOMER_TABS = ['contact', 'bookings', 'invoices', 'comms', 'rentals'] as const
export const customerTabSearchSchema = z.object({ tab: z.enum(CUSTOMER_TABS).default('contact').catch('contact') })

export const CAR_TABS = ['specs', 'stock', 'rentals', 'history', 'fines', 'tolls', 'money', 'reminders', 'invoices', 'log'] as const
export const carTabSearchSchema = z.object({ tab: z.enum(CAR_TABS).default('specs').catch('specs') })

/** Turn a ZodError into { field: message } for forms. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {}
  for (const i of error.issues) {
    // Array fields report the index last (e.g. ["tags", 2]); show the error on the field.
    const key = i.path.findLast((p) => typeof p === 'string')
    out[String(key ?? 'form')] ??= i.message
  }
  return out
}


// ---- Customer documents -------------------------------------------------------

/** Photos people take on their phones; HEIC is converted to JPEG by iOS when picked in a browser. */
export const DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export const documentUploadSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  kind: z.enum(DOCUMENT_KINDS),
  file: z.instanceof(File, { message: 'Choose a photo' })
    .refine((f) => f.size > 0, 'Choose a photo')
    .refine((f) => f.size <= MAX_DOCUMENT_BYTES, 'Photo must be 10 MB or smaller')
    .refine((f) => (DOCUMENT_MIME_TYPES as readonly string[]).includes(f.type), 'Use a JPEG, PNG or WebP photo'),
})
