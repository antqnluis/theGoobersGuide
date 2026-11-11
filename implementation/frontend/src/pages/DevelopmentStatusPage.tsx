import { useQuery } from '@tanstack/react-query'
import { StatusRow } from '../components/StatusRow'
import { checkSupabaseConnection } from '../lib/supabaseHealth'
import { isSupabaseConfigured } from '../lib/supabaseConfig'

export function DevelopmentStatusPage() {
  const supabaseHealth = useQuery({
    queryKey: ['supabase', 'health'],
    queryFn: checkSupabaseConnection,
    enabled: isSupabaseConfigured,
  })

  const supabaseState = !isSupabaseConfigured
    ? 'setup'
    : supabaseHealth.isPending
      ? 'checking'
      : supabaseHealth.isError
        ? 'error'
        : 'ready'

  const supabaseValue = !isSupabaseConfigured
    ? 'Configuration is missing. Copy .env.example to .env.local and add the local publishable key.'
    : supabaseHealth.isPending
      ? 'Checking the local Auth API…'
      : supabaseHealth.isError
        ? 'Could not connect to the local Supabase API.'
        : 'Connected to the local Supabase Auth API.'

  const supabaseDetail = !isSupabaseConfigured
    ? 'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY'
    : supabaseHealth.isError
      ? `${supabaseHealth.error.message} Start Supabase from implementation/backend with npm run supabase:start.`
      : undefined

  return (
    <main className="min-h-screen bg-stone-950 px-5 py-12 text-stone-100 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 border-b border-stone-800 pb-8 sm:mb-12 sm:pb-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
            Local development setup
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            The Goober&apos;s Guide
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-stone-400">
            A D&amp;D companion under construction. This screen checks the local app and service
            connection.
          </p>
        </header>

        <section
          aria-labelledby="status-heading"
          className="rounded-2xl border border-stone-800 bg-stone-900/70 p-5 shadow-xl shadow-black/20 sm:p-7"
          data-testid="integration-panel"
        >
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Integration check
            </p>
            <h2 id="status-heading" className="mt-2 text-xl font-semibold text-stone-100">
              Application status
            </h2>
          </div>

          <div aria-live="polite">
            <StatusRow label="React" value="Application initialized and rendering." state="ready" />
            <StatusRow
              label="Tailwind CSS v4"
              value="Utility styles are loaded through Vite."
              state="ready"
            />
            <StatusRow
              label="Local Supabase"
              value={supabaseValue}
              state={supabaseState}
              detail={supabaseDetail}
            />
          </div>
        </section>

        <p className="mt-6 text-sm text-stone-600">
          This is an infrastructure check, not a product dashboard.
        </p>
      </div>
    </main>
  )
}
