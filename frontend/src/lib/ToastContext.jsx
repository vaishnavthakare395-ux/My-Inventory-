import { createContext, useCallback, useContext, useState } from 'react'

const ToastCtx = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((kind, message) => {
    const id = nextId++
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  const api = {
    ok: (m) => push('ok', m),
    err: (m) => push('err', m),
    info: (m) => push('info', m),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
