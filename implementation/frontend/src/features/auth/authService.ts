import { FunctionsHttpError, type Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { internalEmailDomain } from './authValidation'

export function getAuthSession() {
  return supabase.auth.getSession()
}

export function subscribeToAuthState(onSessionChange: (session: Session | null) => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => onSessionChange(session))

  return () => subscription.unsubscribe()
}

export async function signInWithPassword(identifier: string, password: string) {
  if (identifier.includes('@')) {
    return supabase.auth.signInWithPassword({ email: identifier, password })
  }

  const { data, error } = await supabase.functions.invoke<{
    access_token: string
    refresh_token: string
  }>('sign-in-with-username', { body: { username: identifier, password } })

  if (error instanceof FunctionsHttpError && [401, 429].includes(error.context.status)) {
    return { data: { session: null }, error: { status: error.context.status as number } }
  }
  if (error || !data?.access_token || !data.refresh_token) {
    throw new Error('Username sign-in unavailable')
  }
  return supabase.auth.setSession(data)
}

export function signUpWithPassword(username: string, email: string, password: string) {
  return supabase.auth.signUp({
    email: email || `${crypto.randomUUID()}@${internalEmailDomain}`,
    password,
    options: { data: { username } },
  })
}

export function signOutFromAuth() {
  return supabase.auth.signOut()
}
