import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  isLoading: boolean
  error: string | null
}

export type AuthContextValue = AuthState & {
  acceptSession: (session: Session | null) => void
  retrySessionCheck: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
