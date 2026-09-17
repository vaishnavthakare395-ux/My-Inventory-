import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const { user, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(authMessage(err.code))
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-shell">
        <aside className="login-aside">
          <div className="la-brand">
            <Logo size={30} />
            <span>My Inventory</span>
          </div>
          <div className="la-hero">
            <h1>Stock truth,<br />across every warehouse.</h1>
            <p>SKU-first inventory with batch &amp; expiry control, FEFO dispatch, approved transfers and live analytics.</p>
          </div>
          <ul className="la-feats">
            <li><span /> Batch + expiry tracking with FEFO</li>
            <li><span /> Transfer approval &amp; in-transit control</li>
            <li><span /> Barcode / QR scan + camera OCR</li>
            <li><span /> Live analytics &amp; full audit ledger</li>
          </ul>
          <div className="la-foot">Inventory & Order Control</div>
        </aside>

        <form className="login-card" onSubmit={submit}>
          <div style={{ marginBottom: 16 }}><Logo size={48} /></div>
          <h1 style={{ fontSize: 23 }}>Welcome back</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 22 }}>Sign in to your warehouse account.</p>

          {error && <div className="form-error">{error}</div>}

          <div className="field">
            <label>Email</label>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="faint" style={{ marginTop: 18, fontSize: 12, textAlign: 'center' }}>
            Access is limited to your assigned warehouse. Every action is logged.
          </p>
        </form>
      </div>
    </div>
  )
}

function authMessage(code) {
  switch (code) {
    case 'auth/invalid-email': return 'That email address is not valid.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Email or password is incorrect.'
    case 'auth/too-many-requests': return 'Too many attempts. Try again in a bit.'
    default: return 'Could not sign in. Check your connection and try again.'
  }
}
