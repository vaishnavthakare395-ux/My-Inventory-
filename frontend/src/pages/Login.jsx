import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ROLES, ROLE_LABELS } from '../lib/constants'
import Logo from '../components/Logo'

export default function Login() {
  const { user, role, login, loginWithGoogle, register } = useAuth()
  const [isRegister, setIsRegister] = useState(false)

  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form state
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regRole, setRegRole] = useState(ROLES.MANAGER)
  const [regShopName, setRegShopName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) {
    const target = role === 'admin' ? '/admin' : role === 'user' ? '/cashier' : '/manager'
    return <Navigate to={target} replace />
  }

  const handleGoogle = async () => {
    setError('')
    setBusy(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      console.error('Google Sign-in error:', err)
      setError(err.message || 'Failed to sign in with Google.')
      setBusy(false)
    }
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(loginEmail.trim(), loginPassword)
    } catch (err) {
      setError(authMessage(err.code))
      setBusy(false)
    }
  }

  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (regPassword.length < 6) {
      return setError('Password must be at least 6 characters long.')
    }
    if (regPassword !== regConfirmPassword) {
      return setError('Passwords do not match. Please re-enter.')
    }
    if (!regName.trim()) {
      return setError('Please provide your full name.')
    }

    setBusy(true)
    try {
      await register({
        email: regEmail.trim(),
        password: regPassword,
        name: regName.trim(),
        phone: regPhone.trim(),
        role: regRole,
        shopName: regRole === ROLES.MANAGER ? (regShopName.trim() || `${regName}'s Store`) : '',
      })
    } catch (err) {
      console.error('Registration error:', err)
      setError(authMessage(err.code))
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-shell">
        <aside className="login-aside">
          <div className="la-brand">
            <Logo size={34} />
            <div className="la-brand-text">
              <span className="la-title">StockFlow</span>
              <span className="la-badge">Enterprise POS</span>
            </div>
          </div>

          <div className="la-hero">
            <div className="la-pill">
              <span className="la-pulse-dot" />
              <span>Retail &amp; Mart OS</span>
            </div>
            <h1>Smart Stock,<br /><span className="la-glow-text">Instant POS Billing.</span></h1>
            <p>
              Barcode-accurate batch deduction, real-time POS billing, emergency stock network, and live cloud audit.
            </p>
          </div>

          <ul className="la-feats">
            <li>
              <div className="la-feat-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14"/></svg>
              </div>
              <div>
                <strong>Barcode-Driven Batch Deduction</strong>
                <p>Physical barcode determines exact batch to reduce stock.</p>
              </div>
            </li>
            <li>
              <div className="la-feat-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              </div>
              <div>
                <strong>Rapid POS Billing Counter</strong>
                <p>Instant barcode scan, automatic GST &amp; receipt printing.</p>
              </div>
            </li>
            <li>
              <div className="la-feat-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <strong>Emergency Stock Sharing</strong>
                <p>Locate &amp; source urgent items from nearby partner marts.</p>
              </div>
            </li>
            <li>
              <div className="la-feat-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <strong>Zero-Waste Expiry Tracking</strong>
                <p>Live shelf-life alerts with immutable transaction audit.</p>
              </div>
            </li>
          </ul>

          <div className="la-metrics-strip">
            <div className="la-metric-col">
              <span className="la-metric-val">100%</span>
              <span className="la-metric-lbl">Barcode Exact</span>
            </div>
            <div className="la-metric-sep" />
            <div className="la-metric-col">
              <span className="la-metric-val">&lt; 60%</span>
              <span className="la-metric-lbl">Partner Profit Cap</span>
            </div>
            <div className="la-metric-sep" />
            <div className="la-metric-col">
              <span className="la-metric-val">Live</span>
              <span className="la-metric-lbl">Cloud Sync</span>
            </div>
          </div>

          <div className="la-foot">
            <span>StockFlow Hub &bull; Multi-Store Cloud</span>
            <span className="la-status-tag">Connected</span>
          </div>
        </aside>

        <div className="login-card" style={{ maxWidth: 440 }}>
          <div style={{ marginBottom: 14 }}><Logo size={44} /></div>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-input, #f3f4f6)', padding: 4, borderRadius: 8, marginBottom: 18 }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => { setIsRegister(false); setError('') }}
              style={{
                flex: 1,
                justifyContent: 'center',
                background: !isRegister ? '#ffffff' : 'transparent',
                boxShadow: !isRegister ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                fontWeight: !isRegister ? 700 : 500,
                color: !isRegister ? 'var(--fg, #111827)' : 'var(--muted, #6b7280)',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => { setIsRegister(true); setError('') }}
              style={{
                flex: 1,
                justifyContent: 'center',
                background: isRegister ? '#ffffff' : 'transparent',
                boxShadow: isRegister ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                fontWeight: isRegister ? 700 : 500,
                color: isRegister ? 'var(--fg, #111827)' : 'var(--muted, #6b7280)',
              }}
            >
              Create Account
            </button>
          </div>

          <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>
            {isRegister ? 'Create Your Account' : 'Welcome to StockFlow'}
          </h1>
          <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
            {isRegister
              ? 'Register with your store details or continue with Google Cloud.'
              : 'Sign in with your Google account or email & password.'}
          </p>

          {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

          {/* Google Cloud Fast Sign-In */}
          <button
            type="button"
            className="btn"
            onClick={handleGoogle}
            disabled={busy}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '11px 16px',
              background: '#ffffff',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>{busy ? 'Connecting to Google…' : isRegister ? 'Quick Register with Google' : 'Continue with Google'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="faint" style={{ fontSize: 11, textTransform: 'uppercase' }}>
              {isRegister ? 'or fill details' : 'or enter password'}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {!isRegister ? (
            /* Login Form */
            <form onSubmit={handleLoginSubmit}>
              <div className="field">
                <label>Email Address</label>
                <input
                  className="input"
                  type="email"
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in to Workspace'}
              </button>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12.5 }}>
                <span className="muted">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => { setIsRegister(true); setError('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Create one now
                </button>
              </div>
            </form>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegisterSubmit}>
              <div className="field">
                <label>Full Name *</label>
                <input
                  className="input"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Vaishnav Thakare"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Email Address *</label>
                  <input
                    className="input"
                    type="email"
                    autoComplete="username"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@shop.com"
                    required
                  />
                </div>
                <div className="field">
                  <label>Contact Phone *</label>
                  <input
                    className="input"
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    required
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div className="field">
                <label>Register As *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className={`btn sm ${regRole === ROLES.MANAGER ? 'primary' : ''}`}
                    onClick={() => setRegRole(ROLES.MANAGER)}
                    style={{ justifyContent: 'center', fontSize: 12, padding: '7px 8px' }}
                  >
                    🏪 Store Owner (/manager)
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${regRole === ROLES.USER ? 'primary' : ''}`}
                    onClick={() => setRegRole(ROLES.USER)}
                    style={{ justifyContent: 'center', fontSize: 12, padding: '7px 8px' }}
                  >
                    🧑‍💼 Cashier (/cashier)
                  </button>
                </div>
              </div>

              {regRole === ROLES.MANAGER && (
                <div className="field">
                  <label>Store / Shop Name (optional)</label>
                  <input
                    className="input"
                    type="text"
                    value={regShopName}
                    onChange={(e) => setRegShopName(e.target.value)}
                    placeholder="e.g. Thakare Supermarket"
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Password (min 6) *</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="field">
                  <label>Confirm Password *</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={busy}>
                {busy ? 'Creating Account…' : 'Create Account & Open Workspace'}
              </button>

              <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5 }}>
                <span className="muted">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => { setIsRegister(false); setError('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          <p className="faint" style={{ marginTop: 18, fontSize: 11.5, textAlign: 'center' }}>
            Protected by Google Cloud Authentication. All accounts encrypted.
          </p>
        </div>
      </div>
    </div>
  )
}

function authMessage(code) {
  switch (code) {
    case 'auth/invalid-email': return 'That email address is not valid.'
    case 'auth/email-already-in-use': return 'An account with this email already exists. Please sign in instead.'
    case 'auth/weak-password': return 'Password is too weak. Please use at least 6 characters.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Email or password is incorrect.'
    case 'auth/user-not-found': return 'No account found with this email. Click "Create Account" above.'
    case 'auth/too-many-requests': return 'Too many attempts. Try again in a bit.'
    case 'auth/popup-closed-by-user': return 'Google Sign-in was cancelled. Please try again.'
    default: return 'Authentication failed. Please check your details and try again.'
  }
}
