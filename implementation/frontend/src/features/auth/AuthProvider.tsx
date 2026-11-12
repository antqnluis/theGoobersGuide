import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type AuthState } from './authContext'
import { getAuthSession, subscribeToAuthState } from './authService'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    session: null,
    isLoading: true,
    error: null,
  })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let isMounted = true
    let authEventReceived = false
    let unsubscribe: () => void = () => {}

    try {
      unsubscribe = subscribeToAuthState((session) => {
        authEventReceived = true
        if (isMounted) {
          setAuthState({ session, isLoading: false, error: null })
        }
      })
    } catch {
      void Promise.resolve().then(() => {
        if (isMounted) {
          setAuthState({
            session: null,
            isLoading: false,
            error: "We couldn't check your session. Try again.",
          })
        }
      })
    }

    void getAuthSession()
      .then(({ data, error }) => {
        if (!isMounted || authEventReceived) {
          return
        }

        setAuthState(
          error
            ? {
                session: null,
                isLoading: false,
                error: "We couldn't check your session. Try again.",
              }
            : { session: data.session, isLoading: false, error: null },
        )
      })
      .catch(() => {
        if (isMounted && !authEventReceived) {
          setAuthState({
            session: null,
            isLoading: false,
            error: "We couldn't check your session. Try again.",
          })
        }
      })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [retryCount])

  const acceptSession = useCallback((session: Session | null) => {
    setAuthState({ session, isLoading: false, error: null })
  }, [])

  const retrySessionCheck = useCallback(() => {
    setAuthState({ session: null, isLoading: true, error: null })
    setRetryCount((count) => count + 1)
  }, [])

  const value = useMemo(
    () => ({ ...authState, acceptSession, retrySessionCheck }),
    [authState, acceptSession, retrySessionCheck],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
