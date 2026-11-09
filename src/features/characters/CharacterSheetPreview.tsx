import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Campaign } from '../campaigns/model';
import { useUnsavedChanges } from '../../shared/ui/useUnsavedChanges';
import { abilityModifier } from './characterService';
import {
  abilityNames,
  type AbilityName,
  type Character,
  type CharacterSpell,
  type CombatStats,
  type SheetTab,
} from './model';
import type { CharacterExportFormat } from './characterExport';
import CharacterFeatures from './CharacterFeatures';
import CharacterInventory, { type InventoryView } from './CharacterInventory';
import { withInventoryQuantity } from './inventoryQuantity';
import CharacterPortraitCropDialog from './CharacterPortraitCropDialog';
import CharacterUpdateImportReview from './CharacterUpdateImportReview';
import { portraitFileError } from './characterPortrait';

import CharacterSheetTabs from './CharacterSheetTabs';
import { normalizeSheetTabOrder } from './sheetTabOrder';

const abilityLabels: Record<AbilityName, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function spellLevelLabel(level: number): string {
  return level === 0 ? 'Cantrips' : `Level ${level}`;
}

function NumberEdit({
  label,
  value,
  onChange,
  className = '',
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
}) {
  const [input, setInput] = useState(String(value));

  useEffect(() => setInput(String(value)), [value]);

  return (
    <input
      aria-label={label}
      className={`field-input field-input-number ${className}`}
      type="number"
      min={min}
      max={max}
      step="1"
      value={input}
      onChange={(event) => {
        const next = event.target.value;
        setInput(next);
        if (next.trim() !== '' && Number.isFinite(Number(next)))
          onChange(Number(next));
      }}
      onBlur={() => setInput(String(value))}
    />
  );
}

export default function CharacterSheetPreview({
  campaign,
  character: initial,
  creating = false,
  onSave,
  onDelete,
  readOnly = false,
  ownerName,
  error,
  feedback,
  importSource,
  onCancel,
  onExport,
}: {
  campaign: Campaign;
  character: Character;
  creating?: boolean;
  onSave?: (character: Character) => boolean;
  onDelete?: (character: Character) => void;
  readOnly?: boolean;
  ownerName?: string;
  error: string | null;
  feedback: string | null;
  importSource?: string;
  onCancel?: () => void;
  onExport?: (character: Character, format: CharacterExportFormat) => void;
}) {
  const [saved, setSaved] = useState<Character>(initial);
  const [draft, setDraft] = useState<Character>(initial);
  const [editing, setEditing] = useState(creating);
  const [quickHp, setQuickHp] = useState(String(initial.combat.currentHp));
  const [quickTemp, setQuickTemp] = useState(
    String(initial.combat.temporaryHp),
  );
  const [quickError, setQuickError] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [updateImportOpen, setUpdateImportOpen] = useState(false);
  const updateImportTrigger = useRef<HTMLButtonElement>(null);
  const updateImportWasOpen = useRef(false);
  const portraitInput = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SheetTab>('overview');
  const [inventoryView, setInventoryView] = useState<InventoryView>({
    height: 360,
    showAll: false,
  });
  const character = editing ? draft : saved;
  const inventoryCharacter = useRef(character);
  inventoryCharacter.current = character;
  const dirty =
    editing &&
    (Boolean(importSource) || JSON.stringify(draft) !== JSON.stringify(saved));
  const allowNavigation = useUnsavedChanges(
    dirty,
    'Discard unsaved character changes?',
  );

  useEffect(() => {
    if (updateImportWasOpen.current && !updateImportOpen)
      updateImportTrigger.current?.focus();
    updateImportWasOpen.current = updateImportOpen;
  }, [updateImportOpen]);

  useEffect(() => {
    setSaved(initial);
    if (!editing) {
      setDraft(initial);
      setQuickHp(String(initial.combat.currentHp));
      setQuickTemp(String(initial.combat.temporaryHp));
    }
  }, [initial]);

  function updateField(key: keyof Character, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePortrait(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const fileError = portraitFileError(file);
    if (fileError) {
      setPortraitError(fileError);
      return;
    }
    setPortraitError(null);
    setPortraitFile(file);
  }

  function updateCombat(key: keyof CombatStats, value: number) {
    setDraft((current) => ({
      ...current,
      combat: { ...current.combat, [key]: value },
    }));
  }

  function updateAbility(
    ability: AbilityName,
    key: 'score' | 'modifier',
    value: number,
  ) {
    setDraft((current) => ({
      ...current,
      abilityScores: {
        ...current.abilityScores,
        [ability]: {
          ...current.abilityScores[ability],
          [key]: value,
          ...(key === 'score' ? { modifier: abilityModifier(value) } : {}),
        },
      },
    }));
  }

  function updateSpell(id: string, changes: Partial<CharacterSpell>) {
    setDraft((current) => ({
      ...current,
      spells: current.spells.map((spell) =>
        spell.id === id ? { ...spell, ...changes } : spell,
      ),
    }));
  }

  function startEdit() {
    setDraft(structuredClone(saved));
    setQuickError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (creating) {
      allowNavigation.current = true;
      onCancel?.();
      return;
    }
    setDraft(structuredClone(saved));
    setEditing(false);
  }

  function savePreview() {
    allowNavigation.current = true;
    if (!onSave || !onSave(draft)) {
      allowNavigation.current = false;
      return;
    }
    setSaved(structuredClone(draft));
    setEditing(false);
    if (!creating) allowNavigation.current = false;
  }

  function saveImportedUpdates(updated: Character): boolean {
    if (!onSave || !onSave(updated)) return false;
    setSaved(structuredClone(updated));
    setDraft(structuredClone(updated));
    setQuickHp(String(updated.combat.currentHp));
    setQuickTemp(String(updated.combat.temporaryHp));
    setQuickError(null);
    setUpdateImportOpen(false);
    return true;
  }

  function saveQuick(key: 'currentHp' | 'temporaryHp', raw: string) {
    if (!onSave) return;
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(value) || value < 0) {
      setQuickError('Enter a nonnegative whole number for hit points.');
      if (key === 'currentHp') setQuickHp(String(saved.combat.currentHp));
      else setQuickTemp(String(saved.combat.temporaryHp));
      return;
    }
    const next = { ...saved, combat: { ...saved.combat, [key]: value } };
    if (onSave(next)) {
      setSaved(next);
      setDraft(next);
      setQuickError(null);
    } else {
      if (key === 'currentHp') setQuickHp(String(saved.combat.currentHp));
      else setQuickTemp(String(saved.combat.temporaryHp));
    }
  }

  function commitInventoryQuantity(id: string, raw: string): boolean {
    if (readOnly || updateImportOpen || (!editing && !onSave)) return false;
    try {
      const next = withInventoryQuantity(inventoryCharacter.current, id, raw);
      if (next === inventoryCharacter.current) return true;
      if (!editing && !onSave?.(next)) return false;
      inventoryCharacter.current = next;
      setDraft(next);
      if (!editing) setSaved(next);
      return true;
    } catch {
      return false;
    }
  }

  const spellGroups = [...character.spells]
    .sort(
      (left, right) =>
        left.level - right.level || left.name.localeCompare(right.name),
    )
    .reduce<Map<number, CharacterSpell[]>>((groups, spell) => {
      const level = groups.get(spell.level) ?? [];
      level.push(spell);
      groups.set(spell.level, level);
      return groups;
    }, new Map());

  return (
    <article
      className="sheet"
      aria-label={`${character.name || 'New character'} sheet`}
    >
      {importSource && (
        <div className="import-source" role="status">
          <strong>Reviewing {importSource}</strong>
          <span>
            Nothing has been added to {campaign.name} yet. Check each section,
            then import the character.
          </span>
        </div>
      )}
      <header className="sheet-header">
        <div className="sheet-header-copy">
          <p className="sheet-context">
            <a href={`#/campaign/${campaign.id}`}>{campaign.name}</a> /
            Character sheet
          </p>
          {editing ? (
            <label className="edit-heading-label">
              Character name
              <input
                className="field-input edit-heading"
                value={character.name}
                autoFocus={creating}
                onChange={(event) => updateField('name', event.target.value)}
              />
            </label>
          ) : (
            <h2 className="sheet-title">{character.name}</h2>
          )}
          <p className="character-line">
            <label className="level-control">
              Level
              {editing ? (
                <NumberEdit
                  label="Level"
                  value={character.level}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, level: value }))
                  }
                  className="level-input"
                />
              ) : (
                <span className="level-value">{character.level}</span>
              )}
            </label>{' '}
            {character.className}
            {character.subclass ? `, ${character.subclass}` : ''} /{' '}
            {character.species}
          </p>
          {ownerName && (
            <p
              className={`sheet-owner-status${readOnly ? ' is-read-only' : ''}`}
            >
              {readOnly
                ? `Read-only for you. Owned by ${ownerName}.`
                : 'Your character'}
            </p>
          )}
          {editing ? (
            <textarea
              aria-label="Character description"
              className="field-input field-textarea character-description-editor"
              rows={3}
              value={character.description ?? ''}
              onChange={(event) =>
                updateField('description', event.target.value)
              }
            />
          ) : (
            <p className="character-description">{character.description}</p>
          )}
        </div>
        <div className="sheet-portrait-column">
          {character.portraitDataUrl ? (
            <img
              className="sheet-portrait"
              src={character.portraitDataUrl}
              alt={`${character.name || 'Character'} portrait`}
            />
          ) : (
            <span className="sheet-portrait-fallback" aria-hidden="true">
              {character.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
          )}
          {editing && (
            <div className="portrait-controls">
              <input
                ref={portraitInput}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload character portrait"
                onChange={updatePortrait}
              />
              <button
                type="button"
                className="button button-quiet"
                onClick={() => portraitInput.current?.click()}
              >
                {character.portraitDataUrl
                  ? 'Replace portrait'
                  : 'Add portrait'}
              </button>
              {character.portraitDataUrl && (
                <button
                  type="button"
                  className="portrait-remove"
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      portraitDataUrl: undefined,
                    }));
                    setPortraitError(null);
                  }}
                >
                  Remove portrait
                </button>
              )}
              {portraitError && (
                <span className="form-error" role="alert">
                  {portraitError}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="sheet-header-actions">
          {!editing && (
            <div className="sheet-secondary-actions">
              {onExport && (
                <>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => onExport(saved, 'json')}
                  >
                    Export JSON
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => onExport(saved, 'markdown')}
                  >
                    Export Markdown
                  </button>
                </>
              )}
              {!creating && !readOnly && onSave && (
                <button
                  ref={updateImportTrigger}
                  className="button button-quiet"
                  type="button"
                  aria-expanded={updateImportOpen}
                  aria-controls={
                    updateImportOpen ? 'character-update-import' : undefined
                  }
                  onClick={() => setUpdateImportOpen((open) => !open)}
                >
                  Import updates
                </button>
              )}
              {onDelete && !updateImportOpen && (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => onDelete(saved)}
                >
                  Delete character
                </button>
              )}
            </div>
          )}
          {editing ? (
            <div className="edit-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={cancelEdit}
              >
                {importSource ? 'Cancel import' : 'Cancel'}
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={savePreview}
              >
                {importSource
                  ? 'Import character'
                  : creating
                    ? 'Create character'
                    : 'Save changes'}
              </button>
            </div>
          ) : readOnly || updateImportOpen ? null : (
            <button
              type="button"
              className="button button-primary"
              onClick={startEdit}
            >
              Edit sheet
            </button>
          )}
        </div>
      </header>

      {updateImportOpen && !readOnly && onSave && (
        <CharacterUpdateImportReview
          character={saved}
          error={error}
          onApply={saveImportedUpdates}
          onCancel={() => setUpdateImportOpen(false)}
        />
      )}

      <div
        className={`sheet-status${error || quickError ? ' is-error' : ''}`}
        role={error || quickError ? 'alert' : 'status'}
      >
        {error ||
          quickError ||
          feedback ||
          (readOnly
            ? `Only ${ownerName ?? 'the owner'} can change this character.`
            : null) ||
          (editing
            ? importSource
              ? 'Imported values remain editable until you add this character.'
              : creating
                ? 'This character is a draft. Choose Create character to save it.'
                : 'Changes are saved when you select Save changes.'
            : 'Saved in this browser.')}
      </div>

      {portraitFile && (
        <CharacterPortraitCropDialog
          file={portraitFile}
          onCancel={() => setPortraitFile(null)}
          onSave={(portraitDataUrl) => {
            setDraft((current) => ({ ...current, portraitDataUrl }));
            setPortraitError(null);
            setPortraitFile(null);
          }}
        />
      )}

      <div className="combat-band" aria-label="Combat information">
        <div className="hp-block">
          <span className="stat-label">Hit points</span>
          <div className="hp-values">
            {editing ? (
              <>
                <label className="hp-edit-field">
                  <span>Current</span>
                  <NumberEdit
                    label="Current hit points"
                    value={character.combat.currentHp}
                    onChange={(value) => updateCombat('currentHp', value)}
                    className="hp-input"
                  />
                </label>
                <span className="hp-divider">/</span>
                <label className="hp-edit-field">
                  <span>Maximum</span>
                  <NumberEdit
                    label="Maximum hit points"
                    value={character.combat.maximumHp}
                    onChange={(value) => updateCombat('maximumHp', value)}
                    className="hp-input"
                  />
                </label>
              </>
            ) : readOnly ? (
              <>
                <strong>{character.combat.currentHp}</strong>
                <span className="hp-divider">/</span>
                <span>{character.combat.maximumHp}</span>
              </>
            ) : (
              <>
                <input
                  className="field-input field-input-number hp-input"
                  type="number"
                  min="0"
                  disabled={updateImportOpen}
                  aria-label="Current hit points"
                  value={quickHp}
                  onChange={(e) => setQuickHp(e.target.value)}
                  onBlur={() => saveQuick('currentHp', quickHp)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <span className="hp-divider">/</span>
                <span>{character.combat.maximumHp}</span>
              </>
            )}
          </div>
          <div className="hp-track" aria-hidden="true">
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (character.combat.currentHp / Math.max(1, character.combat.maximumHp)) * 100))}%`,
              }}
            />
          </div>
          <span className="stat-subline">
            Temporary HP:{' '}
            {editing ? (
              <NumberEdit
                label="Temporary hit points"
                value={character.combat.temporaryHp}
                onChange={(value) => updateCombat('temporaryHp', value)}
                className="inline-number"
              />
            ) : readOnly ? (
              <strong>{character.combat.temporaryHp}</strong>
            ) : (
              <input
                className="field-input field-input-number inline-number"
                type="number"
                min="0"
                disabled={updateImportOpen}
                aria-label="Temporary hit points"
                value={quickTemp}
                onChange={(e) => setQuickTemp(e.target.value)}
                onBlur={() => saveQuick('temporaryHp', quickTemp)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            )}
          </span>
        </div>
        {(
          [
            ['armorClass', 'Armor class'],
            ['initiativeModifier', 'Initiative'],
            ['speed', 'Speed'],
            ['proficiencyBonus', 'Proficiency'],
          ] as const
        ).map(([key, label]) => (
          <div className="combat-stat" key={key}>
            <span className="stat-label">{label}</span>
            {editing ? (
              <NumberEdit
                label={label}
                value={character.combat[key]}
                onChange={(value) => updateCombat(key, value)}
              />
            ) : (
              <strong>
                {key === 'initiativeModifier' || key === 'proficiencyBonus'
                  ? signed(character.combat[key])
                  : character.combat[key]}
              </strong>
            )}
            {key === 'speed' && <span className="stat-subline">feet</span>}
          </div>
        ))}
      </div>

      <CharacterSheetTabs
        order={normalizeSheetTabOrder(character.sheetTabOrder)}
        activeTab={activeTab}
        onSelect={setActiveTab}
        editable={editing && !readOnly && !updateImportOpen}
        onReorder={(sheetTabOrder) =>
          setDraft((current) => ({ ...current, sheetTabOrder }))
        }
      />

      <div
        id="sheet-panel"
        className="sheet-panel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'overview' && (
          <div className="sheet-panel-grid sheet-overview-grid">
            <section
              className="sheet-section"
              aria-labelledby="abilities-heading"
            >
              <div className="section-heading">
                <h2 id="abilities-heading">Ability scores</h2>
                <p>Scores and modifiers</p>
              </div>
              <div className="ability-grid">
                {abilityNames.map((ability) => (
                  <div className="ability-cell" key={ability}>
                    <span className="ability-name">
                      {abilityLabels[ability]}
                    </span>
                    {editing ? (
                      <div className="ability-edit">
                        <label>
                          <span>Score</span>
                          <NumberEdit
                            label={`${abilityLabels[ability]} score`}
                            value={character.abilityScores[ability].score}
                            onChange={(value) =>
                              updateAbility(ability, 'score', value)
                            }
                          />
                        </label>
                        <label>
                          <span>Mod</span>
                          <NumberEdit
                            label={`${abilityLabels[ability]} modifier`}
                            value={character.abilityScores[ability].modifier}
                            onChange={(value) =>
                              updateAbility(ability, 'modifier', value)
                            }
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <strong>
                          {signed(character.abilityScores[ability].modifier)}
                        </strong>
                        <span className="ability-score">
                          Score {character.abilityScores[ability].score}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section
              className="sheet-section"
              aria-labelledby="attacks-heading"
            >
              <div className="section-heading">
                <h2 id="attacks-heading">Attacks</h2>
                <p>Bonuses remain manually adjustable</p>
              </div>
              <div className="ledger-list">
                {character.attacks.map((attack, index) => (
                  <div className="ledger-row attack-row" key={attack.id}>
                    <div>
                      {editing ? (
                        <>
                          <input
                            className="field-input"
                            aria-label="Attack name"
                            value={attack.name}
                            onChange={(e) =>
                              setDraft((c) => ({
                                ...c,
                                attacks: c.attacks.map((a) =>
                                  a.id === attack.id
                                    ? { ...a, name: e.target.value }
                                    : a,
                                ),
                              }))
                            }
                          />
                          <input
                            className="field-input"
                            aria-label="Damage expression"
                            value={attack.damageExpression}
                            onChange={(e) =>
                              setDraft((c) => ({
                                ...c,
                                attacks: c.attacks.map((a) =>
                                  a.id === attack.id
                                    ? { ...a, damageExpression: e.target.value }
                                    : a,
                                ),
                              }))
                            }
                          />
                        </>
                      ) : (
                        <>
                          <strong>{attack.name}</strong>
                          <span>{attack.damageExpression}</span>
                        </>
                      )}
                    </div>
                    {editing ? (
                      <NumberEdit
                        label={`${attack.name} attack bonus`}
                        value={attack.attackBonus}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            attacks: current.attacks.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, attackBonus: value }
                                : item,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <span className="row-value">
                        {signed(attack.attackBonus)} to hit
                      </span>
                    )}
                    {editing && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() =>
                          setDraft((c) => ({
                            ...c,
                            attacks: c.attacks.filter(
                              (a) => a.id !== attack.id,
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editing && (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() =>
                    setDraft((c) => ({
                      ...c,
                      attacks: [
                        ...c.attacks,
                        {
                          id: crypto.randomUUID(),
                          name: '',
                          attackBonus: 0,
                          damageExpression: '',
                        },
                      ],
                    }))
                  }
                >
                  Add attack
                </button>
              )}
            </section>
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="sheet-panel-grid">
            <section className="sheet-section" aria-labelledby="skills-heading">
              <div className="section-heading">
                <h2 id="skills-heading">Skills</h2>
                <p>Filled mark means proficient</p>
              </div>
              <div className="ledger-list">
                {character.skills.map((skill, index) => (
                  <div className="ledger-row proficiency-row" key={index}>
                    <label className="proficiency-name">
                      <input
                        type="checkbox"
                        checked={skill.proficient}
                        disabled={!editing}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            skills: current.skills.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, proficient: event.target.checked }
                                : item,
                            ),
                          }))
                        }
                      />
                      {editing ? (
                        <input
                          className="field-input"
                          aria-label="Skill name"
                          value={skill.name}
                          onChange={(e) =>
                            setDraft((c) => ({
                              ...c,
                              skills: c.skills.map((s, i) =>
                                i === index
                                  ? { ...s, name: e.target.value }
                                  : s,
                              ),
                            }))
                          }
                        />
                      ) : (
                        skill.name
                      )}
                    </label>
                    {editing ? (
                      <NumberEdit
                        label={`${skill.name} modifier`}
                        value={skill.modifier}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            skills: current.skills.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, modifier: value }
                                : item,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <span className="row-value">
                        {signed(skill.modifier)}
                      </span>
                    )}
                    {editing && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() =>
                          setDraft((c) => ({
                            ...c,
                            skills: c.skills.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editing && (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() =>
                    setDraft((c) => ({
                      ...c,
                      skills: [
                        ...c.skills,
                        { name: '', modifier: 0, proficient: false },
                      ],
                    }))
                  }
                >
                  Add skill
                </button>
              )}
            </section>
            <section className="sheet-section" aria-labelledby="saves-heading">
              <div className="section-heading">
                <h2 id="saves-heading">Saving throws</h2>
                <p>Entered values, not rules automation</p>
              </div>
              <div className="ledger-list">
                {character.savingThrows.map((save, index) => (
                  <div
                    className="ledger-row proficiency-row"
                    key={save.ability}
                  >
                    <label className="proficiency-name">
                      <input
                        type="checkbox"
                        checked={save.proficient}
                        disabled={!editing}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            savingThrows: current.savingThrows.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      proficient: event.target.checked,
                                    }
                                  : item,
                            ),
                          }))
                        }
                      />
                      {abilityLabels[save.ability]}
                    </label>
                    {editing ? (
                      <NumberEdit
                        label={`${abilityLabels[save.ability]} saving throw modifier`}
                        value={save.modifier}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            savingThrows: current.savingThrows.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, modifier: value }
                                  : item,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <span className="row-value">{signed(save.modifier)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="sheet-panel-grid">
            <section
              className="sheet-section sheet-section-wide gear-section"
              aria-labelledby="inventory-heading"
            >
              <div className="section-heading">
                <h2 id="inventory-heading">Inventory</h2>
                <p>Gear carried into the next session</p>
              </div>
              <div className="gear-layout">
                <CharacterInventory
                  items={character.inventory}
                  editing={editing}
                  readOnly={readOnly}
                  disabled={updateImportOpen || (!editing && !onSave)}
                  view={inventoryView}
                  onViewChange={setInventoryView}
                  onChange={(inventory) =>
                    setDraft((current) => ({ ...current, inventory }))
                  }
                  onQuantityCommit={commitInventoryQuantity}
                />
                <div
                  className="gear-currency"
                  aria-labelledby="currency-heading"
                >
                  <h3 className="subheading" id="currency-heading">
                    Currency
                  </h3>
                  <div className="currency-row">
                    {Object.entries(character.currency).map(
                      ([denomination, amount]) => (
                        <div key={denomination}>
                          <span>{denomination}</span>
                          {editing ? (
                            <NumberEdit
                              label={`${denomination} balance`}
                              value={amount}
                              onChange={(value) =>
                                setDraft((current) => ({
                                  ...current,
                                  currency: {
                                    ...current.currency,
                                    [denomination]: value,
                                  },
                                }))
                              }
                            />
                          ) : (
                            <strong>{amount}</strong>
                          )}
                          {editing && (
                            <button
                              type="button"
                              aria-label={`Remove ${denomination}`}
                              onClick={() =>
                                setDraft((c) => {
                                  const currency = { ...c.currency };
                                  delete currency[denomination];
                                  return { ...c, currency };
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                  {editing && (
                    <button
                      type="button"
                      className="button button-quiet gear-action"
                      onClick={() => {
                        const name = window
                          .prompt('Currency name (for example, pp)')
                          ?.trim();
                        if (name)
                          setDraft((c) => ({
                            ...c,
                            currency: {
                              ...c.currency,
                              [name]: c.currency[name] ?? 0,
                            },
                          }));
                      }}
                    >
                      Add currency
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="sheet-panel-grid">
            <CharacterFeatures
              characterId={character.id}
              features={character.features}
              editing={editing}
              onChange={(features) =>
                setDraft((current) => ({ ...current, features }))
              }
            />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="sheet-panel-grid">
            <section
              className="sheet-section sheet-section-wide"
              aria-labelledby="background-heading"
            >
              <div className="section-heading">
                <h2 id="background-heading">Character details</h2>
                <p>Identity and background</p>
              </div>
              {editing ? (
                <div className="identity-fields">
                  <label>
                    Player name
                    <input
                      className="field-input"
                      value={character.playerName ?? ''}
                      onChange={(e) =>
                        updateField('playerName', e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Species
                    <input
                      className="field-input"
                      value={character.species}
                      onChange={(e) => updateField('species', e.target.value)}
                    />
                  </label>
                  <label>
                    Class
                    <input
                      className="field-input"
                      value={character.className}
                      onChange={(e) => updateField('className', e.target.value)}
                    />
                  </label>
                  <label>
                    Subclass
                    <input
                      className="field-input"
                      value={character.subclass ?? ''}
                      onChange={(e) => updateField('subclass', e.target.value)}
                    />
                  </label>
                  <label>
                    Background
                    <input
                      className="field-input"
                      value={character.background ?? ''}
                      onChange={(e) =>
                        updateField('background', e.target.value)
                      }
                    />
                  </label>
                </div>
              ) : (
                <dl className="detail-list">
                  <div>
                    <dt>Player</dt>
                    <dd>{character.playerName}</dd>
                  </div>
                  <div>
                    <dt>Background</dt>
                    <dd>{character.background}</dd>
                  </div>
                </dl>
              )}
              <h3 className="subheading">Description</h3>
              {editing ? (
                <textarea
                  aria-label="Character description in Notes"
                  className="field-input field-textarea"
                  rows={4}
                  value={character.description ?? ''}
                  onChange={(event) =>
                    updateField('description', event.target.value)
                  }
                />
              ) : (
                <p className="body-copy">{character.description}</p>
              )}
              <h3 className="subheading">Personal notes</h3>
              {editing ? (
                <textarea
                  aria-label="Personal notes"
                  className="field-input field-textarea"
                  rows={5}
                  value={character.notes ?? ''}
                  onChange={(event) => updateField('notes', event.target.value)}
                />
              ) : (
                <p className="body-copy">{character.notes}</p>
              )}
            </section>
          </div>
        )}

        {activeTab === 'spells' && (
          <section
            className="sheet-section sheet-section-wide spells-section"
            aria-labelledby="spells-heading"
          >
            <div className="section-heading">
              <h2 id="spells-heading">Spells</h2>
              <p>Manual reference for prepared and known magic</p>
            </div>

            {editing ? (
              <>
                {character.spells.length === 0 && (
                  <p className="section-empty spell-empty">
                    No spells recorded. Add the first spell to build this
                    character’s reference.
                  </p>
                )}
                <div className="spell-editor-list">
                  {character.spells.map((spell, index) => (
                    <section className="spell-editor" key={spell.id}>
                      <div className="spell-editor-heading">
                        <h3>{spell.name.trim() || `Spell ${index + 1}`}</h3>
                        <button
                          type="button"
                          className="button button-quiet"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              spells: current.spells.filter(
                                (item) => item.id !== spell.id,
                              ),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="spell-editor-grid">
                        <label className="spell-field-wide">
                          Spell name
                          <input
                            className="field-input"
                            value={spell.name}
                            onChange={(event) =>
                              updateSpell(spell.id, {
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Level
                          <NumberEdit
                            label={`${spell.name || 'Spell'} level`}
                            value={spell.level}
                            min={0}
                            max={9}
                            onChange={(level) =>
                              updateSpell(spell.id, { level })
                            }
                          />
                        </label>
                        <label>
                          School
                          <input
                            className="field-input"
                            value={spell.school}
                            onChange={(event) =>
                              updateSpell(spell.id, {
                                school: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Casting time
                          <input
                            className="field-input"
                            value={spell.castingTime}
                            onChange={(event) =>
                              updateSpell(spell.id, {
                                castingTime: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Range
                          <input
                            className="field-input"
                            value={spell.range}
                            onChange={(event) =>
                              updateSpell(spell.id, {
                                range: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Components
                          <input
                            className="field-input"
                            value={spell.components}
                            onChange={(event) =>
                              updateSpell(spell.id, {
                                components: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Duration
                          <input
                            className="field-input"
                            value={spell.duration}
                            onChange={(event) =>
                              updateSpell(spell.id, {
                                duration: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <fieldset className="spell-flags">
                        <legend>Spell states</legend>
                        {(
                          [
                            ['prepared', 'Prepared'],
                            ['concentration', 'Concentration'],
                            ['ritual', 'Ritual'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={spell[key]}
                              onChange={(event) =>
                                updateSpell(spell.id, {
                                  [key]: event.target.checked,
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                      <label className="spell-description-field">
                        Description
                        <textarea
                          className="field-input field-textarea"
                          rows={5}
                          value={spell.description}
                          onChange={(event) =>
                            updateSpell(spell.id, {
                              description: event.target.value,
                            })
                          }
                        />
                      </label>
                    </section>
                  ))}
                </div>
                <button
                  type="button"
                  className="button button-quiet spell-add-button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      spells: [
                        ...current.spells,
                        {
                          id: crypto.randomUUID(),
                          name: '',
                          level: 0,
                          school: '',
                          castingTime: '',
                          range: '',
                          components: '',
                          duration: '',
                          concentration: false,
                          ritual: false,
                          prepared: false,
                          description: '',
                        },
                      ],
                    }))
                  }
                >
                  Add spell
                </button>
              </>
            ) : character.spells.length === 0 ? (
              <p className="section-empty spell-empty">
                No spells recorded for this character.
              </p>
            ) : (
              <div className="spell-level-list">
                {[...spellGroups].map(([level, spells]) => (
                  <section
                    className="spell-level-group"
                    aria-labelledby={`spell-level-${level}`}
                    key={level}
                  >
                    <div className="spell-level-heading">
                      <h3 id={`spell-level-${level}`}>
                        {spellLevelLabel(level)}
                      </h3>
                      <span>
                        {spells.length}{' '}
                        {spells.length === 1 ? 'spell' : 'spells'}
                      </span>
                    </div>
                    <div className="spell-list">
                      {spells.map((spell) => (
                        <details className="spell-entry" key={spell.id}>
                          <summary>
                            <span className="spell-summary-name">
                              <strong>{spell.name}</strong>
                              <span>
                                {spell.school || 'School not recorded'}
                              </span>
                            </span>
                            <span className="spell-summary-facts">
                              <span>
                                {spell.castingTime || 'No casting time'}
                              </span>
                              <span>{spell.range || 'No range'}</span>
                              <span
                                className={
                                  spell.prepared
                                    ? 'spell-state spell-state-active'
                                    : 'spell-state'
                                }
                              >
                                {spell.prepared ? 'Prepared' : 'Not prepared'}
                              </span>
                            </span>
                          </summary>
                          <div className="spell-entry-body">
                            <dl className="spell-facts">
                              <div>
                                <dt>Casting time</dt>
                                <dd>{spell.castingTime || 'Not recorded'}</dd>
                              </div>
                              <div>
                                <dt>Range</dt>
                                <dd>{spell.range || 'Not recorded'}</dd>
                              </div>
                              <div>
                                <dt>Components</dt>
                                <dd>{spell.components || 'Not recorded'}</dd>
                              </div>
                              <div>
                                <dt>Duration</dt>
                                <dd>{spell.duration || 'Not recorded'}</dd>
                              </div>
                            </dl>
                            <div
                              className="spell-state-list"
                              aria-label="Spell states"
                            >
                              <span>
                                {spell.prepared ? 'Prepared' : 'Not prepared'}
                              </span>
                              <span>
                                {spell.concentration
                                  ? 'Concentration'
                                  : 'No concentration'}
                              </span>
                              <span>
                                {spell.ritual ? 'Ritual' : 'Not a ritual'}
                              </span>
                            </div>
                            <p className="body-copy spell-description">
                              {spell.description || 'No description recorded.'}
                            </p>
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </article>
  );
}
