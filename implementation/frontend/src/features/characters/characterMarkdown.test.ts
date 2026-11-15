import { describe, expect, it } from 'vitest'
import { toCharacterMarkdown } from './characterMarkdown'
import { character, item, sheet } from './characterTestData'
import { defaultSheetBody } from './characterValidation'

describe('toCharacterMarkdown', () => {
  it('writes a full character', () => {
    const markdown = toCharacterMarkdown(
      character({
        name: 'Arlen Vale',
        species: 'Human',
        class_name: 'Ranger',
        subclass: 'Gloom Stalker',
        background: 'Outlander',
        level: 5,
      }),
      sheet({
        max_hp: 44,
        current_hp: 31,
        temp_hp: 3,
        armor_class: 16,
        speed: 35,
        cp: 4,
        sp: 7,
        gp: 112,
        sheet: {
          ...defaultSheetBody(),
          abilities: { str: 12, dex: 18, con: 14, int: 10, wis: 16, cha: 8 },
          saving_throws: ['str', 'dex'],
          skills: { survival: 'proficient', stealth: 'expertise', perception: 'proficient' },
          attacks: [
            {
              id: 'a',
              name: 'Longbow',
              bonus: '+7',
              damage: '1d8 + 4 piercing',
              notes: '150/600 ft.',
            },
            {
              id: 'b',
              name: 'Pipe | Dagger',
              bonus: '+7',
              damage: '1d4 + 4',
              notes: 'Thrown\n20/60 ft.',
            },
          ],
          features: 'Favored Enemy: goblins.\nNatural Explorer.',
          spells: "1st level: Hunter's Mark",
          notes: 'Keeps watch at dusk.',
          alignment: 'Neutral good',
          experience: 6500,
        },
      }),
      [
        item({ id: '1', name: 'Rope', quantity: 1, weight: 10, description: '50 ft., hempen' }),
        item({
          id: '2',
          name: 'Cloak',
          quantity: 1,
          equipped: true,
          attuned: true,
          description: 'Elven',
        }),
        item({ id: '3', name: 'Torch', quantity: 5 }),
      ],
    )
    expect(markdown).toMatchInlineSnapshot(`
      "# Arlen Vale

      Human Ranger Gloom Stalker · Level 5 · Outlander background · Neutral good

      Experience: 6,500

      ## Vitals

      - Hit points: 31 / 44
      - Temporary hit points: 3
      - Armor class: 16
      - Speed: 35 ft.
      - Initiative: +4
      - Proficiency bonus: +3
      - Passive Perception: 16

      ## Abilities

      | Ability | Score | Modifier | Saving throw |
      | --- | --- | --- | --- |
      | Strength | 12 | +1 | +4 (proficient) |
      | Dexterity | 18 | +4 | +7 (proficient) |
      | Constitution | 14 | +2 | +2 |
      | Intelligence | 10 | +0 | +0 |
      | Wisdom | 16 | +3 | +3 |
      | Charisma | 8 | −1 | −1 |

      ## Skills

      - Perception: +6 (proficient)
      - Stealth: +10 (expertise)
      - Survival: +6 (proficient)

      ## Attacks

      | Attack | Bonus | Damage | Notes |
      | --- | --- | --- | --- |
      | Longbow | +7 | 1d8 + 4 piercing | 150/600 ft. |
      | Pipe \\| Dagger | +7 | 1d4 + 4 | Thrown 20/60 ft. |

      ## Inventory

      | Item | Qty | Weight | Notes |
      | --- | --- | --- | --- |
      | Rope | 1 | 10 | 50 ft., hempen |
      | Cloak | 1 | — | equipped, attuned — Elven |
      | Torch | 5 | — | — |

      ## Coins

      Copper 4 · Silver 7 · Gold 112

      ## Features

      Favored Enemy: goblins.
      Natural Explorer.

      ## Spells

      1st level: Hunter's Mark

      ## Notes

      Keeps watch at dusk.
      "
    `)
  })

  it('writes an empty character without gaps or placeholders for missing text', () => {
    const markdown = toCharacterMarkdown(
      character({
        name: 'Blank',
        species: null,
        class_name: null,
        subclass: null,
        background: null,
        level: 1,
      }),
      sheet({ max_hp: null, current_hp: null, armor_class: null, speed: null }),
      [],
    )
    expect(markdown).toMatchInlineSnapshot(`
      "# Blank

      Level 1

      ## Vitals

      - Hit points: — / —
      - Temporary hit points: 0
      - Armor class: —
      - Speed: —
      - Initiative: +0
      - Proficiency bonus: +2
      - Passive Perception: 10

      ## Abilities

      | Ability | Score | Modifier | Saving throw |
      | --- | --- | --- | --- |
      | Strength | 10 | +0 | +0 |
      | Dexterity | 10 | +0 | +0 |
      | Constitution | 10 | +0 | +0 |
      | Intelligence | 10 | +0 | +0 |
      | Wisdom | 10 | +0 | +0 |
      | Charisma | 10 | +0 | +0 |

      ## Skills

      _None_

      ## Attacks

      _None_

      ## Inventory

      _None_

      ## Coins

      Copper 0 · Silver 0 · Gold 0
      "
    `)
  })

  it('ends with one newline and keeps table rows on one line', () => {
    const markdown = toCharacterMarkdown(
      character({ name: 'Multi\nLine' }),
      sheet({
        sheet: {
          ...defaultSheetBody(),
          attacks: [{ id: 'a', name: 'A|B', bonus: '', damage: '', notes: 'x\ny' }],
        },
      }),
      [item({ name: 'Pipe|Item', description: 'two\nlines' })],
    )
    expect(markdown.endsWith('\n')).toBe(true)
    expect(markdown.endsWith('\n\n')).toBe(false)
    expect(markdown).toContain('# Multi Line')
    expect(markdown).toContain('| A\\|B | — | — | x y |')
    expect(markdown).toContain('| Pipe\\|Item | 1 | — | two lines |')
  })
})
