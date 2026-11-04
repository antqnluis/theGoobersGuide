import { useState, type KeyboardEvent } from 'react';
import { sampleCharacter } from '../../design/sampleData';
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
  return (
    <input
      aria-label={label}
      className={`field-input field-input-number ${className}`}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

export default function CharacterSheetPreview() {
  const [saved, setSaved] = useState<Character>(sampleCharacter);
  const [draft, setDraft] = useState<Character>(sampleCharacter);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<SheetTab>('overview');
  const character = editing ? draft : saved;

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
        [ability]: { ...current.abilityScores[ability], [key]: value },
      },
    }));
  }

  function startEdit() {
    setDraft(structuredClone(saved));
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(structuredClone(saved));
    setEditing(false);
  }

  function savePreview() {
    setSaved(structuredClone(draft));
    setEditing(false);
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
    <article className="sheet" aria-label="Sample character sheet">
      <header className="sheet-header">
        <div className="sheet-header-copy">
          <p className="sheet-context">The Bad Company / Character sheet</p>
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
          <span className="sample-tag">Sample character</span>
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
                Save preview
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={startEdit}
            >
              Edit sample sheet
            </button>
          )}
        </div>
      </header>

      <div className="sheet-status" role="note">
        This is a design preview. Edits reset when you leave or reload this
        page.
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
                <strong>{character.combat.currentHp}</strong>
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
              character.combat.temporaryHp
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
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`panel-${activeTab}`}
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
                      <strong>{attack.name}</strong>
                      <span>{attack.damageExpression}</span>
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
                  </div>
                ))}
              </div>
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
                  <div className="ledger-row proficiency-row" key={skill.name}>
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
                      {skill.name}
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
                  </div>
                ))}
              </div>
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
                      <strong>{item.name}</strong>
                      {item.description && <span>{item.description}</span>}
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
                  </div>
                ))}
              </div>
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
                    </div>
                  ),
                )}
              </div>
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
                    <span className="feature-category">{feature.category}</span>
                    <h3>{feature.name}</h3>
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
                  </div>
                ))}
              </div>
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
