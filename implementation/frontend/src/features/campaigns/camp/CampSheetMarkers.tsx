import type { ButtonHTMLAttributes } from 'react'
import { PixelIcon } from '../../characters/PixelIcon'
import { sheetMarkerLabel, type SheetMarker } from './campSheets'

/**
 * A "Sheet" tag on the bedroll of each adventurer whose character sheet is shared with the
 * party. The tags are real buttons (unlike the decorative name plates): activating one opens
 * that sheet in the Party journal. Their positions are written by the camp's `place` from each
 * `data-camp-sheet-at`, the same way the name plates follow the camera.
 */
export function CampSheetMarkers({
  markers,
  onOpen,
  attention,
}: {
  markers: readonly SheetMarker[]
  onOpen: (marker: SheetMarker, opener: HTMLButtonElement) => void
  /** Hover and keyboard focus outline the bedroll circle in the scene. */
  attention: ButtonHTMLAttributes<HTMLButtonElement>
}) {
  if (markers.length === 0) return null
  return (
    <div className="camp-sheets">
      {markers.map((marker) => (
        <button
          aria-haspopup="dialog"
          aria-label={sheetMarkerLabel(marker)}
          className="camp-sheet"
          data-camp-sheet-at={`${marker.x},${marker.y}`}
          data-sheet-character={marker.characterId}
          key={marker.profileId}
          onClick={(event) => onOpen(marker, event.currentTarget)}
          type="button"
          {...attention}
        >
          <span aria-hidden="true" className="camp-sheet__tag">
            <PixelIcon name="sheet" scale={2} />
            Sheet
          </span>
        </button>
      ))}
    </div>
  )
}
