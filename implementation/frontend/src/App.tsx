import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppProviders } from './providers/AppProviders'
import { DevelopmentStatusPage } from './pages/DevelopmentStatusPage'

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-950 p-6 text-stone-100">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <a className="mt-4 inline-block text-amber-300 underline" href="/">
          Return to the setup screen
        </a>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DevelopmentStatusPage />} />
          <Route path="/not-found" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/not-found" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  )
}
