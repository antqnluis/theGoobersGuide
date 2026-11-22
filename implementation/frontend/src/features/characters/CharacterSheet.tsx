import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { characterSheetOptions } from './characterQueries'
import {
  abilityLabels,
  formatModifier,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  skillList,
  abilityModifier,
} from './characterSheetRules'
import {
  abilityKeys,
  type AbilityKey,
  type CharacterAttack,
  type CharacterSheet as CharacterSheetData,
  type CharacterSheetBody,
  type CharacterSummary,
  type CharacterVitals,
  type SkillKey,
  type SkillProficiency,
} from './characterTypes'
import { limits, validateSheetBody, validateVitals } from './characterValidation'
import { CharacterCoins, type CoinActions } from './CharacterCoins'
import { CharacterExport } from './CharacterExport'
import { CharacterImportHistory } from './CharacterImportHistory'
import { CharacterImportUpdates } from './CharacterImportUpdates'
import { CharacterInventory, type InventoryActions } from './CharacterInventory'
import { DiceText } from '../dice/TextWithDice'
import { RollButton } from '../dice/RollButton'
import {
  abilityCheckRoll,
  attackDamageRoll,
  attackHitRoll,
  initiativeRoll,
  savingThrowRoll,
  skillRoll,
} from './characterRolls'
import { carryingCapacity } from './inventoryRules'
import { PixelIcon, type PixelIconName } from './PixelIcon'
import { SpellList } from './SpellList'
import { inventoryActions, type useCharacterActions } from './useCharacterActions'

export type SheetActions = Pick<
  ReturnType<typeof useCharacterActions>,
  'saveVitals' | 'saveSheet' | 'pendingAction' | 'pendingCharacterId'
> &
  CoinActions &
  InventoryActions

type CharacterSheetProps = {
  character: CharacterSummary
  userId: string
  /** Others' shared sheets are read-only; the owner edits. */
  readOnly: boolean
  /**
   * With `readOnly`, still lets the owner change current HP in place (and save it); every
   * other field stays display-only. Needs `actions`.
   */
  quickHp?: boolean
  actions?: SheetActions
  onNotice?: (notice: string) => void
  /** Reports whether any edit is unsaved, so the caller can guard leaving. */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * An element to hold the save bar, so it can stay pinned to the journal's bottom edge
   * beyond the sheet itself. Without one, the bar sits at the end of the sheet.
   */
  dock?: HTMLElement | null
}

/** A character's sheet: loading, error, and hidden states around the sheet itself. */
export function CharacterSheet({
  character,
  userId,
  readOnly,
  quickHp = false,
  actions,
  onNotice,
  onDirtyChange,
  dock,
}: CharacterSheetProps) {
  const query = useQuery(characterSheetOptions(character.id, userId))

  if (query.isPending) {
    return (
      <p className="journal-status" role="status">
        Loading character sheet…
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="journal-status journal-status--error" role="alert">
        <p>The character sheet could not be loaded.</p>
        <button
          className="journal-button journal-button--secondary"
          onClick={() => query.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }
  if (!query.data) {
    return <p className="journal-status">This sheet is no longer available.</p>
  }

  return (
    <SheetContent
      actions={actions}
      character={character}
      dock={dock}
      key={character.id}
      onDirtyChange={onDirtyChange}
      onNotice={onNotice}
      quickHp={quickHp && readOnly && Boolean(actions)}
      readOnly={readOnly || !actions}
      sheet={query.data}
      userId={userId}
    />
  )
}

type Draft = {
  max_hp: string
  current_hp: string
  temp_hp: string
  armor_class: string
  speed: string
}

const vitalFields = [
  ['current_hp', 'Current HP'],
  ['max_hp', 'Maximum HP'],
  ['temp_hp', 'Temporary HP'],
  ['armor_class', 'Armor class'],
  ['speed', 'Speed'],
] as const

function toDraft(sheet: CharacterSheetData): Draft {
  const text = (value: number | null) => (value === null ? '' : String(value))
  return {
    max_hp: text(sheet.max_hp),
    current_hp: text(sheet.current_hp),
    temp_hp: text(sheet.temp_hp),
    armor_class: text(sheet.armor_class),
    speed: text(sheet.speed),
  }
}

function parseVital(value: string, emptyAs: number | null) {
  return value.trim() === '' ? emptyAs : Number(value)
}

const notSet = (value: number | null, suffix = '') =>
  value === null ? 'Not set' : `${value}${suffix}`

const sectionTabs: readonly (readonly [string, string, PixelIconName])[] = [
  ['vitals', 'Vitals', 'heart'],
  ['abilities', 'Abilities', 'shield'],
  ['skills', 'Skills', 'book'],
  ['attacks', 'Attacks', 'sword'],
  ['spells', 'Spells', 'flame'],
  ['coins', 'Coins', 'coin'],
  ['inventory', 'Inventory', 'pack'],
  ['notes', 'Notes', 'quill'],
]

function SheetContent({
  actions,
  character,
  dock,
  onDirtyChange,
  onNotice,
  quickHp,
  readOnly,
  sheet,
  userId,
}: {
  actions?: SheetActions
  character: CharacterSummary
  dock?: HTMLElement | null
  onDirtyChange?: (dirty: boolean) => void
  onNotice?: (notice: string) => void
  quickHp: boolean
  readOnly: boolean
  sheet: CharacterSheetData
  userId: string
}) {
  const level = character.level
  // Roll buttons are for your own sheet, in its display view (D6): others' sheets only read, and
  // the edit view is for changing numbers, not rolling them.
  const canRoll = readOnly && character.owner_id === userId
  const vitalsFormId = useId()
  const [vitalsDraft, setVitalsDraft] = useState<Draft>(() => toDraft(sheet))
  const [vitalsErrors, setVitalsErrors] = useState<string[]>([])
  const [body, setBody] = useState<CharacterSheetBody>(sheet.sheet)
  const [bodyErrors, setBodyErrors] = useState<string[]>([])
  // Coins and items save on their own, so they never lock the stats and sheet fields.
  const busy =
    actions?.pendingAction != null &&
    actions.pendingCharacterId === character.id &&
    !inventoryActions.includes(actions.pendingAction)
  const [itemFormDirty, setItemFormDirty] = useState(false)
  // Inventory and notes can fold away; their content stays mounted so edits are never lost.
  const [open, setOpen] = useState({ inventory: true, notes: true })
  // The sheet's pages, or the import and export tools; the sheet stays mounted behind the tools.
  const [view, setView] = useState<'sheet' | 'tools'>('sheet')
  const pendingJump = useRef<string | null>(null)
  const savingVitals = busy && actions?.pendingAction === 'vitals'
  const savingSheet = busy && actions?.pendingAction === 'sheet'

  const savedBody = JSON.stringify(sheet.sheet)
  const bodyDirty = JSON.stringify(body) !== savedBody
  const savedVitals = toDraft(sheet)
  const vitalsDirty = vitalFields.some(([field]) => vitalsDraft[field] !== savedVitals[field])
  // The save bar serves the full editor, and the display's current-HP quick edit.
  const hasBar = !readOnly || quickHp
  const dirty = hasBar && (bodyDirty || vitalsDirty)
  // Coins and items are interactive wherever the owner works (display and edit views).
  const owned = hasBar && Boolean(actions)
  // An open item form with typed input also counts as unsaved when leaving.
  const unsaved = dirty || (owned && itemFormDirty)

  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(unsaved)
  }, [unsaved])
  useEffect(() => () => reportRef.current?.(false), [])

  const update = (change: (current: CharacterSheetBody) => CharacterSheetBody) => {
    setBody((current) => change(current))
    setBodyErrors([])
  }

  async function saveVitals() {
    if (!actions) return
    const next: CharacterVitals = {
      max_hp: parseVital(vitalsDraft.max_hp, null),
      current_hp: parseVital(vitalsDraft.current_hp, null),
      temp_hp: parseVital(vitalsDraft.temp_hp, 0) as number,
      armor_class: parseVital(vitalsDraft.armor_class, null),
      speed: parseVital(vitalsDraft.speed, null),
    }
    const found = Object.values(validateVitals(next))
    setVitalsErrors(found)
    if (found.length) return
    const patch: Partial<CharacterVitals> = {}
    for (const [field] of vitalFields) {
      if (vitalsDraft[field] !== savedVitals[field]) patch[field] = next[field] as never
    }
    if (await actions.saveVitals(character.id, patch)) onNotice?.('Stats saved.')
  }

  async function saveBody() {
    if (!actions) return
    const found = validateSheetBody(body)
    setBodyErrors(found)
    if (found.length) return
    if (await actions.saveSheet(character.id, body, sheet.updated_at)) {
      onNotice?.('Character sheet saved.')
    }
  }

  function discard() {
    setBody(sheet.sheet)
    setBodyErrors([])
    setVitalsDraft(toDraft(sheet))
    setVitalsErrors([])
  }

  /** Scrolls a section into view and moves keyboard focus to its heading. */
  function jump(key: string) {
    if (view === 'tools') {
      // The sheet is hidden behind the tools: show it, then scroll once it is back.
      setView('sheet')
      pendingJump.current = key
      return
    }
    if (key === 'inventory' || key === 'notes') setOpen((current) => ({ ...current, [key]: true }))
    const section = document.getElementById(`sheet-section-${key}-${character.id}`)
    if (!section) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    section.scrollIntoView?.({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
    section.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true })
  }

  const jumpRef = useRef(jump)
  useEffect(() => {
    jumpRef.current = jump
  })
  useEffect(() => {
    const key = pendingJump.current
    if (key && view === 'sheet') {
      pendingJump.current = null
      jumpRef.current(key)
    }
  }, [view])

  const derived = (
    <dl className="sheet-derived">
      <div>
        <dt>Proficiency bonus</dt>
        <dd>{formatModifier(proficiencyBonus(level))}</dd>
      </div>
      <div>
        <dt>Initiative</dt>
        <dd>{formatModifier(initiativeBonus(body))}</dd>
      </div>
      <div>
        <dt>Passive Perception</dt>
        <dd>{passivePerception(body, level)}</dd>
      </div>
    </dl>
  )

  const field = (name: (typeof vitalFields)[number][0], label: string) => (
    <div className="vital-field" key={name}>
      <label htmlFor={`vital-${name}`}>{label}</label>
      <input
        className="journal-input"
        disabled={busy}
        form={vitalsFormId}
        id={`vital-${name}`}
        inputMode="numeric"
        onChange={(event) => {
          setVitalsDraft((current) => ({ ...current, [name]: event.target.value }))
          setVitalsErrors([])
        }}
        placeholder="Not set"
        type="number"
        value={vitalsDraft[name]}
      />
    </div>
  )

  const saveBar = (
    <div className="sheet-savebar" data-dirty={dirty || undefined}>
      {(vitalsErrors.length > 0 || bodyErrors.length > 0) && (
        <ul className="sheet-savebar__errors" role="alert">
          {[...vitalsErrors, ...bodyErrors].map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <div className="sheet-savebar__row">
        <p className="sheet-savebar__status" role="status">
          <span aria-hidden="true" className="sheet-savebar__dot" />
          {savingVitals || savingSheet
            ? 'Saving…'
            : dirty
              ? vitalsDirty && bodyDirty
                ? 'Unsaved stats and sheet changes'
                : vitalsDirty
                  ? 'Unsaved stats'
                  : 'Unsaved sheet changes'
              : 'All changes saved'}
        </p>
        <div className="sheet-savebar__actions">
          <button
            aria-busy={savingVitals || undefined}
            className="journal-button"
            disabled={busy || !vitalsDirty}
            form={vitalsFormId}
            type="submit"
          >
            {savingVitals ? 'Saving stats…' : 'Save stats'}
          </button>
          {!quickHp && (
            <button
              aria-busy={savingSheet || undefined}
              className="journal-button"
              disabled={busy || !bodyDirty}
              onClick={() => void saveBody()}
              type="button"
            >
              {savingSheet ? 'Saving sheet…' : 'Save sheet'}
            </button>
          )}
          <button
            className="journal-button journal-button--ghost"
            disabled={busy || !dirty}
            onClick={discard}
            type="button"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <nav aria-label="Sheet sections" className="sheet-nav">
        <ul>
          {hasBar ? (
            sectionTabs.map(([key, label, icon]) => (
              <li key={key}>
                <button className="sheet-nav__tab" onClick={() => jump(key)} type="button">
                  <PixelIcon name={icon} />
                  {label}
                </button>
              </li>
            ))
          ) : (
            <li>
              <button
                aria-pressed={view === 'sheet'}
                className="sheet-nav__tab"
                onClick={() => setView('sheet')}
                type="button"
              >
                <PixelIcon name="shield" />
                Sheet
              </button>
            </li>
          )}
          <li className="sheet-nav__end">
            <button
              aria-pressed={view === 'tools'}
              className="sheet-nav__tab"
              onClick={() => setView('tools')}
              type="button"
            >
              <PixelIcon name="book" />
              {hasBar ? 'Import and export' : 'Export and history'}
            </button>
          </li>
        </ul>
      </nav>

      <div className="character-sheet" data-read-only={readOnly || undefined}>
        <div className="sheet-spread" hidden={view === 'tools'}>
          <div className="sheet-page">
            <section
              aria-labelledby={`sheet-vitals-${character.id}`}
              className="sheet-section"
              id={`sheet-section-vitals-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-vitals-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="heart" />
                Vitals
              </h3>
              {readOnly ? (
                <dl className="sheet-readout">
                  {quickHp ? (
                    <div className="sheet-quickhp">
                      <dt>Hit points</dt>
                      <dd>
                        <form
                          id={vitalsFormId}
                          onSubmit={(event) => {
                            event.preventDefault()
                            void saveVitals()
                          }}
                        >
                          {(
                            [
                              ['current_hp', 'Current HP'],
                              ['temp_hp', 'Temporary HP'],
                            ] as const
                          ).map(([name, label]) => (
                            <div className="sheet-quickhp__field" key={name}>
                              <label htmlFor={`vital-${name}`}>{label}</label>
                              <input
                                className="journal-input"
                                disabled={busy}
                                id={`vital-${name}`}
                                inputMode="numeric"
                                onChange={(event) => {
                                  setVitalsDraft((current) => ({
                                    ...current,
                                    [name]: event.target.value,
                                  }))
                                  setVitalsErrors([])
                                }}
                                placeholder={name === 'temp_hp' ? '0' : 'Not set'}
                                type="number"
                                value={vitalsDraft[name]}
                              />
                            </div>
                          ))}
                          <span className="sheet-quickhp__max">of {notSet(sheet.max_hp)} max</span>
                        </form>
                        {sheet.max_hp !== null && sheet.max_hp > 0 && sheet.current_hp !== null && (
                          <div aria-hidden="true" className="sheet-quickhp__bar">
                            <span
                              style={{
                                width: `${Math.min(100, Math.max(0, (sheet.current_hp / sheet.max_hp) * 100))}%`,
                              }}
                            />
                          </div>
                        )}
                      </dd>
                    </div>
                  ) : (
                    <div>
                      <dt>Hit points</dt>
                      <dd>
                        {sheet.current_hp === null && sheet.max_hp === null
                          ? 'Not set'
                          : `${notSet(sheet.current_hp)} / ${notSet(sheet.max_hp)}`}
                      </dd>
                    </div>
                  )}
                  {!quickHp && (
                    <div>
                      <dt>Temporary HP</dt>
                      <dd>{sheet.temp_hp}</dd>
                    </div>
                  )}
                  <div className="sheet-readout__key">
                    <dt>Armor class</dt>
                    <dd>{notSet(sheet.armor_class)}</dd>
                  </div>
                  <div className="sheet-readout__key">
                    <dt>Initiative</dt>
                    <dd>
                      {canRoll ? (
                        <RollButton
                          ariaLabel={`Roll initiative, ${formatModifier(initiativeBonus(body))}`}
                          roll={initiativeRoll(body, character.id)}
                        >
                          {formatModifier(initiativeBonus(body))}
                        </RollButton>
                      ) : (
                        formatModifier(initiativeBonus(body))
                      )}
                    </dd>
                  </div>
                  <div className="sheet-readout__key">
                    <dt>Speed</dt>
                    <dd>{notSet(sheet.speed, ' ft.')}</dd>
                  </div>
                  <div className="sheet-readout__minor">
                    <dt>Proficiency bonus</dt>
                    <dd>{formatModifier(proficiencyBonus(level))}</dd>
                  </div>
                  <div className="sheet-readout__minor">
                    <dt>Passive Perception</dt>
                    <dd>{passivePerception(body, level)}</dd>
                  </div>
                </dl>
              ) : (
                <form
                  className="sheet-vitals"
                  id={vitalsFormId}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveVitals()
                  }}
                >
                  <div className="vital vital--hp">
                    <p className="vital__title">
                      <PixelIcon name="heart" />
                      Hit points
                    </p>
                    <div className="vital__fields">
                      {field('current_hp', 'Current HP')}
                      {field('max_hp', 'Maximum HP')}
                      {field('temp_hp', 'Temporary HP')}
                    </div>
                  </div>
                  <div className="vital">
                    <p className="vital__title">
                      <PixelIcon name="shield" />
                      Defense
                    </p>
                    {field('armor_class', 'Armor class')}
                  </div>
                  <div className="vital">
                    <p className="vital__title">
                      <PixelIcon name="boot" />
                      Movement
                    </p>
                    {field('speed', 'Speed')}
                  </div>
                </form>
              )}
              {!readOnly && derived}
            </section>

            <section
              aria-labelledby={`sheet-abilities-${character.id}`}
              className="sheet-section"
              id={`sheet-section-abilities-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-abilities-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="shield" />
                Abilities and saving throws
              </h3>
              <ul className="sheet-abilities">
                {abilityKeys.map((key) => (
                  <AbilityCard
                    body={body}
                    busy={busy}
                    characterId={canRoll ? character.id : null}
                    key={key}
                    level={level}
                    name={key}
                    onScore={(score) =>
                      update((current) => ({
                        ...current,
                        abilities: { ...current.abilities, [key]: score },
                      }))
                    }
                    onSave={(proficient) =>
                      update((current) => ({
                        ...current,
                        saving_throws: abilityKeys.filter((ability) =>
                          ability === key ? proficient : current.saving_throws.includes(ability),
                        ),
                      }))
                    }
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            </section>

            <section
              aria-labelledby={`sheet-skills-${character.id}`}
              className="sheet-section"
              id={`sheet-section-skills-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-skills-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="book" />
                Skills
              </h3>
              <ul className="sheet-skills">
                {skillList.map(({ key, label, ability }) => {
                  const proficiency = body.skills[key]
                  const bonus = formatModifier(skillBonus(body, level, key))
                  return (
                    <li data-proficiency={proficiency ?? 'none'} key={key}>
                      <span className="sheet-skills__name">
                        {label} <small>({abilityLabels[ability].slice(0, 3)})</small>
                      </span>
                      {readOnly ? (
                        <span className="sheet-skills__value">
                          {canRoll ? (
                            <RollButton
                              ariaLabel={`Roll ${label} check, ${bonus}`}
                              roll={skillRoll(body, level, key, character.id)}
                            >
                              {bonus}
                            </RollButton>
                          ) : (
                            <strong>{bonus}</strong>
                          )}
                          {proficiency && <small>{proficiency}</small>}
                        </span>
                      ) : (
                        <span className="sheet-skills__control">
                          <strong>{bonus}</strong>
                          <select
                            aria-label={`${label} proficiency`}
                            className="journal-select"
                            disabled={busy}
                            onChange={(event) =>
                              update((current) => setSkill(current, key, event.target.value))
                            }
                            value={proficiency ?? ''}
                          >
                            <option value="">Untrained</option>
                            <option value="proficient">Proficient</option>
                            <option value="expertise">Expertise</option>
                          </select>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            <section
              aria-labelledby={`sheet-notes-title-${character.id}`}
              className="sheet-section"
              id={`sheet-section-notes-${character.id}`}
            >
              <SectionHead
                bodyId={`sheet-notes-body-${character.id}`}
                icon="quill"
                id={`sheet-notes-title-${character.id}`}
                name="features and notes"
                onToggle={() => setOpen((current) => ({ ...current, notes: !current.notes }))}
                open={open.notes}
                title="Features and notes"
              />
              <div
                className="sheet-section__body"
                hidden={!open.notes}
                id={`sheet-notes-body-${character.id}`}
              >
                {(
                  [
                    ['features', 'Features and traits'],
                    ['notes', 'Notes and backstory'],
                  ] as const
                ).map(([name, label]) =>
                  readOnly ? (
                    <div key={name}>
                      <h4>{label}</h4>
                      <div
                        className="sheet-resizable"
                        style={body[name].length > 1200 ? { height: '18rem' } : undefined}
                        tabIndex={0}
                      >
                        <p className="sheet-text">
                          {body[name] ? (
                            <DiceText
                              characterId={canRoll ? character.id : null}
                              text={body[name]}
                            />
                          ) : (
                            'Nothing recorded.'
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="journal-field" key={name}>
                      <label htmlFor={`sheet-${name}-${character.id}`}>{label}</label>
                      <textarea
                        className="journal-input"
                        disabled={busy}
                        id={`sheet-${name}-${character.id}`}
                        maxLength={limits.text}
                        onChange={(event) =>
                          update((current) => ({ ...current, [name]: event.target.value }))
                        }
                        rows={5}
                        value={body[name]}
                      />
                    </div>
                  ),
                )}
              </div>
            </section>
          </div>

          <div className="sheet-page">
            <section
              aria-labelledby={`sheet-attacks-${character.id}`}
              className="sheet-section"
              id={`sheet-section-attacks-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-attacks-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="sword" />
                Attacks
              </h3>
              {readOnly ? (
                body.attacks.length === 0 ? (
                  <p className="sheet-empty">No attacks recorded.</p>
                ) : (
                  <ul className="sheet-attacks">
                    {body.attacks.map((attack) => (
                      <li key={attack.id}>
                        <strong className="sheet-attacks__name">
                          {attack.name || 'Unnamed attack'}
                        </strong>
                        {attack.bonus && (
                          <span className="sheet-attacks__bonus">
                            <small>To hit</small>
                            {canRoll && attackHitRoll(attack, character.id) ? (
                              <RollButton
                                ariaLabel={`Roll ${attack.name || 'attack'} to hit, ${attack.bonus}`}
                                roll={attackHitRoll(attack, character.id)!}
                              >
                                {attack.bonus}
                              </RollButton>
                            ) : (
                              attack.bonus
                            )}
                          </span>
                        )}
                        {attack.damage && (
                          <span className="sheet-attacks__damage">
                            <small>Damage</small>
                            {canRoll && attackDamageRoll(attack, character.id) ? (
                              <RollButton
                                ariaLabel={`Roll ${attack.name || 'attack'} damage, ${attack.damage}`}
                                roll={attackDamageRoll(attack, character.id)!}
                              >
                                {attack.damage}
                              </RollButton>
                            ) : (
                              attack.damage
                            )}
                          </span>
                        )}
                        {attack.notes && (
                          <small className="sheet-attacks__notes">
                            <DiceText
                              characterId={canRoll ? character.id : null}
                              context={attack.name || undefined}
                              text={attack.notes}
                            />
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <>
                  {body.attacks.length === 0 && <p className="sheet-empty">No attacks recorded.</p>}
                  <ul className="sheet-attacks">
                    {body.attacks.map((attack, index) => (
                      <li key={attack.id}>
                        <AttackFields
                          attack={attack}
                          busy={busy}
                          index={index}
                          onChange={(next) =>
                            update((current) => ({
                              ...current,
                              attacks: current.attacks.map((existing, at) =>
                                at === index ? next : existing,
                              ),
                            }))
                          }
                          onRemove={() =>
                            update((current) => ({
                              ...current,
                              attacks: current.attacks.filter((_, at) => at !== index),
                            }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <button
                    className="journal-button journal-button--secondary"
                    disabled={busy || body.attacks.length >= limits.attacks}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        attacks: [
                          ...current.attacks,
                          { id: crypto.randomUUID(), name: '', bonus: '', damage: '', notes: '' },
                        ],
                      }))
                    }
                    type="button"
                  >
                    Add attack
                  </button>
                </>
              )}
            </section>

            <section
              aria-labelledby={`sheet-spells-title-${character.id}`}
              className="sheet-section"
              id={`sheet-section-spells-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-spells-title-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="flame" />
                Spells
              </h3>
              {readOnly ? (
                <SpellList characterId={canRoll ? character.id : null} text={body.spells} />
              ) : (
                <div className="journal-field">
                  <label className="visually-hidden" htmlFor={`sheet-spells-${character.id}`}>
                    Spells
                  </label>
                  <textarea
                    className="journal-input"
                    disabled={busy}
                    id={`sheet-spells-${character.id}`}
                    maxLength={limits.text}
                    onChange={(event) =>
                      update((current) => ({ ...current, spells: event.target.value }))
                    }
                    placeholder={
                      'Cantrips: Light, Mage Hand\n1st level (3 slots): Shield, Magic Missile'
                    }
                    rows={6}
                    value={body.spells}
                    aria-describedby={`sheet-spells-hint-${character.id}`}
                  />
                  <p className="sheet-hint" id={`sheet-spells-hint-${character.id}`}>
                    Write one group per line, like “1st level (3 slots): Shield, Magic Missile”. The
                    sheet shows it as a spell book.
                  </p>
                  {body.spells.trim() !== '' && (
                    <details className="spell-preview">
                      <summary>Preview</summary>
                      <SpellList text={body.spells} />
                    </details>
                  )}
                </div>
              )}
            </section>

            <section aria-labelledby={`sheet-standing-${character.id}`} className="sheet-section">
              <h3 className="journal-section-title" id={`sheet-standing-${character.id}`}>
                <PixelIcon name="star" />
                Alignment and experience
              </h3>
              {readOnly ? (
                <dl className="sheet-derived">
                  <div>
                    <dt>Alignment</dt>
                    <dd>{body.alignment || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt>Experience</dt>
                    <dd>{notSet(body.experience)}</dd>
                  </div>
                </dl>
              ) : (
                <div className="sheet-pair">
                  <div className="journal-field">
                    <label htmlFor={`sheet-alignment-${character.id}`}>Alignment</label>
                    <input
                      className="journal-input"
                      disabled={busy}
                      id={`sheet-alignment-${character.id}`}
                      maxLength={limits.alignment}
                      onChange={(event) =>
                        update((current) => ({ ...current, alignment: event.target.value }))
                      }
                      value={body.alignment}
                    />
                  </div>
                  <div className="journal-field">
                    <label htmlFor={`sheet-experience-${character.id}`}>Experience points</label>
                    <input
                      className="journal-input"
                      disabled={busy}
                      id={`sheet-experience-${character.id}`}
                      inputMode="numeric"
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          experience:
                            event.target.value.trim() === '' ? null : Number(event.target.value),
                        }))
                      }
                      placeholder="Not set"
                      type="number"
                      value={body.experience ?? ''}
                    />
                  </div>
                </div>
              )}
            </section>

            <section
              aria-labelledby={`sheet-coins-${character.id}`}
              className="sheet-section"
              id={`sheet-section-coins-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-coins-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="coin" />
                Coins
              </h3>
              <CharacterCoins
                actions={owned ? actions : undefined}
                characterId={character.id}
                onNotice={onNotice}
                purse={{ cp: sheet.cp, sp: sheet.sp, gp: sheet.gp }}
                userId={userId}
              />
            </section>

            <section
              aria-labelledby={`sheet-inventory-${character.id}`}
              className="sheet-section"
              id={`sheet-section-inventory-${character.id}`}
            >
              <SectionHead
                bodyId={`sheet-inventory-body-${character.id}`}
                icon="pack"
                id={`sheet-inventory-${character.id}`}
                name="inventory"
                onToggle={() =>
                  setOpen((current) => ({ ...current, inventory: !current.inventory }))
                }
                open={open.inventory}
                title="Inventory"
              />
              <div
                className="sheet-section__body"
                hidden={!open.inventory}
                id={`sheet-inventory-body-${character.id}`}
              >
                <CharacterInventory
                  actions={owned ? actions : undefined}
                  capacity={carryingCapacity(body)}
                  characterId={character.id}
                  characterName={character.name}
                  onFormDirtyChange={setItemFormDirty}
                  onNotice={onNotice}
                  userId={userId}
                />
              </div>
            </section>
          </div>
        </div>
        {view === 'tools' && (
          <div className="sheet-tools">
            <section
              aria-labelledby={`sheet-export-title-${character.id}`}
              className="sheet-section"
              id={`sheet-section-export-${character.id}`}
            >
              <h3
                className="journal-section-title"
                id={`sheet-export-title-${character.id}`}
                tabIndex={-1}
              >
                <PixelIcon name="book" />
                Export and history
              </h3>
              {owned && (
                <CharacterImportUpdates
                  character={character}
                  onNotice={onNotice}
                  sheet={sheet}
                  unsaved={unsaved}
                  userId={userId}
                />
              )}
              <CharacterExport
                character={character}
                onNotice={onNotice}
                sheet={sheet}
                unsaved={unsaved}
                userId={userId}
              />
              <CharacterImportHistory characterId={character.id} userId={userId} />
            </section>
          </div>
        )}
        {hasBar && !dock && saveBar}
      </div>
      {hasBar && dock && createPortal(saveBar, dock)}
    </>
  )
}

/** A section heading with a button that folds the section's body away. */
function SectionHead({
  bodyId,
  icon,
  id,
  name,
  onToggle,
  open,
  title,
}: {
  bodyId: string
  icon: PixelIconName
  id: string
  name: string
  onToggle: () => void
  open: boolean
  title: string
}) {
  return (
    <div className="sheet-section__head">
      <h3 className="journal-section-title" id={id} tabIndex={-1}>
        <PixelIcon name={icon} />
        {title}
      </h3>
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className="journal-button journal-button--ghost sheet-collapse"
        onClick={onToggle}
        type="button"
      >
        {open ? 'Collapse ' : 'Expand '}
        <span className="sheet-collapse__name">{name}</span>
      </button>
    </div>
  )
}

function setSkill(body: CharacterSheetBody, key: SkillKey, value: string): CharacterSheetBody {
  const skills = { ...body.skills }
  if (value === 'proficient' || value === 'expertise') skills[key] = value as SkillProficiency
  else delete skills[key]
  return { ...body, skills }
}

function AbilityCard({
  body,
  busy,
  characterId,
  level,
  name,
  onSave,
  onScore,
  readOnly,
}: {
  body: CharacterSheetBody
  busy: boolean
  /** Set on your own sheet in display view: the modifier and the save then roll for this character. */
  characterId: string | null
  level: number
  name: AbilityKey
  onSave: (proficient: boolean) => void
  onScore: (score: number) => void
  readOnly: boolean
}): ReactNode {
  const label = abilityLabels[name]
  const score = body.abilities[name]
  const proficient = body.saving_throws.includes(name)
  return (
    <li className="ability" data-save-proficient={proficient || undefined}>
      <h4>{label}</h4>
      <p className="ability__modifier">
        <span className="visually-hidden">Modifier </span>
        {characterId ? (
          <RollButton
            ariaLabel={`Roll ${label} check, ${formatModifier(abilityModifier(score))}`}
            roll={abilityCheckRoll(body, name, characterId)}
          >
            {formatModifier(abilityModifier(score))}
          </RollButton>
        ) : (
          <strong>{formatModifier(abilityModifier(score))}</strong>
        )}
      </p>
      {readOnly ? (
        <p className="ability__score">{score}</p>
      ) : (
        <input
          aria-label={`${label} score`}
          className="journal-input ability__input"
          disabled={busy}
          inputMode="numeric"
          max={limits.abilityMax}
          min={limits.abilityMin}
          onChange={(event) => onScore(Number(event.target.value))}
          type="number"
          value={score}
        />
      )}
      <div className="ability__save">
        <p>
          Save{' '}
          {characterId ? (
            <RollButton
              ariaLabel={`Roll ${label} save, ${formatModifier(savingThrowBonus(body, level, name))}`}
              roll={savingThrowRoll(body, level, name, characterId)}
            >
              {formatModifier(savingThrowBonus(body, level, name))}
            </RollButton>
          ) : (
            <strong>{formatModifier(savingThrowBonus(body, level, name))}</strong>
          )}
          {readOnly && proficient ? ' · proficient' : ''}
        </p>
        {!readOnly && (
          <label className="journal-check">
            <input
              aria-label={`${label} saving throw proficiency`}
              checked={proficient}
              disabled={busy}
              onChange={(event) => onSave(event.target.checked)}
              type="checkbox"
            />
            <span aria-hidden="true">Proficient</span>
          </label>
        )}
      </div>
    </li>
  )
}

function AttackFields({
  attack,
  busy,
  index,
  onChange,
  onRemove,
}: {
  attack: CharacterAttack
  busy: boolean
  index: number
  onChange: (attack: CharacterAttack) => void
  onRemove: () => void
}) {
  const position = index + 1
  const fields = [
    ['name', 'name', limits.attackName],
    ['bonus', 'bonus', limits.attackBonus],
    ['damage', 'damage', limits.attackDamage],
    ['notes', 'notes', limits.attackNotes],
  ] as const
  return (
    <div className="sheet-attack-row">
      {fields.map(([field, label, max]) => (
        <input
          aria-label={`Attack ${position} ${label}`}
          className="journal-input"
          data-field={field}
          disabled={busy}
          key={field}
          maxLength={max}
          onChange={(event) => onChange({ ...attack, [field]: event.target.value })}
          placeholder={label[0].toUpperCase() + label.slice(1)}
          value={attack[field]}
        />
      ))}
      <button
        aria-label={`Remove attack ${position}`}
        className="journal-button journal-button--danger"
        disabled={busy}
        onClick={onRemove}
        type="button"
      >
        Remove
      </button>
    </div>
  )
}
