import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthAppShell } from './features/auth/AuthAppShell'
import { AuthPage } from './features/auth/AuthPage'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthStatus } from './features/auth/AuthStatus'
import { useAuth } from './features/auth/useAuth'
import { CampaignSelectorLayout } from './features/campaigns/CampaignSelectorLayout'
import { CampaignWorkspacePage } from './features/campaigns/CampaignWorkspacePage'
import { CreateCampaignPage } from './features/campaigns/CreateCampaignPage'
import { AppProviders } from './providers/AppProviders'
import { DevelopmentStatusPage } from './pages/DevelopmentStatusPage'
import './features/campaigns/campaigns.css'

function HomeRoute() {
  const { error, isLoading, retrySessionCheck, session } = useAuth()

  if (isLoading || error) {
    return <AuthStatus error={error} isLoading={isLoading} onRetry={retrySessionCheck} />
  }

  return <Navigate to={session ? '/app' : '/login'} replace />
}

function GuestRoute() {
  const { error, isLoading, retrySessionCheck, session } = useAuth()
  const { pathname } = useLocation()

  if (isLoading || error) {
    return <AuthStatus error={error} isLoading={isLoading} onRetry={retrySessionCheck} />
  }

  if (session) {
    return <Navigate to="/app" replace />
  }

  return <AuthPage mode={pathname === '/register' ? 'register' : 'sign-in'} />
}

function ProtectedRoute() {
  const { error, isLoading, retrySessionCheck, session } = useAuth()

  if (isLoading || error) {
    return <AuthStatus error={error} isLoading={isLoading} onRetry={retrySessionCheck} />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <AuthAppShell />
}

function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div>
        <h1>Page not found</h1>
        <Link to="/">Return to account access</Link>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<></>} />
              <Route path="/register" element={<></>} />
            </Route>
            <Route path="/app" element={<ProtectedRoute />}>
              <Route index element={<Navigate to="campaigns" replace />} />
              <Route path="campaigns" element={<CampaignSelectorLayout />}>
                <Route path="new" element={<CreateCampaignPage />} />
              </Route>
              <Route path="campaigns/:campaignId" element={<CampaignWorkspacePage />} />
            </Route>
            <Route path="/dev/status" element={<DevelopmentStatusPage />} />
            <Route path="/not-found" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/not-found" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </AppProviders>
  )
}
