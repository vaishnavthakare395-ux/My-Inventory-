// Shared domain vocabulary. Keeping these in one place stops typos like
// "in-transit" vs "in_transit" from creeping into queries and rules.

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
}

export const ROLE_LABELS = {
  admin: 'Super Admin',
  manager: 'Office Manager',
  user: 'Warehouse User',
}

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
