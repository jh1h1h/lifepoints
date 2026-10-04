import type { EntityType } from '../services/docsService'

export function docPath(type: EntityType, id?: string): string {
  return `/docs/${type === 'friend' ? 'friends' : 'projects'}${id ? `/${id}` : ''}`
}
