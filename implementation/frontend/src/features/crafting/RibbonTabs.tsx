import { PixelIcon, type PixelIconName } from '../characters/PixelIcon'

/**
 * Switches a journal page between its views with the ribbons the notes and the character sheet
 * use: a pixel icon and an uppercase label on a rule, the current one underlined in oxblood.
 */
export function RibbonTabs<Id extends string>({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string
  tabs: readonly { id: Id; label: string; icon: PixelIconName }[]
  active: Id
  onChange: (id: Id) => void
}) {
  return (
    <nav aria-label={label} className="notebook-tabs">
      {tabs.map((tab) => (
        <button
          aria-current={active === tab.id ? 'page' : undefined}
          className="notebook-tabs__tab"
          key={tab.id}
          onClick={() => active !== tab.id && onChange(tab.id)}
          type="button"
        >
          <PixelIcon name={tab.icon} />
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
