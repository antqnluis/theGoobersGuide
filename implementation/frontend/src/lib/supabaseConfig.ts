const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()

export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const isSupabaseConfigured = Boolean(configuredUrl && supabasePublishableKey)
export const supabaseUrl = configuredUrl || 'http://127.0.0.1:54321'
