// Shared domain vocabulary. Keeping these in one place stops typos like
// "in-transit" vs "in_transit" from creeping into queries and rules.

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
}

export const ROLE_LABELS = {
  admin: 'Platform Admin',
  manager: 'Shop Manager',
  user: 'Shop User',
}

export const SHOP_TYPES = [
  { id: 'pharmacy', label: 'Pharmacy / Medical', icon: '💊' },
  { id: 'general_store', label: 'General Store / Kirana', icon: '🏪' },
  { id: 'mart', label: 'Supermarket / Mart', icon: '🛒' },
  { id: 'grocery', label: 'Grocery & Fresh Produce', icon: '🥦' },
  { id: 'electronics', label: 'Electronics & Hardware', icon: '⚡' },
  { id: 'clothing', label: 'Clothing & Apparel', icon: '👕' },
  { id: 'other', label: 'Other Retail / Wholesale', icon: '📦' },
]

export const SUBSCRIPTION_PLANS = [
  { id: '1_month', label: '1 Month', months: 1, price: 499, currency: '₹' },
  { id: '2_months', label: '2 Months', months: 2, price: 899, currency: '₹' },
  { id: '6_months', label: '6 Months', months: 6, price: 2499, currency: '₹', badge: 'Popular' },
  { id: '1_year', label: '1 Year', months: 12, price: 4499, currency: '₹', badge: 'Best Value' },
]

// Transfer state machine. Each box moves strictly forward through these.
export const TRANSFER_STATUS = {
  DRAFT: 'draft',
  SHIPPED: 'shipped',
  IN_TRANSIT: 'in_transit',
  ACCEPTED: 'accepted',
  MISMATCH: 'mismatch',
  SOLD: 'sold',
}

export const TRANSFER_FLOW = ['draft', 'shipped', 'in_transit', 'accepted', 'sold']

export const ORDER_STATUS = {
  PENDING: 'pending',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  SOLD: 'sold',
}

export const RETURN_REASONS = [
  'Customs return',
  'Failed delivery',
  'Customer return',
  'RTO',
]

export const RETURN_CONDITIONS = ['Good', 'Damaged', 'Expired', 'Hold']

// How a ledger row describes itself.
export const LEDGER_REASONS = {
  ADD_STOCK: 'add_stock',
  TRANSFER_OUT: 'transfer_out',
  TRANSFER_IN: 'transfer_in',
  SOLD: 'sold',
  RETURN_IN: 'return_in',
  ADJUST: 'adjust',
}

// Expiry windows in days. Used by both alerts and inventory colouring.
export const EXPIRY_WINDOWS = {
  CRITICAL: 7,
  HIGH: 15,
  WARN: 30,
  WATCH: 90, // ~3 months — the "expiry near" heads-up the team wanted
}
