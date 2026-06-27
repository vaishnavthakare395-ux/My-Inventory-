// Small coloured pill for status. tone: good | warn | bad | info | muted
export default function StatusBadge({ tone = 'muted', children }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  )
}

// Maps a transfer/order status to a coloured badge.
const FLOW = {
  draft: { tone: 'muted', label: 'Draft' },
  shipped: { tone: 'info', label: 'Shipped' },
  in_transit: { tone: 'warn', label: 'In transit' },
  accepted: { tone: 'good', label: 'Accepted' },
  mismatch: { tone: 'bad', label: 'Mismatch' },
  sold: { tone: 'good', label: 'Sold' },
  pending: { tone: 'muted', label: 'Pending' },
  delivered: { tone: 'good', label: 'Delivered' },
  returned: { tone: 'warn', label: 'Returned' },
}

export function FlowBadge({ status }) {
  const s = FLOW[status] || { tone: 'muted', label: status || '—' }
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
}
