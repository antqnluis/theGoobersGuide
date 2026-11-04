import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Campaign } from '../campaigns/model';
import { useUnsavedChanges } from '../../shared/ui/useUnsavedChanges';
import { abilityModifier } from './characterService';
import {
  abilityNames,
  type AbilityName,
  type Character,
  type CombatStats,
} from './model';

type SheetTab = 'overview' | 'skills' | 'gear' | 'journal';

const tabs: { id: SheetTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills & saves' },
  { id: 'gear', label: 'Gear & features' },
  { id: 'journal', label: 'Notes & spells' },
];

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

function NumberEdit({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const [input, setInput] = useState(String(value));

  useEffect(() => setInput(String(value)), [value]);

  return (
    <input
      aria-label={label}
      className={`field-input field-input-number ${className}`}
      type="number"
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
  error,
  feedback,
}: {
  campaign: Campaign;
  character: Character;
  creating?: boolean;
  onSave: (character: Character) => boolean;
  onDelete?: (character: Character) => void;
  error: string | null;
  feedback: string | null;
}) {
  const [saved, setSaved] = useState<Character>(initial);
  const [draft, setDraft] = useState<Character>(initial);
  const [editing, setEditing] = useState(creating);
  const [quickHp, setQuickHp] = useState(String(initial.combat.currentHp));
  const [quickTemp, setQuickTemp] = useState(
    String(initial.combat.temporaryHp),
  );
  const [quickError, setQuickError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SheetTab>('overview');
  const character = editing ? draft : saved;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);
  const allowNavigation = useUnsavedChanges(
    dirty,
    'Discard unsaved character changes?',
  );

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

  function startEdit() {
    setDraft(structuredClone(saved));
    setEditing(true);
  }

  function cancelEdit() {
    if (creating) {
      allowNavigation.current = true;
      window.location.hash = `#/party/${campaign.id}`;
      return;
    }
    setDraft(structuredClone(saved));
    setEditing(false);
  }

  function savePreview() {
    allowNavigation.current = true;
    if (!onSave(draft)) {
      allowNavigation.current = false;
      return;
    }
    setSaved(structuredClone(draft));
    setEditing(false);
    if (!creating) allowNavigation.current = false;
  }

  function saveQuick(key: 'currentHp' | 'temporaryHp', raw: string) {
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

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    document.getElementById(`tab-${tabs[nextIndex].id}`)?.focus();
  }

  return (
    <article
      className="sheet"
      aria-label={`${character.name || 'New character'} sheet`}
    >
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
                onChange={(event) => updateField('name', event.target.value)}
              />
            </label>
          ) : (
            <h1>{character.name}</h1>
          )}
          <p className="character-line">
            Level {character.level} {character.className}
            {character.subclass ? `, ${character.subclass}` : ''} /{' '}
            {character.species}
          </p>
          <p className="character-description">{character.description}</p>
        </div>
        <div className="sheet-header-actions">
          {onDelete && !editing && (
            <button
              className="button button-quiet"
              type="button"
              onClick={() => onDelete(saved)}
            >
              Delete character
            </button>
          )}
          {editing ? (
            <div className="edit-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={cancelEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={savePreview}
              >
                {creating ? 'Create character' : 'Save changes'}
              </button>
            </div>
          ) : (
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

      <div className="sheet-status" role="status">
        {error ||
          quickError ||
          feedback ||
          (editing
            ? 'Changes are saved when you select Save changes.'
            : 'Saved in this browser.')}
      </div>

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
            ) : (
              <>
                <input
                  className="field-input field-input-number hp-input"
                  type="number"
                  min="0"
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
            ) : (
              <input
                className="field-input field-input-number inline-number"
                type="number"
                min="0"
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

      <div
        className="sheet-tabs"
        role="tablist"
        aria-label="Character sheet sections"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="sheet-panel"
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="sheet-panel"
        className="sheet-panel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'overview' && (
          <div className="sheet-panel-grid">
            <section
              className="sheet-section sheet-section-wide"
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
              className="sheet-section sheet-section-wide"
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

        {activeTab === 'gear' && (
          <div className="sheet-panel-grid">
            <section
              className="sheet-section"
              aria-labelledby="inventory-heading"
            >
              <div className="section-heading">
                <h2 id="inventory-heading">Inventory</h2>
                <p>Gear carried into the next session</p>
              </div>
              <div className="ledger-list">
                {character.inventory.map((item, index) => (
                  <div className="ledger-row inventory-row" key={item.id}>
                    <div>
                      {editing ? (
                        <>
                          <input
                            className="field-input"
                            aria-label="Item name"
                            value={item.name}
                            onChange={(e) =>
                              setDraft((c) => ({
                                ...c,
                                inventory: c.inventory.map((i) =>
                                  i.id === item.id
                                    ? { ...i, name: e.target.value }
                                    : i,
                                ),
                              }))
                            }
                          />
                          <input
                            className="field-input"
                            aria-label="Item description"
                            value={item.description ?? ''}
                            onChange={(e) =>
                              setDraft((c) => ({
                                ...c,
                                inventory: c.inventory.map((i) =>
                                  i.id === item.id
                                    ? { ...i, description: e.target.value }
                                    : i,
                                ),
                              }))
                            }
                          />
                        </>
                      ) : (
                        <>
                          <strong>{item.name}</strong>
                          {item.description && <span>{item.description}</span>}
                        </>
                      )}
                    </div>
                    {editing ? (
                      <NumberEdit
                        label={`${item.name} quantity`}
                        value={item.quantity}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            inventory: current.inventory.map(
                              (entry, itemIndex) =>
                                itemIndex === index
                                  ? { ...entry, quantity: value }
                                  : entry,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <span className="row-value">× {item.quantity}</span>
                    )}
                    {editing && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() =>
                          setDraft((c) => ({
                            ...c,
                            inventory: c.inventory.filter(
                              (i) => i.id !== item.id,
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
                      inventory: [
                        ...c.inventory,
                        { id: crypto.randomUUID(), name: '', quantity: 1 },
                      ],
                    }))
                  }
                >
                  Add item
                </button>
              )}
              <h3 className="subheading">Currency</h3>
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
                  className="button button-quiet"
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
            </section>
            <section
              className="sheet-section"
              aria-labelledby="features-heading"
            >
              <div className="section-heading">
                <h2 id="features-heading">Features</h2>
                <p>Custom and homebrew text is welcome</p>
              </div>
              <div className="feature-list">
                {character.features.map((feature, index) => (
                  <div className="feature-entry" key={feature.id}>
                    {editing ? (
                      <>
                        <input
                          className="field-input"
                          aria-label="Feature category"
                          placeholder="Category (optional)"
                          value={feature.category ?? ''}
                          onChange={(e) =>
                            setDraft((c) => ({
                              ...c,
                              features: c.features.map((f) =>
                                f.id === feature.id
                                  ? { ...f, category: e.target.value }
                                  : f,
                              ),
                            }))
                          }
                        />
                        <input
                          className="field-input"
                          aria-label="Feature name"
                          value={feature.name}
                          onChange={(e) =>
                            setDraft((c) => ({
                              ...c,
                              features: c.features.map((f) =>
                                f.id === feature.id
                                  ? { ...f, name: e.target.value }
                                  : f,
                              ),
                            }))
                          }
                        />
                      </>
                    ) : (
                      <>
                        <span className="feature-category">
                          {feature.category}
                        </span>
                        <h3>{feature.name}</h3>
                      </>
                    )}
                    {editing ? (
                      <textarea
                        aria-label={`${feature.name} description`}
                        className="field-input field-textarea"
                        rows={3}
                        value={feature.description}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            features: current.features.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    ) : (
                      <p>{feature.description}</p>
                    )}
                    {editing && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() =>
                          setDraft((c) => ({
                            ...c,
                            features: c.features.filter(
                              (f) => f.id !== feature.id,
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
                      features: [
                        ...c.features,
                        { id: crypto.randomUUID(), name: '', description: '' },
                      ],
                    }))
                  }
                >
                  Add feature
                </button>
              )}
            </section>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="sheet-panel-grid">
            <section
              className="sheet-section"
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
                    Level
                    <NumberEdit
                      label="Level"
                      value={character.level}
                      onChange={(value) =>
                        setDraft((c) => ({ ...c, level: value }))
                      }
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
                  aria-label="Character description"
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
            <section className="sheet-section" aria-labelledby="spells-heading">
              <div className="section-heading">
                <h2 id="spells-heading">Spells</h2>
                <p>User-entered reference text</p>
              </div>
              {editing ? (
                <textarea
                  aria-label="Spells"
                  className="field-input field-textarea"
                  rows={5}
                  value={character.spells ?? ''}
                  onChange={(event) =>
                    updateField('spells', event.target.value)
                  }
                />
              ) : (
                <p className="body-copy">{character.spells}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
