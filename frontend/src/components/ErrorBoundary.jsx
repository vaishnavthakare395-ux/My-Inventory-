import { Component } from 'react'

// Catches any render error so a crash shows a recover screen instead of a blank
// white page in production.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot" style={{ gap: 18, padding: 24, textAlign: 'center' }}>
          <span className="boot-logo" style={{ animation: 'none' }} />
          <div>
            <h2 style={{ fontSize: 20, marginBottom: 6 }}>Something went wrong</h2>
            <p className="muted" style={{ fontSize: 14, maxWidth: 380 }}>
              The page hit an unexpected error. Reloading usually fixes it.
            </p>
          </div>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
