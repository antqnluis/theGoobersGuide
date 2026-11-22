import { forwardRef } from 'react'
import { D20Icon } from './DiceIcons'

/** The dock's one button: always labelled, with a count of rolls others made while the tray was shut. */
export const DiceTrayButton = forwardRef<
  HTMLButtonElement,
  { open: boolean; unseen: number; onClick: () => void }
>(function DiceTrayButton({ open, unseen, onClick }, ref) {
  return (
    <button
      aria-controls="dice-tray"
      aria-expanded={open}
      className="dice-dock__button"
      onClick={onClick}
      ref={ref}
      type="button"
    >
      <D20Icon size={22} />
      <span>Dice</span>
      {unseen > 0 && (
        <span className="dice-dock__badge">
          <span aria-hidden="true">{unseen > 99 ? '99+' : unseen}</span>
          <span className="dice-sr">
            {unseen} new {unseen === 1 ? 'roll' : 'rolls'} at the table
          </span>
        </span>
      )}
    </button>
  )
})
