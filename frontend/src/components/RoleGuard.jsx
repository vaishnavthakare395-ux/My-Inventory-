import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

// Renders children only if the signed-in user's role is allowed; otherwise
// bounces to the dashboard.
export default function RoleGuard({ allow, children }) {
  const { role } = useAuth()
  if (!role) return null
  if (allow && !allow.includes(role)) {
    const fallback = role === 'admin' ? '/admin' : '/'
    return <Navigate to={fallback} replace />
  }
  return children
}
