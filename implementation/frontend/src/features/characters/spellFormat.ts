/**
 * Reads the free-text spells field into groups for display. The text stays the stored value
 * (and what the import documents carry); this only decides how it is shown. Lines it cannot
 * place stay as plain text, so nothing is ever dropped or reworded.
 */

export type SpellEntry = {
  /** The spell's name, as written. */
  name: string
  /** What follows the name: a parenthetical or a note, as written. */
  detail: string | null
}

export type SpellBlock =
  | {
      kind: 'group'
      /** For example "1st level", "Cantrips", or "Warlock spells". */
      title: string
      /** A short mark for the group's badge: a level number, "C" for cantrips, or null. */
      mark: string | null
      /** For example "3 slots", when the heading says so. */
      slots: string | null
      spells: SpellEntry[]
    }
  | { kind: 'text'; text: string }

const bullet = /^(?:[-*•–]\s+|\d+[.)]\s+)(.+)$/
const markdownHeading = /^#{1,4}\s*(.+?)\s*#*$/
const slotsInTitle = /^(.*?)\s*[([]\s*([^)\]]*\bslots?\b[^)\]]*?)\s*[)\]]\s*$/i

/** Splits on commas and semicolons that are not inside brackets. */
function splitSpells(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    if ((char === ',' || char === ';') && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** "Fireball (3rd, concentration)" becomes a name and its detail. */
export function toSpellEntry(text: string): SpellEntry {
  const trimmed = text.trim()
  const match = /^(.+?)(\s+[(—–-]\s*.*|\s*[([].*|:\s+.*)$/.exec(trimmed)
  if (!match) return { name: trimmed, detail: null }
  const name = match[1].trim()
  const detail = match[2]
    .trim()
    .replace(/^[—–-]\s*/, '')
    .replace(/^:\s*/, '')
  return name ? { name, detail: detail || null } : { name: trimmed, detail: null }
}

function describeTitle(raw: string): { title: string; mark: string | null; slots: string | null } {
  let title = raw.trim().replace(/[:：]\s*$/, '')
  let slots: string | null = null
  const withSlots = slotsInTitle.exec(title)
  if (withSlots && withSlots[1].trim()) {
    title = withSlots[1].trim()
    slots = withSlots[2].trim()
  }
  const lower = title.toLowerCase()
  let mark: string | null = null
  if (/^cantrips?\b/.test(lower)) mark = 'C'
  else {
    const level =
      /^(\d+)(?:st|nd|rd|th)?[\s-]*level\b|^level\s+(\d+)\b|^spell level\s+(\d+)\b/.exec(lower)
    if (level) mark = level[1] ?? level[2] ?? level[3]
  }
  return { title, mark, slots }
}

const spellish =
  /spell|cantrip|level|ritual|domain|always|prepared|known|innate|at will|per (day|rest)|\/day|circle|patron|bonus|invocation|pact|favored|oath/i
const notAGroup =
  /\b(ability|save|dc|attack|modifier|proficiency|bonus to hit)\b|\bslots?$|^spells? (known|prepared) (count|total)$/i

/**
 * Whether a "Title: rest" line starts a group, rather than being a fact or a sentence with a
 * colon ("Spellcasting ability: Wisdom").
 */
function isGroupTitle(title: string, rest: string): boolean {
  const bare = title.replace(/\(.*?\)|\[.*?\]/g, '').trim()
  if (bare.length === 0 || title.trim().length > 48 || /[.!?]/.test(bare) || bare.includes(',')) {
    return false
  }
  if (notAGroup.test(bare)) return false
  // "Fighter Spell Slots: None." says there is nothing, so there is no group to show.
  if (/^(none|n\/a|no spells?)\.?$/i.test(rest.trim())) return false
  return spellish.test(bare) || rest.trim() === '' || /[,;]/.test(rest)
}

type Group = Extract<SpellBlock, { kind: 'group' }>

export function parseSpells(text: string): SpellBlock[] {
  const blocks: SpellBlock[] = []
  let group: Group | null = null
  let prose: string[] = []

  const flushProse = () => {
    if (prose.length > 0) blocks.push({ kind: 'text', text: prose.join('\n') })
    prose = []
  }
  const open = (title: string, mark: string | null, slots: string | null): Group => {
    flushProse()
    const created: Group = { kind: 'group', title, mark, slots, spells: [] }
    blocks.push(created)
    return created
  }
  const openTitled = (raw: string): Group => {
    const described = describeTitle(raw)
    return open(described.title, described.mark, described.slots)
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') {
      // A blank line ends the group; plain text after it is prose again.
      group = null
      continue
    }
    const heading = markdownHeading.exec(line)
    if (heading) {
      group = openTitled(heading[1])
      continue
    }
    const listed = bullet.exec(line)
    if (listed && group) {
      group.spells.push(toSpellEntry(listed[1]))
      continue
    }
    const colon = line.indexOf(':')
    if (colon > 0 && isGroupTitle(line.slice(0, colon), line.slice(colon + 1))) {
      group = openTitled(line.slice(0, colon))
      group.spells.push(...splitSpells(line.slice(colon + 1)).map(toSpellEntry))
      continue
    }
    if (listed) {
      // A bullet with no heading above it joins a group of loose spells.
      group = open('', null, null)
      group.spells.push(toSpellEntry(listed[1]))
      continue
    }
    if (group) {
      group.spells.push(...splitSpells(line).map(toSpellEntry))
      continue
    }
    prose.push(line)
  }
  flushProse()
  // A heading with nothing under it is not worth a card; show it as the text it was.
  return blocks.map((block) =>
    block.kind === 'group' && block.spells.length === 0
      ? {
          kind: 'text' as const,
          text: block.slots ? `${block.title} (${block.slots})` : block.title,
        }
      : block,
  )
}
