import type { PixelIconName } from '../characters/PixelIcon'
import type { AdventureStatus, AdventureType } from './adventureTypes'

/** The icon that marks each adventure type, on a row's spine and in its chip. */
export const typeIcons: Record<AdventureType, PixelIconName> = {
  main: 'star',
  side: 'book',
  personal: 'quill',
}

/** The icon in each status chip, so status is never colour alone. */
export const statusIcons: Record<AdventureStatus, PixelIconName> = {
  pending: 'lantern',
  in_progress: 'boot',
  on_hold: 'lock',
  completed: 'shield',
}
