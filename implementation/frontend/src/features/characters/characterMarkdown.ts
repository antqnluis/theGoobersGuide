import {
  abilityKeys,
  type CharacterItem,
  type CharacterSheet,
  type CharacterSummary,
} from './characterTypes'
import {
  abilityLabels,
  abilityModifier,
  formatModifier,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  skillList,
} from './characterSheetRules'

/** A table cell: no pipes or line breaks, so one row stays one row. */
function cell(text: string) {
  return (
    text
      .replace(/\|/g, '\\|')
      .replace(/\s*\n\s*/g, ' ')
      .trim() || '—'
  )
}

/** A free-text block, kept as written. */
function block(heading: string, text: string) {
  return text.trim() === '' ? [] : [`## ${heading}`, '', text.trim(), '']
}

function value(text: number | null) {
  return text === null ? '—' : String(text)
}

/**
 * A readable Markdown copy of a character (M03.8 D4). It reads the same data the sheet shows
 * and derives modifiers the way the sheet does; nothing here is stored or imported back.
 */
export function toCharacterMarkdown(
  character: CharacterSummary,
  sheet: CharacterSheet,
  items: CharacterItem[],
): string {
  const body = sheet.sheet
  const level = character.level
  const lines: string[] = [`# ${character.name.replace(/\n/g, ' ')}`, '']

  const identity = [
    [character.species, character.class_name, character.subclass].filter(Boolean).join(' '),
    `Level ${level}`,
    character.background ? `${character.background} background` : '',
    body.alignment,
  ].filter(Boolean)
  lines.push(identity.join(' · '), '')
  if (body.experience !== null)
    lines.push(`Experience: ${body.experience.toLocaleString('en-US')}`, '')

  lines.push(
    '## Vitals',
    '',
    `- Hit points: ${value(sheet.current_hp)} / ${value(sheet.max_hp)}`,
    `- Temporary hit points: ${sheet.temp_hp}`,
    `- Armor class: ${value(sheet.armor_class)}`,
    `- Speed: ${sheet.speed === null ? '—' : `${sheet.speed} ft.`}`,
    `- Initiative: ${formatModifier(initiativeBonus(body))}`,
    `- Proficiency bonus: ${formatModifier(proficiencyBonus(level))}`,
    `- Passive Perception: ${passivePerception(body, level)}`,
    '',
    '## Abilities',
    '',
    '| Ability | Score | Modifier | Saving throw |',
    '| --- | --- | --- | --- |',
  )
  for (const key of abilityKeys) {
    const proficient = body.saving_throws.includes(key)
    lines.push(
      `| ${abilityLabels[key]} | ${body.abilities[key]} | ${formatModifier(abilityModifier(body.abilities[key]))} | ${formatModifier(savingThrowBonus(body, level, key))}${proficient ? ' (proficient)' : ''} |`,
    )
  }
  lines.push('')

  const skills = skillList.filter((skill) => body.skills[skill.key])
  lines.push('## Skills', '')
  if (skills.length === 0) lines.push('_None_')
  for (const skill of skills) {
    lines.push(
      `- ${skill.label}: ${formatModifier(skillBonus(body, level, skill.key))} (${body.skills[skill.key]})`,
    )
  }
  lines.push('', '## Attacks', '')
  if (body.attacks.length === 0) {
    lines.push('_None_')
  } else {
    lines.push('| Attack | Bonus | Damage | Notes |', '| --- | --- | --- | --- |')
    for (const attack of body.attacks) {
      lines.push(
        `| ${cell(attack.name)} | ${cell(attack.bonus)} | ${cell(attack.damage)} | ${cell(attack.notes)} |`,
      )
    }
  }

  lines.push('', '## Inventory', '')
  if (items.length === 0) {
    lines.push('_None_')
  } else {
    lines.push('| Item | Qty | Weight | Notes |', '| --- | --- | --- | --- |')
    for (const item of items) {
      const flags = [item.equipped ? 'equipped' : '', item.attuned ? 'attuned' : ''].filter(Boolean)
      const notes = [flags.join(', '), item.description ?? ''].filter(Boolean).join(' — ')
      lines.push(
        `| ${cell(item.name)} | ${item.quantity} | ${item.weight === null ? '—' : item.weight} | ${cell(notes)} |`,
      )
    }
  }

  lines.push(
    '',
    '## Coins',
    '',
    `Copper ${sheet.cp} · Silver ${sheet.sp} · Gold ${sheet.gp}`,
    '',
    ...block('Features', body.features),
    ...block('Spells', body.spells),
    ...block('Notes', body.notes),
  )

  return `${lines.join('\n').trimEnd()}\n`
}
