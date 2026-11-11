import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './supabaseConfig'

export async function checkSupabaseConnection(): Promise<{ connected: true }> {
  if (!isSupabaseConfigured || !supabasePublishableKey) {
    throw new Error('Supabase environment variables are not configured.')
  }

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabasePublishableKey },
    })
  } catch {
    throw new Error('No response from the local Supabase API.')
  }

  if (!response.ok) {
    throw new Error(`The local Supabase API returned HTTP ${response.status}.`)
  }

  return { connected: true }
}
