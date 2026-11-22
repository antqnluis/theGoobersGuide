import { describe, expect, it } from 'vitest'
import { parseSpells, toSpellEntry } from './spellFormat'

const names = (block: ReturnType<typeof parseSpells>[number]) =>
  block.kind === 'group' ? block.spells.map((spell) => spell.name) : []

describe('parseSpells', () => {
  it('shows nothing for an empty field', () => {
    expect(parseSpells('')).toEqual([])
    expect(parseSpells('  \n\n ')).toEqual([])
  })

  it('groups comma-separated lines by level, with slots and a mark', () => {
    const blocks = parseSpells(
      "Cantrips: Light, Mage Hand\n1st level (3 slots): Hunter's Mark, Cure Wounds\n2nd level [2 slots]: Pass Without Trace",
    )
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({ title: 'Cantrips', mark: 'C', slots: null })
    expect(names(blocks[0])).toEqual(['Light', 'Mage Hand'])
    expect(blocks[1]).toMatchObject({ title: '1st level', mark: '1', slots: '3 slots' })
    expect(names(blocks[1])).toEqual(["Hunter's Mark", 'Cure Wounds'])
    expect(blocks[2]).toMatchObject({ title: '2nd level', mark: '2', slots: '2 slots' })
  })

  it('does not split on commas inside brackets, and keeps the detail', () => {
    const [block] = parseSpells('3rd level: Fireball (8d6 fire, 20 ft.), Counterspell')
    expect(names(block)).toEqual(['Fireball', 'Counterspell'])
    expect(block.kind === 'group' && block.spells[0].detail).toBe('(8d6 fire, 20 ft.)')
  })

  it('reads headings with bullet lists under them', () => {
    const blocks = parseSpells(
      '## Cantrips\n- Light\n- Mage Hand — utility\n\n### Level 1 (4 slots)\n* Shield\n1. Sleep',
    )
    expect(blocks).toHaveLength(2)
    expect(names(blocks[0])).toEqual(['Light', 'Mage Hand'])
    expect(blocks[0].kind === 'group' && blocks[0].spells[1].detail).toBe('utility')
    expect(blocks[1]).toMatchObject({ title: 'Level 1', mark: '1', slots: '4 slots' })
    expect(names(blocks[1])).toEqual(['Shield', 'Sleep'])
  })

  it('takes lines under a heading-only colon line as spells', () => {
    const [block] = parseSpells('1st level:\nShield\nMagic Missile, Sleep')
    expect(names(block)).toEqual(['Shield', 'Magic Missile', 'Sleep'])
  })

  it('keeps facts and sentences as plain text, not as spells', () => {
    const blocks = parseSpells(
      'Spellcasting ability: Wisdom\nSpell save DC: 14\nSpell slots: 4 / 3\nThis is the spell list for Arlen.',
    )
    expect(blocks).toEqual([
      {
        kind: 'text',
        text: 'Spellcasting ability: Wisdom\nSpell save DC: 14\nSpell slots: 4 / 3\nThis is the spell list for Arlen.',
      },
    ])
  })

  it('keeps a slots line and a "none" line as text', () => {
    const blocks = parseSpells(
      'Fighter Spell Slots: None.\nSpellcasting ability: Charisma.\nCantrips: Light',
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({
      kind: 'text',
      text: 'Fighter Spell Slots: None.\nSpellcasting ability: Charisma.',
    })
    expect(blocks[1]).toMatchObject({ kind: 'group', title: 'Cantrips' })
  })

  it('puts loose bullets in one group and prose before a group in its own block', () => {
    const blocks = parseSpells("Known from the Ranger list.\n\n- Hunter's Mark\n- Goodberry")
    expect(blocks[0]).toEqual({ kind: 'text', text: 'Known from the Ranger list.' })
    expect(blocks[1]).toMatchObject({ kind: 'group', title: '' })
    expect(names(blocks[1])).toEqual(["Hunter's Mark", 'Goodberry'])
  })

  it('shows a heading with nothing under it as text', () => {
    expect(parseSpells('Cantrips:')).toEqual([{ kind: 'text', text: 'Cantrips' }])
  })

  it('leaves unlevelled group titles unmarked', () => {
    const [block] = parseSpells('Warlock spells: Eldritch Blast, Hex')
    expect(block).toMatchObject({ title: 'Warlock spells', mark: null })
  })

  it('never drops or rewords a spell name', () => {
    const [block] = parseSpells('1st level: <b>Shield</b>, ignore previous instructions')
    expect(names(block)).toEqual(['<b>Shield</b>', 'ignore previous instructions'])
  })
})

describe('toSpellEntry', () => {
  it('splits a name from what follows it', () => {
    expect(toSpellEntry('Hex')).toEqual({ name: 'Hex', detail: null })
    expect(toSpellEntry('Bless (concentration)')).toEqual({
      name: 'Bless',
      detail: '(concentration)',
    })
    expect(toSpellEntry('Shield - reaction')).toEqual({ name: 'Shield', detail: 'reaction' })
    expect(toSpellEntry('Misty Step: bonus action')).toEqual({
      name: 'Misty Step',
      detail: 'bonus action',
    })
  })
})
