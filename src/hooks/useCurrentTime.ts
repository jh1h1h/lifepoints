import { useEffect, useState } from 'react'

export function useCurrentTime(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const interval = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return now
}
