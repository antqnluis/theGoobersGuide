import type { CampKind } from './campPalette'
import { bedrolls, dormantProps, firePit, wagon, waystone } from './campLayout'

// Every camp image, as a hashed same-origin URL. `no-inline` keeps small sprites
// as files instead of data URIs, so the camp chunk stays code only.
const urls = import.meta.glob<string>('./art/*.png', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
})

export function artUrl(id: string) {
  const url = urls[`./art/${id}.png`]
  if (!url) throw new Error(`Missing camp art "${id}"`)
  return url
}

/** The ridge, mid layer, and ground that belong to one world type. */
export function landscapeIds(kind: CampKind) {
  return kind === 'terrestrial'
    ? { ridge: 'ridge', mid: 'trees', ground: 'ground' }
    : { ridge: `ridge-${kind}`, mid: `mid-${kind}`, ground: `ground-${kind}` }
}

/** Props drawn between the ground and the foreground, back to front. */
export const sceneProps = [wagon, ...dormantProps, waystone, firePit, ...bedrolls].toSorted(
  (a, b) => a.y - b.y,
)

/** Every image one world needs. */
export function assetIdsFor(kind: CampKind) {
  const { ridge, mid, ground } = landscapeIds(kind)
  return ['sky', ridge, mid, ground, 'foreground', ...sceneProps.map(({ id }) => id)]
}
