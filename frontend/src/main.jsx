import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './lib/AuthContext'
import { WorkspaceProvider } from './lib/WorkspaceContext'
import { AlertsProvider } from './lib/AlertsContext'
import { ToastProvider } from './lib/ToastContext'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <AlertsProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </AlertsProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)
