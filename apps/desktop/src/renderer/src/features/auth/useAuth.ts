import { useCallback, useEffect, useState } from 'react'
import type { AuthState, AuthUser } from '../../../../shared/types'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export function useAuth(): {
  authState: AuthState
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  loginWithGoogle: () => Promise<void>
  loginWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  devSignIn: (email?: string, name?: string) => Promise<void>
} {
  const [authState, setAuthState] = useState<AuthState>({ status: 'unauthenticated' })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    if (window.kestrel?.getAuthState) {
      window.kestrel
        .getAuthState()
        .then((state) => {
          if (mounted) {
            setAuthState(state)
            setIsLoading(false)
          }
        })
        .catch((err) => {
          console.error('[useAuth] failed to get initial auth state:', err)
          if (mounted) setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }

    const unsubscribe = window.kestrel?.onAuthStateChanged?.((state) => {
      if (mounted) {
        setAuthState(state)
        setIsLoading(false)
      }
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const user = authState.status === 'authenticated' ? authState.user : null
  const isAuthenticated = authState.status === 'authenticated'

  const loginWithGoogle = useCallback(async () => {
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'http://127.0.0.1:8765/callback',
            skipBrowserRedirect: true
          }
        })
        if (error) throw error
        if (data.url) {
          await window.kestrel.openOAuthUrl(data.url)
          return
        }
      }

      // Safe fallback for offline / development testing without active Supabase credentials
      await window.kestrel.setAuthSession(
        { accessToken: 'dev-access-token-faiz' },
        { id: 'usr-faiz', email: 'faiz@voiceos.com', name: 'Faiz' }
      )
    } catch (error) {
      console.error('[useAuth] Google sign-in failed:', error)
      throw error
    }
  }, [])

  const loginWithEmail = useCallback(async (email: string) => {
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: 'http://127.0.0.1:8765/callback'
          }
        })
        if (error) throw error
        return
      }

      // Fallback for dev/demo mode
      const name = email.split('@')[0] || 'User'
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1)
      await window.kestrel.setAuthSession(
        { accessToken: `dev-token-${Date.now()}` },
        { id: `usr-${Date.now()}`, email, name: capitalized }
      )
    } catch (error) {
      console.error('[useAuth] Email sign-in failed:', error)
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    await window.kestrel?.signOut()
  }, [])

  const devSignIn = useCallback(async (email = 'faiz@voiceos.com', name = 'Faiz') => {
    await window.kestrel?.setAuthSession(
      { accessToken: `dev-token-${Date.now()}` },
      { id: 'usr-faiz', email, name }
    )
  }, [])

  return {
    authState,
    user,
    isAuthenticated,
    isLoading,
    loginWithGoogle,
    loginWithEmail,
    signOut,
    devSignIn
  }
}

