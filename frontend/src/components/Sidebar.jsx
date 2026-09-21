import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { ROLES } from '../lib/constants'
import {
  IconDashboard, IconBox, IconScan, IconClock, IconEmergency,
  IconReturn, IconCheck, IconChart, IconUsers, IconShield, IconSettings,
  IconReceipt, IconSparkles,
} from './icons'

export default function Sidebar({ role, open, collapsed, onClose }) {
  const groups = useMemo(() => {
    if (role === ROLES.ADMIN) {
      return [
        {
          title: 'Platform Management',
          items: [
            { to: '/admin/members', label: 'Members List', Icon: IconShield },
            { to: '/admin/onboarding', label: 'Shop Onboarding', Icon: IconUsers },
          ],
        },
        {
          title: 'System',
          items: [
            { to: '/admin/settings', label: 'Platform Settings', Icon: IconSettings },
          ],
        },
      ]
    }

    if (role === ROLES.USER) {
      // Cashier Counter Role
      return [
        {
          title: 'Operations',
          items: [
            { to: '/cashier/dashboard', label: 'Dashboard', Icon: IconDashboard },
            { to: '/cashier/billing', label: 'Billing & POS', Icon: IconReceipt },
            { to: '/cashier/inventory', label: 'Inventory Lookup', Icon: IconBox },
            { to: '/cashier/scan', label: 'Scan & Add', Icon: IconScan },
            { to: '/cashier/expiring', label: 'Near Expiry', Icon: IconClock },
            { to: '/cashier/emergency', label: 'Emergency Stock', Icon: IconEmergency },
            { to: '/cashier/returns', label: 'Returns', Icon: IconReturn },
          ],
        },
        {
          title: 'System',
          items: [
            { to: '/cashier/settings', label: 'Settings', Icon: IconSettings },
          ],
        },
      ]
    }

    // Default: Store Owner / Manager
    return [
      {
        title: 'Operations',
        items: [
          { to: '/manager/dashboard', label: 'Dashboard', Icon: IconDashboard },
          { to: '/manager/assist', label: 'AI Assist', Icon: IconSparkles },
          { to: '/manager/inventory', label: 'Inventory', Icon: IconBox },
          { to: '/manager/billing', label: 'Billing & POS', Icon: IconReceipt },
          { to: '/manager/scan', label: 'Scan & Add', Icon: IconScan },
          { to: '/manager/expiring', label: 'Near Expiry', Icon: IconClock },
          { to: '/manager/emergency', label: 'Emergency Requirement', Icon: IconEmergency },
          { to: '/manager/returns', label: 'Returns', Icon: IconReturn },
        ],
      },
      {
        title: 'Management',
        items: [
          { to: '/manager/staff', label: 'Staff Management', Icon: IconUsers },
          { to: '/manager/approvals', label: 'Approvals', Icon: IconCheck },
          { to: '/manager/analytics', label: 'Analytics', Icon: IconChart },
          { to: '/manager/reports', label: 'Reports', Icon: IconChart },
        ],
      },
      {
        title: 'System',
        items: [
          { to: '/manager/settings', label: 'Settings', Icon: IconSettings },
        ],
      },
    ]
  }, [role])

  return (
    <>
      <div className={`sidebar-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <nav className="sb-nav">
          {groups.map((g) => (
            <div className="sb-group" key={g.title}>
              <div className="sb-group-title">{g.title}</div>
              {g.items.map(({ to, label, Icon, end }) => (
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
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-foot-card">
            <div className="sb-foot-dot" />
            <div className="sb-foot-meta">
              <div className="sb-foot-title">
                {role === ROLES.ADMIN ? 'Admin Portal' : role === ROLES.USER ? 'Cashier Mode' : 'Manager Workspace'}
              </div>
              <div className="sb-foot-sub">Google Cloud · live</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
