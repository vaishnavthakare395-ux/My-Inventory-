import { NavLink } from 'react-router-dom'
import { ROLES } from '../lib/constants'
import {
  IconDashboard, IconBox, IconScan, IconClock, IconEmergency,
  IconReturn, IconCheck, IconChart, IconUsers, IconShield, IconSettings,
} from './icons'

const GROUPS = [
  {
    title: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', Icon: IconDashboard, roles: [ROLES.MANAGER, ROLES.USER], end: true },
      { to: '/inventory', label: 'Inventory', Icon: IconBox, roles: [ROLES.MANAGER, ROLES.USER] },
      { to: '/scan', label: 'Scan & Add', Icon: IconScan, roles: [ROLES.MANAGER, ROLES.USER] },
      { to: '/expiring', label: 'Near Expiry', Icon: IconClock, roles: [ROLES.MANAGER, ROLES.USER] },
      { to: '/emergency-requirement', label: 'Emergency Requirement', Icon: IconEmergency, roles: [ROLES.MANAGER, ROLES.USER] },
      { to: '/returns', label: 'Returns', Icon: IconReturn, roles: [ROLES.MANAGER, ROLES.USER] },
    ],
  },
  {
    title: 'Management',
    items: [
      { to: '/users', label: 'Shop Onboarding', Icon: IconUsers, roles: [ROLES.ADMIN, ROLES.MANAGER] },
      { to: '/approvals', label: 'Approvals', Icon: IconCheck, roles: [ROLES.MANAGER] },
      { to: '/analytics', label: 'Analytics', Icon: IconChart, roles: [ROLES.MANAGER] },
      { to: '/reports', label: 'Reports', Icon: IconChart, roles: [ROLES.MANAGER] },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin', label: 'Members List', Icon: IconShield, roles: [ROLES.ADMIN] },
      { to: '/settings', label: 'Settings', Icon: IconSettings, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER] },
    ],
  },
]

export default function Sidebar({ role, open, collapsed, onClose }) {
  return (
    <>
      <div className={`sidebar-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <nav className="sb-nav">
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => i.roles.includes(role))
            if (!items.length) return null
            return (
              <div className="sb-group" key={g.title}>
                <div className="sb-group-title">{g.title}</div>
                {items.map(({ to, label, Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onClose}
                    title={label}
                    className={({ isActive }) => (isActive ? 'sb-link on' : 'sb-link')}
                  >
                    <Icon className="sb-ico" />
                    <span className="sb-label">{label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sb-foot">
          <div className="sb-foot-card">
            <div className="sb-foot-dot" />
            <div className="sb-foot-meta">
              <div className="sb-foot-title">All systems live</div>
              <div className="sb-foot-sub">Secure cloud · synced</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
