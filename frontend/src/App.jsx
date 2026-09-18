import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import RoleGuard from './components/RoleGuard'
import Logo from './components/Logo'
import { useAuth } from './lib/AuthContext'
import { ROLES } from './lib/constants'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import ScanAdd from './pages/ScanAdd'
import NearExpiry from './pages/NearExpiry'
import EmergencyRequirement from './pages/EmergencyRequirement'
import Returns from './pages/Returns'
import Approvals from './pages/Approvals'
import Analytics from './pages/Analytics'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Admin from './pages/Admin'
import Settings from './pages/Settings'

const ALL = [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER]
const SHOP_OPERATIONS = [ROLES.MANAGER, ROLES.USER]

const ROUTES = [
  { path: '/', title: 'Dashboard', allow: SHOP_OPERATIONS, El: Dashboard, end: true },
  { path: '/inventory', title: 'Inventory', allow: SHOP_OPERATIONS, El: Inventory },
  { path: '/scan', title: 'Scan & Add', allow: SHOP_OPERATIONS, El: ScanAdd },
  { path: '/expiring', title: 'Near Expiry', allow: SHOP_OPERATIONS, El: NearExpiry },
  { path: '/emergency-requirement', title: 'Emergency Requirement', allow: SHOP_OPERATIONS, El: EmergencyRequirement },
  { path: '/returns', title: 'Returns', allow: SHOP_OPERATIONS, El: Returns },
  { path: '/approvals', title: 'Approvals', allow: [ROLES.MANAGER], El: Approvals },
  { path: '/analytics', title: 'Analytics', allow: [ROLES.MANAGER], El: Analytics },
  { path: '/reports', title: 'Reports', allow: [ROLES.MANAGER], El: Reports },
  { path: '/users', title: 'Shop Onboarding', allow: [ROLES.ADMIN, ROLES.MANAGER], El: Users },
  { path: '/admin', title: 'Members List', allow: [ROLES.ADMIN], El: Admin },
  { path: '/settings', title: 'Settings', allow: ALL, El: Settings },
]

export default function App() {
  const { user, role, loading } = useAuth()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false) // mobile drawer
  const [collapsed, setCollapsed] = useState(false) // desktop icons-only

  const toggleNav = () => {
    if (window.innerWidth <= 980) setNavOpen((v) => !v)
    else setCollapsed((v) => !v)
  }

  if (loading) {
    return (
      <div className="boot">
        <div className="boot-card">
          <div className="boot-logo-wrap">
            <Logo size={56} />
          </div>
          <div className="boot-brand">My Inventory</div>
          <div className="boot-sub">Inventory &amp; Orders</div>
          <div className="boot-bar"><span /></div>
          <div className="boot-text">Loading your workspace…</div>
        </div>
      </div>
    )
  }

  if (location.pathname === '/login' || !user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const current =
    ROUTES.find((r) => (r.end ? location.pathname === r.path : location.pathname.startsWith(r.path) && r.path !== '/')) ||
    ROUTES[0]

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <TopBar title={current?.title || ''} onMenu={toggleNav} />

      <div className="shell-body">
        <Sidebar role={role} open={navOpen} collapsed={collapsed} onClose={() => setNavOpen(false)} />

        <main className="content">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              {ROUTES.map(({ path, allow, El, end }) => (
                <Route
                  key={path}
                  path={path}
                  end={end}
                  element={
                    <RoleGuard allow={allow}>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                      >
                        <El />
                      </motion.div>
                    </RoleGuard>
                  }
                />
              ))}
              <Route path="*" element={<Navigate to={role === 'admin' ? '/admin' : '/'} replace />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
