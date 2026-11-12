import type {
  CarFeature, CarPurpose, CarStatus, ChargeStatus, ContactMethod, DeductionKind, DocumentKind, FuelType, PaymentMethod,
  RentalStatus, TransactionCategory,
} from './schemas'

// Fixed locale + UTC so server and client render identical text (no hydration mismatch).
const date = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
export const formatDate = (iso: string | null) => (iso ? date.format(new Date(iso)) : '—')
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso))
export const formatKm = (km: number | null) => (km == null ? '—' : `${km.toLocaleString('en-AU')} km`)

/** "YYYY-MM" (stored) → "MM/YYYY" (shown and typed). */
export const formatMonth = (ym: string | null) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '')

export const carName = (c: { make: string; model: string; year: number | null }) =>
  `${c.year ? `${c.year} ` : ''}${c.make} ${c.model}`

export const customerName = (c: { firstName: string; lastName: string | null }) =>
  c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName

export const initials = (c: { firstName: string; lastName: string | null }) =>
  `${c.firstName[0] ?? ''}${c.lastName?.[0] ?? ''}`.toUpperCase()

/** wa.me link for a phone number; Australian local numbers (0…) get the +61 prefix. */
export function whatsappUrl(phone: string) {
  const intl = phone.trim().startsWith('+')
  let digits = phone.replace(/\D/g, '')
  if (!intl && digits.startsWith('0')) digits = `61${digits.slice(1)}`
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const wholeMoney = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
/** Cents → "$1,234.50". */
export const formatMoney = (cents: number | null) => (cents == null ? '—' : money.format(cents / 100))
/** Cents → "$1,235" (rounded, for tiles and boards). */
export const formatMoneyShort = (cents: number | null) => (cents == null ? '—' : wholeMoney.format(cents / 100))
/** Cents → "+$190" / "−$40" for P&L. */
export const formatSigned = (cents: number) => `${cents < 0 ? '−' : '+'}${wholeMoney.format(Math.abs(cents) / 100)}`
/** Cents → dollars string for an input's defaultValue. */
export const centsToInput = (cents: number | null) => (cents == null ? '' : String(cents / 100))
export const formatPercent = (ratio: number | null) => (ratio == null ? '—' : `${Math.round(ratio * 100)}%`)

export const carPurposeLabel: Record<CarPurpose, string> = {
  rental: 'Rental car',
  sale: 'Sale car',
}

export const carStatusLabel: Record<CarStatus, string> = {
  preparation: 'Preparation',
  ready: 'Ready',
  rented: 'Rented',
  under_finance: 'Under finance',
  sold: 'Sold',
}

export const featureLabel: Record<CarFeature, string> = {
  full_service_history: 'Full service history',
  logbook: 'Logbook',
  recently_serviced: 'Recently serviced',
  cold_ac: 'Cold A/C',
  extra_key: 'Extra key',
  apple_carplay: 'Apple CarPlay',
  bluetooth: 'Bluetooth',
  reverse_camera: 'Reverse camera',
  new_tyres: 'New tyres',
  new_brakes: 'New brakes',
  automatic: 'Automatic',
  cruise_control: 'Cruise control',
  sunroof: 'Sunroof',
}

export const chargeStatusLabel: Record<ChargeStatus, string> = {
  not_paid: 'Not paid',
  transferred: 'Transferred',
  business_paid: 'Business paid',
  paid_by_customer: 'Paid by customer',
}

export const categoryLabel: Record<TransactionCategory, string> = {
  initial_investment: 'Initial investment',
  expense: 'Expense',
  rental_income: 'Rental income',
  sale_income: 'Sale income',
  bond_received: 'Bond received',
  bond_returned: 'Bond returned',
  bond_applied: 'Bond kept',
}

export const methodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  other: 'Other',
}

/** [value, label] pairs for <select>s and checkbox groups. */
export const labelOptions = <K extends string>(labels: Record<K, string>) =>
  (Object.entries(labels) as [K, string][]).map(([k, v]) => [k, v] as const)

export const documentKindLabel: Record<DocumentKind, string> = {
  licence_front: "Driver's licence (front)",
  licence_back: "Driver's licence (back)",
  passport: 'Passport',
}

export const fuelLabel: Record<FuelType, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  hybrid: 'Hybrid',
  electric: 'Electric',
}

export const contactLabel: Record<ContactMethod, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  phone: 'Phone call',
}

export const rentalStatusLabel: Record<RentalStatus, string> = {
  active: 'Active',
  returned: 'Returned',
}

export const deductionKindLabel: Record<DeductionKind, string> = {
  rent_arrears: 'Rent arrears',
  fine: 'Fine',
  toll: 'Toll',
  damage: 'Damage',
  other: 'Other',
}
