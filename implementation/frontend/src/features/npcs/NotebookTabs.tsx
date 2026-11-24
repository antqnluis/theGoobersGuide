import { PixelIcon, type PixelIconName } from '../characters/PixelIcon'
import './npcs.css'

export type NotebookTab = 'notes' | 'npcs'

const tabs: { id: NotebookTab; label: string; icon: PixelIconName }[] = [
  { id: 'notes', label: 'Notes', icon: 'quill' },
  { id: 'npcs', label: 'NPCs', icon: 'lantern' },
]

/** Switches the journal crates between campaign notes and the NPC log: ribbons, like the sheet's. */
export function NotebookTabs({
  active,
  onChange,
}: {
  active: NotebookTab
  onChange: (tab: NotebookTab) => void
}) {
  return (
    <nav aria-label="Journal crates" className="notebook-tabs">
      {tabs.map(({ id, label, icon }) => (
        <button
          aria-current={active === id ? 'page' : undefined}
          className="notebook-tabs__tab"
          key={id}
          onClick={() => active !== id && onChange(id)}
          type="button"
        >
          <PixelIcon name={icon} />
          {label}
        </button>
      ))}
    </nav>
  )
}
