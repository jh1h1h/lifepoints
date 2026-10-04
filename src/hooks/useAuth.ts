import { useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../services/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [error, setError] = useState('')
  useEffect(
    () =>
      auth
        ? onAuthStateChanged(
            auth,
            (current) => {
              setUser(current)
              setLoading(false)
            },
            (failure) => {
              setError(failure.message)
              setLoading(false)
            },
          )
        : undefined,
    [],
  )
  async function signIn() {
    if (!auth) return
    setError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (failure) {
      const code = (failure as { code?: string }).code
      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleProvider)
        } catch (redirectError) {
          setError((redirectError as Error).message)
        }
      } else if (code !== 'auth/popup-closed-by-user')
        setError((failure as Error).message)
    }
  }
  async function logOut() {
    if (auth) await signOut(auth)
  }
  return { user, loading, error, signIn, logOut }
}
