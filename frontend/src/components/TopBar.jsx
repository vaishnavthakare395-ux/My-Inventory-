import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { ROLE_LABELS } from '../lib/constants'
import AlertsBell from './AlertsBell'
import Logo from './Logo'
import { IconMenu, IconSettings, IconLogout } from './icons'

export default function TopBar({ title, onMenu }) {
  const { profile, role, myLocations, logout } = useAuth()
  const { activeLocationId, setActive, activeLocation } = useWorkspace()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const initials = (profile?.name || profile?.email || '?')
    .split(/[ @.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="topbar">
      <button className="tb-menu" onClick={onMenu} aria-label="Toggle menu"><IconMenu /></button>

      <Link to="/" className="tb-brand">
        <Logo size={30} />
        <span className="tb-brand-name">My Inventory</span>
      </Link>

      <span className="tb-divider" />

      <div className="tb-title">
        <h2>{title}</h2>
        {activeLocation && <span className="tb-loc-tag">{activeLocation.name}</span>}
      </div>

      <div className="tb-right">
        {myLocations.length > 0 && (
          <select
            className="select tb-loc"
            value={activeLocationId}
            onChange={(e) => setActive(e.target.value)}
            title="Active warehouse"
          >
            {myLocations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        <AlertsBell />

        <div className="tb-user-wrap">
          <button className="tb-user" onClick={() => setMenuOpen((v) => !v)}>
            <span className="tb-avatar">{initials}</span>
            <span className="tb-user-meta">
              <span className="tb-user-name">{profile?.name || profile?.email}</span>
              <span className="tb-user-role">{ROLE_LABELS[role] || role}</span>
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="tb-menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="tb-menu-pop">
                <Link to="/settings" className="tb-menu-item" onClick={() => setMenuOpen(false)}>
                  <IconSettings className="tb-mi-ico" /> Settings
                </Link>
                <button className="tb-menu-item" onClick={handleLogout}>
                  <IconLogout className="tb-mi-ico" /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
