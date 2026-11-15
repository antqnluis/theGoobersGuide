import { describe, expect, it } from 'vitest'
import {
  parseCharacterUpdate,
  resolveUpdate,
  toExpectedVersions,
  toUpdatePayload,
  type CharacterUpdate,
  type CurrentCharacter,
  type UpdateChange,
} from './characterUpdateDocument'
import { character, item, sheet } from './characterTestData'
import { defaultSheetBody } from './characterValidation'

const ATTACK = '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10'
const ATTACK_2 = '4a2d0b63-9e5f-4c8b-8d72-1b3c6e8f0a21'
const ROPE = '00000000-0000-4000-8000-0000000000a1'
const TORCH = '00000000-0000-4000-8000-0000000000a2'
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff'

function current(): CurrentCharacter {
  return {
    character: character({ subclass: 'Champion', species: 'Elf', class_name: 'Fighter' }),
    sheet: sheet({
      cp: 3,
      sp: 4,
      gp: 12,
      sheet: {
        ...defaultSheetBody(),
        abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 13, cha: 10 },
        saving_throws: ['str'],
        skills: { athletics: 'proficient', stealth: 'expertise' },
        attacks: [
          { id: ATTACK, name: 'Greataxe', bonus: '+6', damage: '1d12+4', notes: 'Heavy' },
          { id: ATTACK_2, name: 'Javelin', bonus: '+5', damage: '1d6+3', notes: '' },
        ],
        features: 'Rage',
        notes: 'Brave.',
        alignment: 'CN',
        experience: 300,
      },
    }),
    items: [
      item({
        id: ROPE,
        name: 'Rope',
        quantity: 1,
        weight: 10,
        updated_at: '2026-11-14T10:00:00+00:00',
      }),
      item({ id: TORCH, name: 'Torch', quantity: 3, updated_at: '2026-11-14T11:00:00+00:00' }),
    ],
  }
}

function document(changes: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'the-goobers-guide-character-update',
    version: 2,
    changes,
    issues: [],
    ...extra,
  })
}

function update(
  changes: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): CharacterUpdate {
  const result = parseCharacterUpdate(document(changes, extra))
  if (result.kind !== 'parsed') throw new Error(result.message)
  return result.update
}

function resolve(changes: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return resolveUpdate(update(changes, extra), current(), { newId: () => 'new-id' })
}

function byKey(changes: UpdateChange[]) {
  return Object.fromEntries(changes.map((change) => [change.key, change]))
}

describe('parseCharacterUpdate', () => {
  it('reads every section into one update', () => {
    const result = parseCharacterUpdate(
      document({
        details: { set: { level: 4 }, clear: ['subclass'] },
        vitals: { set: { max_hp: 31 } },
        abilities: { set: { wis: 16 } },
        saving_throws: { add: ['wis'], remove: ['str'] },
        skills: { set: { perception: 'proficient' }, remove: ['stealth'] },
        attacks: [
          { op: 'update', id: ATTACK, set: { bonus: '+7' } },
          { op: 'add', entry: { name: 'Dagger' } },
          { op: 'remove', id: ATTACK_2 },
        ],
        text: { set: { notes: 'x' } },
        inventory: [{ op: 'remove', id: ROPE }],
        currency: { set: { gp: 20 } },
      }),
    )
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.update.details).toEqual({ set: { level: 4 }, clear: ['subclass'] })
    expect(result.update.attacks).toHaveLength(3)
    expect(result.update.inventory).toEqual([{ op: 'remove', id: ROPE }])
    expect(result.update.currency.set).toEqual({ gp: 20 })
    expect(result.ignored).toEqual([])
  })

  it('accepts an empty changes section and lists unknown sections as ignored', () => {
    const result = parseCharacterUpdate(
      document({ spells: { set: {} } }, { exported_by: 'someone' }),
    )
    expect(result).toMatchObject({ kind: 'parsed', ignored: ['exported_by', 'changes.spells'] })
  })

  it('accepts one surrounding code fence', () => {
    const text = '```json\n' + document({ details: { set: { level: 4 } } }) + '\n```'
    expect(parseCharacterUpdate(text).kind).toBe('parsed')
  })

  it.each([
    ['empty text', '', 'Paste a document first.'],
    ['text that is not JSON', 'level 4', 'That isn’t valid JSON'],
    [
      'the legacy version 1',
      JSON.stringify({ format: 'the-goobers-guide-character-update', version: 1, changes: {} }),
      'Copy the current update prompt',
    ],
    [
      'a character document',
      JSON.stringify({ format: 'the-goobers-guide-character', version: 3, character: {} }),
      'This is a character document.',
    ],
    [
      'another format',
      JSON.stringify({ format: 'x', version: 2 }),
      'That isn’t a Goobers Guide document.',
    ],
    [
      'no changes section',
      JSON.stringify({ format: 'the-goobers-guide-character-update', version: 2 }),
      'The update has no changes section.',
    ],
    ['details that are a list', document({ details: [] }), '“details” must be an object.'],
    [
      'an unknown details key',
      document({ details: { reset: true } }),
      '“details.reset” isn’t part',
    ],
    [
      'a vitals set that is a list',
      document({ vitals: { set: [] } }),
      '“vitals.set” must be an object.',
    ],
    ['attacks that are an object', document({ attacks: {} }), '“attacks” must be a list.'],
    ['an operation without a kind', document({ attacks: [{ id: ATTACK }] }), '“attacks[0].op”'],
    ['an add without an entry', document({ inventory: [{ op: 'add' }] }), '“inventory[0].entry”'],
    [
      'an update without a set',
      document({ inventory: [{ op: 'update', id: ROPE }] }),
      '“inventory[0].set”',
    ],
    ['issues that are not text', document({}, { issues: [1] }), '“issues” must be a list of text.'],
    [
      'clear that is not a list',
      document({ details: { clear: 'subclass' } }),
      '“details.clear” must be a list.',
    ],
  ])('refuses %s', (_label, text, message) => {
    const result = parseCharacterUpdate(text)
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.message).toContain(message)
  })
})

describe('resolveUpdate', () => {
  it('proposes only values that differ from the stored ones', () => {
    const result = resolve({
      details: { set: { level: 3, name: 'Brand', species: 'Elf', class_name: 'Paladin' } },
      vitals: { set: { max_hp: 30, armor_class: 16 } },
      abilities: { set: { str: 16, dex: 14 } },
      saving_throws: { add: ['str', 'dex'], remove: ['wis'] },
      skills: {
        set: { athletics: 'proficient', arcana: 'expertise' },
        remove: ['perception', 'stealth'],
      },
      text: { set: { features: 'Rage', notes: 'Brave. Fierce.' } },
      currency: { set: { cp: 3, gp: 20 } },
    })
    expect(result.blocked).toBeNull()
    expect(result.changes.map((change) => change.key).sort()).toEqual([
      'abilities.dex',
      'currency.gp',
      'details.class_name',
      'saving_throws.add.dex',
      'skills.remove.stealth',
      'skills.set.arcana',
      'text.notes',
      'vitals.armor_class',
    ])
  })

  it('describes each change with its before and after', () => {
    const changes = byKey(
      resolve({
        details: { set: { level: 4 }, clear: ['subclass'] },
        vitals: { set: { current_hp: null } },
        saving_throws: { add: ['wis'] },
        skills: { set: { stealth: 'proficient' } },
        currency: { set: { gp: 20 } },
      }).changes,
    )
    expect(changes['details.level']).toMatchObject({
      label: 'Level',
      before: '3',
      after: '4',
      error: null,
    })
    expect(changes['details.subclass']).toMatchObject({ before: 'Champion', after: 'Cleared' })
    expect(changes['vitals.current_hp']).toMatchObject({ before: '12', after: '—' })
    expect(changes['saving_throws.add.wis']).toMatchObject({
      label: 'Wisdom saving throw',
      before: 'Not proficient',
      after: 'Proficient',
    })
    expect(changes['skills.set.stealth']).toMatchObject({
      before: 'expertise',
      after: 'proficient',
    })
    expect(changes['currency.gp']).toMatchObject({ label: 'Gold', before: '12', after: '20' })
    expect(changes['details.level'].section).toBe('details')
  })

  it('treats an explicit empty text, zero, or false as a real change', () => {
    const changes = byKey(
      resolve({
        text: { set: { notes: '', experience: 0 } },
        vitals: { set: { temp_hp: 0, speed: 0 } },
        currency: { set: { gp: 0 } },
        inventory: [
          { op: 'update', id: ROPE, set: { quantity: 0, equipped: false, weight: null } },
        ],
      }).changes,
    )
    expect(Object.keys(changes).sort()).toEqual([
      'currency.gp',
      `inventory.update.${ROPE}.quantity`,
      `inventory.update.${ROPE}.weight`,
      'text.experience',
      'text.notes',
      'vitals.speed',
    ])
    expect(changes['text.notes'].after).toBe('—')
  })

  it('updates, adds, and removes attacks by id', () => {
    const changes = byKey(
      resolve({
        attacks: [
          { op: 'update', id: ATTACK, set: { bonus: '+7', name: 'Greataxe', damage: '2d6' } },
          { op: 'add', entry: { id: 'ignored', name: 'Dagger', bonus: '+4', damage: '1d4' } },
          { op: 'remove', id: ATTACK_2 },
        ],
      }).changes,
    )
    expect(Object.keys(changes).sort()).toEqual([
      'attacks.add.1',
      `attacks.remove.${ATTACK_2}`,
      `attacks.update.${ATTACK}.bonus`,
      `attacks.update.${ATTACK}.damage`,
    ])
    expect(changes[`attacks.update.${ATTACK}.bonus`]).toMatchObject({
      label: 'Attack “Greataxe”: Bonus',
      before: '+6',
      after: '+7',
    })
    expect(changes['attacks.add.1'].effect).toEqual({
      type: 'attack-add',
      attack: { id: 'new-id', name: 'Dagger', bonus: '+4', damage: '1d4', notes: '' },
    })
    expect(changes[`attacks.remove.${ATTACK_2}`]).toMatchObject({ after: 'Removed' })
  })

  it('updates, adds, and removes items by id', () => {
    const changes = byKey(
      resolve({
        inventory: [
          { op: 'update', id: ROPE, set: { quantity: 2, description: 'Silk', equipped: true } },
          { op: 'add', entry: { name: 'Potion', quantity: 2, weight: 0.5 } },
          { op: 'remove', id: TORCH },
        ],
      }).changes,
    )
    expect(Object.keys(changes).sort()).toEqual([
      'inventory.add.1',
      `inventory.remove.${TORCH}`,
      `inventory.update.${ROPE}.description`,
      `inventory.update.${ROPE}.equipped`,
      `inventory.update.${ROPE}.quantity`,
    ])
    expect(changes[`inventory.update.${ROPE}.quantity`]).toMatchObject({
      label: 'Item “Rope”: Quantity',
      before: '1',
      after: '2',
    })
    expect(changes[`inventory.update.${ROPE}.equipped`]).toMatchObject({
      before: 'No',
      after: 'Yes',
    })
    expect(changes['inventory.add.1'].effect).toEqual({
      type: 'item-add',
      item: {
        name: 'Potion',
        quantity: 2,
        weight: 0.5,
        description: null,
        equipped: false,
        attuned: false,
      },
    })
  })

  describe('blocks the whole document', () => {
    it.each([
      [
        'an update to an unknown attack',
        { attacks: [{ op: 'update', id: UNKNOWN, set: { bonus: '+1' } }] },
        'attack that isn’t',
      ],
      [
        'a removal of an unknown attack',
        { attacks: [{ op: 'remove', id: UNKNOWN }] },
        'attack that isn’t',
      ],
      ['an attack operation without an id', { attacks: [{ op: 'remove' }] }, 'attack that isn’t'],
      [
        'an update to an unknown item',
        { inventory: [{ op: 'update', id: UNKNOWN, set: { quantity: 1 } }] },
        'item that isn’t',
      ],
      [
        'a removal of an unknown item',
        { inventory: [{ op: 'remove', id: UNKNOWN }] },
        'item that isn’t',
      ],
      [
        'an item changed twice',
        {
          inventory: [
            { op: 'remove', id: ROPE },
            { op: 'update', id: ROPE, set: { quantity: 2 } },
          ],
        },
        'changed more than once',
      ],
      [
        'an attack changed twice',
        {
          attacks: [
            { op: 'remove', id: ATTACK },
            { op: 'remove', id: ATTACK },
          ],
        },
        'changed more than once',
      ],
      [
        'an unknown detail',
        { details: { set: { race: 'Elf' } } },
        '“race” isn’t a character detail',
      ],
      ['clearing the name', { details: { clear: ['name'] } }, '“name” can’t be cleared'],
      [
        'setting and clearing a detail',
        { details: { set: { species: 'Orc' }, clear: ['species'] } },
        'both set and cleared',
      ],
      ['an unknown vital', { vitals: { set: { hit_dice: 3 } } }, '“hit_dice” isn’t a vital'],
      ['an unknown ability', { abilities: { set: { luck: 10 } } }, '“luck” isn’t an ability'],
      ['an unknown save', { saving_throws: { add: ['luck'] } }, '“luck” isn’t an ability'],
      [
        'a save added and removed',
        { saving_throws: { add: ['dex'], remove: ['dex'] } },
        'both added and removed',
      ],
      ['an unknown skill', { skills: { set: { flying: 'proficient' } } }, '“flying” isn’t a skill'],
      [
        'a skill set and removed',
        { skills: { set: { arcana: 'proficient' }, remove: ['arcana'] } },
        'both set and removed',
      ],
      [
        'an unknown attack field',
        { attacks: [{ op: 'update', id: ATTACK, set: { range: '5' } }] },
        '“range” isn’t an attack field',
      ],
      [
        'an unknown added attack field',
        { attacks: [{ op: 'add', entry: { range: '5' } }] },
        'unknown field “range”',
      ],
      [
        'an unknown item field',
        { inventory: [{ op: 'update', id: ROPE, set: { cursed: true } }] },
        '“cursed” isn’t an item field',
      ],
      [
        'an unknown added item field',
        { inventory: [{ op: 'add', entry: { name: 'x', cursed: true } }] },
        'unknown field “cursed”',
      ],
      [
        'an unknown text field',
        { text: { set: { backstory: 'x' } } },
        '“backstory” isn’t a text field',
      ],
      ['electrum', { currency: { set: { ep: 1 } } }, 'convert other coins'],
      ['platinum', { currency: { set: { pp: 1 } } }, 'convert other coins'],
    ])('for %s', (_label, changes, message) => {
      const result = resolve(changes)
      expect(result.changes).toEqual([])
      expect(result.blocked).toContain(message)
    })

    it('when the assistant reported issues, even with valid changes', () => {
      const result = resolve(
        { details: { set: { level: 4 } } },
        { issues: ['Which sword is meant?', 'Is XP 300?'] },
      )
      expect(result.changes).toEqual([])
      expect(result.blocked).toContain('Which sword is meant? Is XP 300?')
    })
  })

  describe('disables a single invalid value and keeps the others', () => {
    it('for details', () => {
      const changes = byKey(
        resolve({
          details: { set: { level: 21, name: 'x'.repeat(81), species: 5, class_name: 'Paladin' } },
        }).changes,
      )
      expect(changes['details.level'].error).toBe('Level must be between 1 and 20.')
      expect(changes['details.name'].error).toContain('80')
      expect(changes['details.species'].error).toBe('Species must be text.')
      expect(changes['details.class_name'].error).toBeNull()
      expect(resolve({ details: { set: { name: null } } }).changes[0].error).toBe(
        'Name must be text.',
      )
      expect(resolve({ details: { set: { level: 2.5 } } }).changes[0].error).toBe(
        'Level must be a whole number.',
      )
    })

    it('for vitals, abilities, text, and coins', () => {
      const changes = byKey(
        resolve({
          vitals: { set: { max_hp: 0, speed: '30', temp_hp: null, armor_class: 17 } },
          abilities: { set: { str: 31, dex: 14 } },
          skills: { set: { arcana: 'master' } },
          text: {
            set: { experience: 1_000_001, alignment: 'x'.repeat(41), features: 4, spells: 'ok' },
          },
          currency: { set: { gp: -1, sp: 1.5, cp: 10_000_000 } },
        }).changes,
      )
      expect(changes['vitals.max_hp'].error).toContain('between 1 and 9999')
      expect(changes['vitals.speed'].error).toContain('whole number')
      expect(changes['vitals.temp_hp'].error).toContain('whole number')
      expect(changes['vitals.armor_class'].error).toBeNull()
      expect(changes['abilities.str'].error).toContain('between 1 and 30')
      expect(changes['abilities.dex'].error).toBeNull()
      expect(changes['skills.set.arcana'].error).toContain('proficient')
      expect(changes['text.experience'].error).toContain('1,000,000')
      expect(changes['text.alignment'].error).toContain('too long')
      expect(changes['text.features'].error).toContain('text')
      expect(changes['text.spells'].error).toBeNull()
      for (const key of ['currency.gp', 'currency.sp', 'currency.cp']) {
        expect(changes[key].error, key).toContain('9,999,999')
      }
    })

    it('for attacks and items', () => {
      const changes = byKey(
        resolve({
          attacks: [
            { op: 'update', id: ATTACK, set: { name: 'x'.repeat(81), bonus: 7, notes: 'fine' } },
            { op: 'add', entry: { name: 'x'.repeat(81) } },
          ],
          inventory: [
            {
              op: 'update',
              id: ROPE,
              set: {
                quantity: 10_000,
                name: '',
                weight: 1.005,
                equipped: 'yes',
                description: 'ok',
              },
            },
            { op: 'add', entry: { name: '' } },
            { op: 'add', entry: { name: 'Valid', quantity: -1 } },
          ],
        }).changes,
      )
      expect(changes[`attacks.update.${ATTACK}.name`].error).toContain('80')
      expect(changes[`attacks.update.${ATTACK}.bonus`].error).toBe('Attack bonus must be text.')
      expect(changes[`attacks.update.${ATTACK}.notes`].error).toBeNull()
      expect(changes['attacks.add.1'].error).toContain('80')
      expect(changes[`inventory.update.${ROPE}.quantity`].error).toContain('9,999')
      expect(changes[`inventory.update.${ROPE}.name`].error).toContain('name')
      expect(changes[`inventory.update.${ROPE}.weight`].error).toContain('two decimals')
      expect(changes[`inventory.update.${ROPE}.equipped`].error).toBe('Equipped must be yes or no.')
      expect(changes[`inventory.update.${ROPE}.description`].error).toBeNull()
      expect(changes['inventory.add.1'].error).toContain('name')
      expect(changes['inventory.add.2'].error).toContain('Quantity')
    })
  })

  it('shortens long text in the review but keeps the full value to apply', () => {
    const long = 'z'.repeat(500)
    const [change] = resolve({ text: { set: { notes: long } } }).changes
    expect(change.after.length).toBeLessThan(130)
    expect(change.effect).toEqual({ type: 'text', field: 'notes', value: long })
  })
})

describe('toUpdatePayload', () => {
  function select(changes: Record<string, unknown>, keys?: string[]) {
    const { changes: all } = resolve(changes)
    return keys ? all.filter((change) => keys.includes(change.key)) : all
  }

  it('refuses an empty selection and any change with an error', () => {
    expect(toUpdatePayload([], current())).toEqual({
      ok: false,
      errors: ['Select at least one change.'],
    })
    const bad = select({ details: { set: { level: 99 } } })
    expect(toUpdatePayload(bad, current())).toEqual({
      ok: false,
      errors: ['Level: Level must be between 1 and 20.'],
    })
  })

  it('builds database-shaped changes for only what was selected', () => {
    const selected = select(
      {
        details: { set: { level: 4 }, clear: ['subclass'] },
        vitals: { set: { max_hp: 40, current_hp: 40 } },
        abilities: { set: { wis: 16 } },
        saving_throws: { add: ['dex'], remove: ['str'] },
        skills: { set: { perception: 'proficient' }, remove: ['stealth'] },
        attacks: [
          { op: 'update', id: ATTACK, set: { bonus: '+7' } },
          { op: 'add', entry: { name: 'Dagger' } },
          { op: 'remove', id: ATTACK_2 },
        ],
        text: { set: { notes: 'New notes.', experience: 450 } },
        inventory: [
          { op: 'update', id: ROPE, set: { quantity: 2, weight: null } },
          { op: 'add', entry: { name: ' Potion ', quantity: 2 } },
          { op: 'remove', id: TORCH },
        ],
        currency: { set: { gp: 20, cp: 0 } },
      },
      // Leave the notes and the Dagger unselected.
      [
        'details.level',
        'details.subclass',
        'vitals.max_hp',
        'vitals.current_hp',
        'abilities.wis',
        'saving_throws.add.dex',
        'saving_throws.remove.str',
        'skills.set.perception',
        'skills.remove.stealth',
        `attacks.update.${ATTACK}.bonus`,
        `attacks.remove.${ATTACK_2}`,
        'text.experience',
        `inventory.update.${ROPE}.quantity`,
        `inventory.update.${ROPE}.weight`,
        'inventory.add.1',
        `inventory.remove.${TORCH}`,
        'currency.gp',
        'currency.cp',
      ],
    )
    const result = toUpdatePayload(selected, current())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { changes } = result
    expect(changes.change_count).toBe(selected.length)
    expect(changes.details).toEqual({ level: 4, subclass: null })
    expect(changes.vitals).toEqual({ max_hp: 40, current_hp: 40 })
    expect(changes.coins).toEqual({ gp: 20, cp: 0 })
    expect(changes.items).toEqual({
      add: [
        {
          name: 'Potion',
          quantity: 2,
          weight: null,
          description: null,
          equipped: false,
          attuned: false,
        },
      ],
      update: [{ id: ROPE, quantity: 2, weight: null }],
      remove: [TORCH],
    })
    expect(changes.sheet?.abilities.wis).toBe(16)
    expect(changes.sheet?.saving_throws).toEqual(['dex'])
    expect(changes.sheet?.skills).toEqual({ athletics: 'proficient', perception: 'proficient' })
    expect(changes.sheet?.attacks).toEqual([
      { id: ATTACK, name: 'Greataxe', bonus: '+7', damage: '1d12+4', notes: 'Heavy' },
    ])
    expect(changes.sheet?.experience).toBe(450)
    expect(changes.sheet?.notes).toBe('Brave.')
    expect(changes.sheet?.features).toBe('Rage')
    expect(result.expected).toEqual(toExpectedVersions(current()))
  })

  it('omits sections that were not selected', () => {
    const result = toUpdatePayload(select({ currency: { set: { gp: 20 } } }), current())
    expect(result).toMatchObject({ ok: true, changes: { coins: { gp: 20 }, change_count: 1 } })
    if (result.ok) {
      expect(Object.keys(result.changes).sort()).toEqual(['change_count', 'coins'])
    }
  })

  it('does not change the stored sheet object it was given', () => {
    const state = current()
    const before = JSON.stringify(state.sheet.sheet)
    const { changes } = resolveUpdate(
      update({ attacks: [{ op: 'remove', id: ATTACK }], text: { set: { notes: 'x' } } }),
      state,
    )
    toUpdatePayload(changes, state)
    expect(JSON.stringify(state.sheet.sheet)).toBe(before)
  })

  it('states the versions the review was built from', () => {
    expect(toExpectedVersions(current())).toEqual({
      character_updated_at: '2026-11-13T10:00:00+00:00',
      sheet_updated_at: '2026-11-13T10:05:00+00:00',
      items: { [ROPE]: '2026-11-14T10:00:00+00:00', [TORCH]: '2026-11-14T11:00:00+00:00' },
    })
  })

  describe('checks the selected changes together', () => {
    it('current HP against maximum HP, both ways', () => {
      const changes = resolve({ vitals: { set: { current_hp: 40, max_hp: 50 } } }).changes
      expect(toUpdatePayload(changes, current()).ok).toBe(true)
      const onlyCurrent = changes.filter((change) => change.key === 'vitals.current_hp')
      const result = toUpdatePayload(onlyCurrent, current())
      expect(result).toMatchObject({ ok: false })
      if (!result.ok) expect(result.errors[0]).toContain('higher than maximum')
    })

    it('the item cap, counting removals and additions', () => {
      const state = current()
      state.items = Array.from({ length: 200 }, (_, n) =>
        item({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Item ${n}` }),
      )
      const added = resolveUpdate(
        update({ inventory: [{ op: 'add', entry: { name: 'One more' } }] }),
        state,
      )
      expect(toUpdatePayload(added.changes, state)).toEqual({
        ok: false,
        errors: ['A character can carry up to 200 items.'],
      })
      const swapped = resolveUpdate(
        update({
          inventory: [
            { op: 'remove', id: state.items[0].id },
            { op: 'add', entry: { name: 'Swap' } },
          ],
        }),
        state,
      )
      expect(toUpdatePayload(swapped.changes, state).ok).toBe(true)
    })

    it('the number of attacks and the saved size of the sheet', () => {
      const state = current()
      state.sheet.sheet.attacks = Array.from({ length: 30 }, (_, n) => ({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        name: `A${n}`,
        bonus: '',
        damage: '',
        notes: '',
      }))
      const added = resolveUpdate(
        update({ attacks: [{ op: 'add', entry: { name: 'Extra' } }] }),
        state,
      )
      const result = toUpdatePayload(added.changes, state)
      expect(result).toMatchObject({ ok: false })
      if (!result.ok) expect(result.errors).toContain('Add up to 30 attacks.')
    })
  })
})
