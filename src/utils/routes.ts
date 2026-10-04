import { useEffect, useState } from 'react'

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')

export function appPath(pathname: string): string {
  const path =
    pathname === basePath
      ? '/'
      : pathname.startsWith(basePath + '/')
        ? pathname.slice(basePath.length)
        : pathname
  return path === '/' ? '/points' : path
}

export function href(path: string): string {
  return `${basePath}${path}`
}

export function navigate(path: string): boolean {
  const event = new Event('docs-before-navigate', { cancelable: true })
  if (!window.dispatchEvent(event)) return false
  window.history.pushState({}, '', href(path))
  window.dispatchEvent(new Event('app-navigate'))
  return true
}

export function useRoute(): string {
  const [path, setPath] = useState(() => appPath(window.location.pathname))
  useEffect(() => {
    if (
      appPath(window.location.pathname) === '/points' &&
      window.location.pathname !== href('/points')
    ) {
      window.history.replaceState({}, '', href('/points'))
    }
    let currentPath = appPath(window.location.pathname)
    const update = () => {
      currentPath = appPath(window.location.pathname)
      setPath(currentPath)
    }
    const pop = () => {
      const next = appPath(window.location.pathname)
      if (
        next !== currentPath &&
        !window.dispatchEvent(
          new Event('docs-before-navigate', { cancelable: true }),
        )
      ) {
        window.history.pushState({}, '', href(currentPath))
        return
      }
      update()
    }
    window.addEventListener('app-navigate', update)
    window.addEventListener('popstate', pop)
    return () => {
      window.removeEventListener('app-navigate', update)
      window.removeEventListener('popstate', pop)
    }
  }, [])
  return path
}
