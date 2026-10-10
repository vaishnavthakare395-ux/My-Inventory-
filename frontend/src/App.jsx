import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import RoleGuard from './components/RoleGuard'
import Logo from './components/Logo'
import { useAuth } from './lib/AuthContext'
import { persistEmulatorData } from './lib/api'
import { ROLES } from './lib/constants'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import ScanAdd from './pages/ScanAdd'
import Billing from './pages/Billing'
import NearExpiry from './pages/NearExpiry'
import EmergencyRequirement from './pages/EmergencyRequirement'
import Returns from './pages/Returns'
import Approvals from './pages/Approvals'
import Analytics from './pages/Analytics'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import SalesAnalysis from './pages/SalesAnalysis'

const ALL = [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER]

function getHomePath(role) {
  if (role === ROLES.ADMIN) return '/admin/members'
  if (role === ROLES.USER) return '/cashier/dashboard'
  return '/manager/dashboard'
}

const ROUTES = [
  // Admin Directory Routes
  { path: '/admin', title: 'Admin Console', allow: [ROLES.ADMIN], El: Admin, end: true },
  { path: '/admin/members', title: 'Members List', allow: [ROLES.ADMIN], El: Admin },
  { path: '/admin/onboarding', title: 'Shop Onboarding', allow: [ROLES.ADMIN], El: Users },
  { path: '/admin/settings', title: 'Platform Settings', allow: [ROLES.ADMIN], El: Settings },

  // Manager Directory Routes
  { path: '/manager', title: 'Store Dashboard', allow: [ROLES.MANAGER], El: Dashboard, end: true },
  { path: '/manager/dashboard', title: 'Dashboard', allow: [ROLES.MANAGER], El: Dashboard },
  { path: '/manager/inventory', title: 'Inventory', allow: [ROLES.MANAGER], El: Inventory },
  { path: '/manager/billing', title: 'Billing & POS', allow: [ROLES.MANAGER], El: Billing },
  { path: '/manager/scan', title: 'Scan & Add', allow: [ROLES.MANAGER], El: ScanAdd },
  { path: '/manager/expiring', title: 'Near Expiry', allow: [ROLES.MANAGER], El: NearExpiry },
  { path: '/manager/emergency', title: 'Emergency Requirement', allow: [ROLES.MANAGER], El: EmergencyRequirement },
  { path: '/manager/returns', title: 'Returns', allow: [ROLES.MANAGER], El: Returns },
  { path: '/manager/approvals', title: 'Approvals', allow: [ROLES.MANAGER], El: Approvals },
  { path: '/manager/analysis', title: 'Sales Analysis', allow: [ROLES.MANAGER], El: SalesAnalysis },
  { path: '/manager/analytics', title: 'Analytics', allow: [ROLES.MANAGER], El: Analytics },
  { path: '/manager/reports', title: 'Reports', allow: [ROLES.MANAGER], El: Reports },
  { path: '/manager/staff', title: 'Staff Management', allow: [ROLES.MANAGER], El: Users },
  { path: '/manager/settings', title: 'Settings', allow: [ROLES.MANAGER], El: Settings },

  // Cashier Directory Routes
  { path: '/cashier', title: 'Dashboard', allow: [ROLES.USER], El: Dashboard, end: true },
  { path: '/cashier/dashboard', title: 'Dashboard', allow: [ROLES.USER], El: Dashboard },
  { path: '/cashier/billing', title: 'Billing & POS', allow: [ROLES.USER], El: Billing },
  { path: '/cashier/inventory', title: 'Inventory Lookup', allow: [ROLES.USER], El: Inventory },
  { path: '/cashier/scan', title: 'Scan & Add', allow: [ROLES.USER], El: ScanAdd },
  { path: '/cashier/expiring', title: 'Near Expiry', allow: [ROLES.USER], El: NearExpiry },
  { path: '/cashier/emergency', title: 'Emergency Requirement', allow: [ROLES.USER], El: EmergencyRequirement },
  { path: '/cashier/returns', title: 'Returns', allow: [ROLES.USER], El: Returns },
  { path: '/cashier/analysis', title: 'Sales Analysis', allow: [ROLES.USER], El: SalesAnalysis },
  { path: '/cashier/settings', title: 'Settings', allow: [ROLES.USER], El: Settings },

  // Direct Shortcuts
  { path: '/emergency', title: 'Emergency Requirement', allow: ALL, El: EmergencyRequirement },
  { path: '/emergency-requirement', title: 'Emergency Requirement', allow: ALL, El: EmergencyRequirement },
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

  // Automatically ensure emulator accounts and database persist to disk
  useEffect(() => {
    // Initial sync
    persistEmulatorData().catch(() => {})

    // Auto-save every 2 minutes
    const interval = setInterval(() => {
      persistEmulatorData().catch(() => {})
    }, 120000)

    const handleUnload = () => {
      navigator.sendBeacon?.('/api/export-emulator')
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])

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

  const homePath = getHomePath(role)

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <TopBar title={current?.title || ''} onMenu={toggleNav} homePath={homePath} />

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

              {/* Default redirects for home or legacy links */}
              <Route path="/" element={<Navigate to={homePath} replace />} />
              <Route path="/dashboard" element={<Navigate to={role === 'user' ? '/cashier/dashboard' : '/manager/dashboard'} replace />} />
              <Route path="/inventory" element={<Navigate to={role === 'user' ? '/cashier/inventory' : '/manager/inventory'} replace />} />
              <Route path="/billing" element={<Navigate to={role === 'user' ? '/cashier/billing' : '/manager/billing'} replace />} />
              <Route path="/scan" element={<Navigate to={role === 'user' ? '/cashier/scan' : '/manager/scan'} replace />} />
              <Route path="/expiring" element={<Navigate to={role === 'user' ? '/cashier/expiring' : '/manager/expiring'} replace />} />
              <Route path="/emergency-requirement" element={<Navigate to={role === 'user' ? '/cashier/emergency' : '/manager/emergency'} replace />} />
              <Route path="/returns" element={<Navigate to={role === 'user' ? '/cashier/returns' : '/manager/returns'} replace />} />
              <Route path="/onboarding" element={<Navigate to={role === 'admin' ? '/admin/onboarding' : homePath} replace />} />
              <Route path="/shop-onboard" element={<Navigate to={role === 'admin' ? '/admin/onboarding' : homePath} replace />} />
              <Route path="/settings" element={<Navigate to={role === 'admin' ? '/admin/settings' : role === 'user' ? '/cashier/settings' : '/manager/settings'} replace />} />
              <Route path="*" element={<Navigate to={homePath} replace />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
