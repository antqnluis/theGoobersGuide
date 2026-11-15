import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  PASSWORD,
  RANDOM_ID,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M03.2 characters and party: schema, RLS, and integrity against the real local stack.

const ROLES = ['anon', 'authenticated', 'service_role', 'public']

// Rolled-back fixture: campaign c1 owned by a1 with member b2; d4 owns campaign c2 and is not in c1.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'm2-owner@example.test'),
         ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'm2-member@example.test'),
         ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'm2-outsider@example.test');
insert into public.campaigns (id, name, owner_id)
  values ('00000000-0000-4000-8000-0000000000c1', 'M2 fixture', '00000000-0000-4000-8000-0000000000a1'),
         ('00000000-0000-4000-8000-0000000000c2', 'M2 other', '00000000-0000-4000-8000-0000000000d4');
insert into public.campaign_members (campaign_id, profile_id, role)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'member');
set constraints all immediate;
set constraints all deferred;
`
const OWNER = "'00000000-0000-4000-8000-0000000000a1'"
const MEMBER = "'00000000-0000-4000-8000-0000000000b2'"
const OUTSIDER = "'00000000-0000-4000-8000-0000000000d4'"
const CAMPAIGN = "'00000000-0000-4000-8000-0000000000c1'"
const OTHER_CAMPAIGN = "'00000000-0000-4000-8000-0000000000c2'"

// `extra` maps column names to SQL expressions.
function insertCharacter(
  campaign: string,
  owner: string,
  extra: Record<string, string> = { name: "'Fixture'" },
) {
  const columns = ['campaign_id', 'owner_id', ...Object.keys(extra)].join(', ')
  const values = [campaign, owner, ...Object.values(extra)].join(', ')
  return `insert into public.characters (${columns}) values (${values})`
}

// Committed character plus its sheet row, for API tests (the create RPC arrives in Phase 2).
function seedCharacter(
  campaignId: string,
  ownerId: string,
  name: string,
  extra: Record<string, string> = {},
) {
  const columns = ['campaign_id', 'owner_id', 'name', ...Object.keys(extra)].join(', ')
  const values = [
    `'${campaignId}'`,
    `'${ownerId}'`,
    `'${name}'`,
    ...Object.values(extra).map((value) => `'${value}'`),
  ].join(', ')
  return localDatabaseQuery(
    `with c as (insert into public.characters (${columns}) values (${values}) returning id),
          s as (insert into public.character_sheets (character_id) select id from c)
     select id from c;`,
    {},
  )
}

function characterRow(id: string) {
  return localDatabaseQuery(
    `select name || '|' || status || '|' || in_party || '|' || campaign_id || '|' || owner_id
     from public.characters where id = '${id}';`,
    {},
  )
}

test.describe('catalog and privileges', () => {
  test('RLS is on and grants are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select string_agg(relname || ':' || relrowsecurity, ',' order by relname)
         from pg_class where relnamespace = 'public'::regnamespace
           and relname in ('characters', 'character_sheets');`,
        {},
      ),
    ).toBe('character_sheets:true,characters:true')

    for (const [table, privilege, expected] of [
      ['characters', 'select', 'authenticated'],
      ['characters', 'delete', 'authenticated'],
      ['characters', 'insert', ''],
      ['characters', 'update', ''],
      ['characters', 'truncate', ''],
      ['character_sheets', 'select', 'authenticated'],
      ['character_sheets', 'insert', ''],
      ['character_sheets', 'delete', ''],
      ['character_sheets', 'update', ''],
    ]) {
      const holders = localDatabaseQuery(
        `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['anon','authenticated','service_role','public']) r
         where has_table_privilege(r, 'public.${table}', '${privilege}');`,
        {},
      )
      expect(holders, `${table} ${privilege}`).toBe(expected)
    }

    const updatable = (table: string, columns: string[]) =>
      localDatabaseQuery(
        `select string_agg(c, ',' order by c) from unnest(array[${columns.map((c) => `'${c}'`).join(',')}]) c
         where has_column_privilege('authenticated', 'public.${table}', c, 'update');`,
        {},
      )
    expect(
      updatable('characters', [
        'id',
        'campaign_id',
        'owner_id',
        'name',
        'species',
        'class_name',
        'subclass',
        'background',
        'level',
        'status',
        'in_party',
        'sheet_visibility',
        'status_changed_at',
        'created_at',
        'updated_at',
      ]),
    ).toBe('background,class_name,level,name,sheet_visibility,species,subclass')
    expect(
      updatable('character_sheets', [
        'character_id',
        'max_hp',
        'current_hp',
        'temp_hp',
        'armor_class',
        'speed',
        'sheet',
        'updated_at',
      ]),
    ).toBe('armor_class,current_hp,max_hp,sheet,speed,temp_hp')
  })

  test('private function privileges are minimal and the unique index is partial', () => {
    // The validator must be executable by authenticated: Postgres checks EXECUTE on functions
    // used in CHECK constraints against the writing role. It is pure and reads no tables.
    for (const [fn, expected] of [
      [
        'private.character_sheet_is_valid(jsonb)',
        'anon:false,authenticated:true,public:false,service_role:false',
      ],
      [
        'private.guard_character_write()',
        'anon:false,authenticated:false,public:false,service_role:false',
      ],
    ]) {
      expect(
        localDatabaseQuery(
          `select string_agg(r || ':' || has_function_privilege(r, '${fn}', 'execute'), ',' order by r)
           from unnest(array['${ROLES.join("','")}']) r;`,
          {},
        ),
        fn,
      ).toBe(expected)
    }
    const index = localDatabaseQuery(
      `select indexdef from pg_indexes where indexname = 'characters_one_active_per_player_idx';`,
      {},
    )
    expect(index).toContain('CREATE UNIQUE INDEX')
    expect(index).toContain("WHERE (status = 'active'::text)")
  })
})

test.describe('database integrity (as postgres, rolled back)', () => {
  test('a second active character for the same player is refused; a retired one is not', () => {
    expect(
      sqlError(`${fixture}
${insertCharacter(CAMPAIGN, MEMBER)};
${insertCharacter(CAMPAIGN, MEMBER)};
rollback;`),
    ).toContain('characters_one_active_per_player_idx')

    const result = localDatabaseQuery(
      `${fixture}
${insertCharacter(CAMPAIGN, MEMBER, { name: `'Old'`, status: `'retired'` })};
${insertCharacter(CAMPAIGN, MEMBER, { name: `'New'` })};
select 'count:' || count(*) from public.characters where owner_id = ${MEMBER};
rollback;`,
      {},
    )
    expect(result).toContain('count:2')
  })

  test('only an active character can be in the party', () => {
    expect(
      sqlError(`${fixture}
${insertCharacter(CAMPAIGN, MEMBER, { name: `'Old'`, status: `'retired'`, in_party: `true` })};
rollback;`),
    ).toContain('characters_party_requires_active')
    expect(
      sqlError(`${fixture}
${insertCharacter(CAMPAIGN, MEMBER, { name: `'Hero'`, in_party: `true` })};
update public.characters set status = 'deceased' where owner_id = ${MEMBER};
rollback;`),
    ).toContain('characters_party_requires_active')
  })

  test('campaign, owner, and id can never change', () => {
    for (const change of [
      `campaign_id = ${OTHER_CAMPAIGN}`,
      `owner_id = ${OWNER}`,
      `id = gen_random_uuid()`,
    ]) {
      expect(
        sqlError(`${fixture}
${insertCharacter(CAMPAIGN, MEMBER)};
update public.characters set ${change} where owner_id = ${MEMBER};
rollback;`),
        change,
      ).toContain('character_reassignment_forbidden')
    }
  })

  test('a character needs a member owner, and only members can join the party', () => {
    expect(
      sqlError(`${fixture}
${insertCharacter(CAMPAIGN, OUTSIDER)};
rollback;`),
    ).toContain('character_owner_not_member')

    // Owner leaves the roster; joining the party is then refused, leaving it is not.
    expect(
      sqlError(`${fixture}
${insertCharacter(CAMPAIGN, MEMBER)};
delete from public.campaign_members where campaign_id = ${CAMPAIGN} and profile_id = ${MEMBER};
update public.characters set in_party = true where owner_id = ${MEMBER};
rollback;`),
    ).toContain('character_owner_not_member')

    const result = localDatabaseQuery(
      `${fixture}
${insertCharacter(CAMPAIGN, MEMBER, { name: `'Hero'`, in_party: `true` })};
delete from public.campaign_members where campaign_id = ${CAMPAIGN} and profile_id = ${MEMBER};
update public.characters set in_party = false where owner_id = ${MEMBER};
select 'ok:' || in_party from public.characters where owner_id = ${MEMBER};
rollback;`,
      {},
    )
    expect(result).toContain('ok:false')
  })

  test('status_changed_at moves only when the status changes', () => {
    const result = localDatabaseQuery(
      `${fixture}
${insertCharacter(CAMPAIGN, MEMBER)};
update public.characters set status_changed_at = now() - interval '1 day';
update public.characters set name = 'Renamed';
select 'same:' || (status_changed_at < now() - interval '1 hour') from public.characters;
update public.characters set status = 'retired';
select 'moved:' || (status_changed_at > now() - interval '1 minute') from public.characters;
rollback;`,
      {},
    )
    expect(result).toContain('same:true')
    expect(result).toContain('moved:true')
  })

  test('constraints bound names, details, level, status, visibility, vitals, and the sheet body', () => {
    const bad: [Record<string, string>, string][] = [
      [{ name: "''" }, 'characters_name_check'],
      [{ name: "' padded '" }, 'characters_name_check'],
      [{ name: "repeat('x', 81)" }, 'characters_name_check'],
      [{ name: "E'tab\\there'" }, 'characters_name_check'],
      [{ name: "'ok'", species: "''" }, 'characters_details_check'],
      [{ name: "'ok'", background: "repeat('x', 61)" }, 'characters_details_check'],
      [{ name: "'ok'", level: '0' }, 'characters_level_check'],
      [{ name: "'ok'", level: '21' }, 'characters_level_check'],
      [{ name: "'ok'", status: "'missing'" }, 'characters_status_check'],
      [{ name: "'ok'", sheet_visibility: "'party'" }, 'characters_sheet_visibility_check'],
    ]
    for (const [columns, constraint] of bad) {
      expect(
        sqlError(`${fixture}
${insertCharacter(CAMPAIGN, MEMBER, columns)};
rollback;`),
        JSON.stringify(columns),
      ).toContain(constraint)
    }

    const sheetCases: [string, string][] = [
      ['max_hp => 0', 'character_sheets_hp_check'],
      ['max_hp => 10, current_hp => 11', 'character_sheets_hp_check'],
      ['temp_hp => -1', 'character_sheets_hp_check'],
      ['armor_class => 100', 'character_sheets_armor_class_check'],
      ['speed => 1000', 'character_sheets_speed_check'],
      [`sheet => '[]'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"unknown": 1}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"version": 2}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"abilities": {"str": 31}}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"abilities": {"str": 0}}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"abilities": {"str": 10.5}}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"abilities": {"luck": 10}}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"saving_throws": ["str", "str"]}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"saving_throws": ["luck"]}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"skills": {"stealth": "master"}}'::jsonb`, 'character_sheets_sheet_check'],
      [`sheet => '{"skills": {"flying": "proficient"}}'::jsonb`, 'character_sheets_sheet_check'],
      [
        `sheet => jsonb_build_object('attacks', (select jsonb_agg('{}'::jsonb) from generate_series(1, 31)))`,
        'character_sheets_sheet_check',
      ],
      [`sheet => jsonb_build_object('notes', repeat('x', 70000))`, 'character_sheets_sheet_check'],
      [`sheet => '{"experience": 1000001}'::jsonb`, 'character_sheets_sheet_check'],
    ]
    for (const [columns, constraint] of sheetCases) {
      expect(
        sqlError(`${fixture}
with c as (${insertCharacter(CAMPAIGN, MEMBER)} returning id)
insert into public.character_sheets (character_id) select id from c;
update public.character_sheets set ${columns.replaceAll(' =>', ' =')};
rollback;`),
        columns,
      ).toContain(constraint)
    }

    const valid = localDatabaseQuery(
      `${fixture}
with c as (${insertCharacter(CAMPAIGN, MEMBER)} returning id)
insert into public.character_sheets (character_id) select id from c;
update public.character_sheets set max_hp = 30, current_hp = 30, temp_hp = 5, armor_class = 16, speed = 30,
  sheet = '{"version": 1, "abilities": {"str": 18, "dex": 8}, "saving_throws": ["str", "con"],
            "skills": {"athletics": "expertise", "stealth": "proficient"},
            "attacks": [{"id": "3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10", "name": "Axe", "bonus": "+6", "damage": "1d12+4", "notes": ""}],
            "features": "Rage", "spells": "", "notes": "x", "alignment": "CN", "experience": 300}'::jsonb;
select 'valid';
rollback;`,
      {},
    )
    expect(valid).toContain('valid')
  })
})

test('cascades: campaign deletion and account deletion remove characters and sheets', () => {
  const result = localDatabaseQuery(
    `${fixture}
with c as (${insertCharacter(CAMPAIGN, MEMBER)} returning id)
insert into public.character_sheets (character_id) select id from c;
with c as (${insertCharacter(CAMPAIGN, OWNER, { name: `'Boss'` })} returning id)
insert into public.character_sheets (character_id) select id from c;
with c as (${insertCharacter(OTHER_CAMPAIGN, OUTSIDER, { name: `'Elsewhere'` })} returning id)
insert into public.character_sheets (character_id) select id from c;
delete from auth.users where id = ${MEMBER};
select 'after_account:' || (select count(*) from public.characters where campaign_id in (${CAMPAIGN}, ${OTHER_CAMPAIGN})) || ',' || (select count(*) from public.character_sheets where character_id in (select id from public.characters where campaign_id in (${CAMPAIGN}, ${OTHER_CAMPAIGN})));
delete from public.campaigns where id = ${CAMPAIGN};
select 'after_campaign:' || (select count(*) from public.characters where campaign_id in (${CAMPAIGN}, ${OTHER_CAMPAIGN})) || ',' || (select count(*) from public.character_sheets where character_id in (select id from public.characters where campaign_id in (${CAMPAIGN}, ${OTHER_CAMPAIGN})));
rollback;`,
    {},
  )
  expect(result).toContain('after_account:2,2')
  expect(result).toContain('after_campaign:1,1')
})

// --- Row-level security through the API with real accounts ---------------------------

async function newCast() {
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  return players as Record<'owner' | 'guest' | 'other' | 'outsider', Player>
}

test('visibility: private sheets are hidden from members and the campaign owner; shared sheets are read-only', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 visibility')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = seedCharacter(campaignId, guest.id, 'Private Pip')

    const summaries = async (player: Player) => {
      const { data, error } = await player.client
        .from('characters')
        .select('id')
        .eq('campaign_id', campaignId)
      expect(error).toBeNull()
      return data!.length
    }
    const sheets = async (player: Player) => {
      const { data, error } = await player.client
        .from('character_sheets')
        .select('character_id')
        .eq('character_id', characterId)
      expect(error).toBeNull()
      return data!.length
    }

    // Every current member (including the campaign owner) sees the summary; a non-member does not.
    expect([
      await summaries(owner),
      await summaries(guest),
      await summaries(other),
      await summaries(outsider),
    ]).toEqual([1, 1, 1, 0])

    // Private by default: only the character owner reads the sheet, never the campaign owner.
    expect(
      localDatabaseQuery(
        `select sheet_visibility from public.characters where id = '${characterId}';`,
        {},
      ),
    ).toBe('private')
    expect([
      await sheets(owner),
      await sheets(guest),
      await sheets(other),
      await sheets(outsider),
    ]).toEqual([0, 1, 0, 0])

    // Only the owner can share, and sharing opens the sheet to current members only.
    const denied = await other.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
      .select('id')
    expect(denied.error).toBeNull()
    expect(denied.data).toHaveLength(0)
    const ownerDenied = await owner.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
      .select('id')
    expect(ownerDenied.data).toHaveLength(0)

    const shared = await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
      .select('id')
    expect(shared.error).toBeNull()
    expect(shared.data).toHaveLength(1)
    expect([
      await sheets(owner),
      await sheets(guest),
      await sheets(other),
      await sheets(outsider),
    ]).toEqual([1, 1, 1, 0])

    for (const reader of [owner, other]) {
      const write = await reader.client
        .from('character_sheets')
        .update({ current_hp: 1, max_hp: 5 })
        .eq('character_id', characterId)
        .select('character_id')
      expect(write.data ?? []).toHaveLength(0)
    }

    // Unsharing hides it again.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'private' })
      .eq('id', characterId)
    expect([await sheets(owner), await sheets(other)]).toEqual([0, 0])

    // Leaving revokes every read, including the owner's own, and hides the character from the rest.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await summaries(guest)).toBe(0)
    expect(await sheets(guest)).toBe(0)
    expect([await summaries(owner), await summaries(other)]).toEqual([0, 0])
    expect(characterRow(characterId)).toContain('Private Pip|active|false')

    // Rejoining restores access to the same rows.
    await invite(owner, campaignId, guest)
    expect(await summaries(guest)).toBe(1)
    expect(await sheets(guest)).toBe(1)
    expect(await summaries(owner)).toBe(1)
  } finally {
    await cleanup(players, ids)
  }
})

test('the API cannot create, reassign, or force state on characters and sheets', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 bypass')
    const otherCampaignId = await createCampaign(outsider, 'M2 bypass other')
    ids.push(campaignId, otherCampaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = seedCharacter(campaignId, guest.id, 'Guarded Gus')
    const before = characterRow(characterId)

    // No INSERT grant on either table.
    for (const client of [guest.client, owner.client, outsider.client]) {
      const created = await client
        .from('characters')
        .insert({ campaign_id: campaignId, name: 'Forged' })
      expect(created.error?.code).toBe('42501')
      const sheet = await client.from('character_sheets').insert({ character_id: characterId })
      expect(sheet.error?.code).toBe('42501')
    }

    // No UPDATE grant on state or identity columns, even for the character's owner.
    for (const patch of [
      { status: 'retired' },
      { in_party: true },
      { campaign_id: otherCampaignId },
      { owner_id: owner.id },
      { status_changed_at: new Date().toISOString() },
      { id: crypto.randomUUID() },
    ]) {
      const updated = await guest.client.from('characters').update(patch).eq('id', characterId)
      expect(updated.error?.code, JSON.stringify(patch)).toBe('42501')
    }
    expect(characterRow(characterId)).toBe(before)

    // Another member and the campaign owner can neither edit nor delete someone else's character.
    for (const other_ of [owner, other, outsider]) {
      const edit = await other_.client
        .from('characters')
        .update({ name: 'Hijacked' })
        .eq('id', characterId)
        .select('id')
      expect(edit.data ?? []).toHaveLength(0)
      const remove = await other_.client
        .from('characters')
        .delete()
        .eq('id', characterId)
        .select('id')
      expect(remove.data ?? []).toHaveLength(0)
      const sheet = await other_.client
        .from('character_sheets')
        .update({ armor_class: 1 })
        .eq('character_id', characterId)
        .select('character_id')
      expect(sheet.data ?? []).toHaveLength(0)
      const sheetDelete = await other_.client
        .from('character_sheets')
        .delete()
        .eq('character_id', characterId)
      expect(sheetDelete.error?.code).toBe('42501')
    }
    expect(characterRow(characterId)).toBe(before)

    // The owner can edit summary fields and vitals within the checks.
    const rename = await guest.client
      .from('characters')
      .update({ name: 'Gus the Guarded', level: 5 })
      .eq('id', characterId)
      .select('name, level')
    expect(rename.error).toBeNull()
    expect(rename.data).toEqual([{ name: 'Gus the Guarded', level: 5 }])
    const invalidLevel = await guest.client
      .from('characters')
      .update({ level: 21 })
      .eq('id', characterId)
    expect(invalidLevel.error?.code).toBe('23514')

    const vitals = await guest.client
      .from('character_sheets')
      .update({ max_hp: 30, current_hp: 12, temp_hp: 3, armor_class: 15, speed: 30 })
      .eq('character_id', characterId)
      .select('max_hp, current_hp')
    expect(vitals.error).toBeNull()
    expect(vitals.data).toEqual([{ max_hp: 30, current_hp: 12 }])
    const overHeal = await guest.client
      .from('character_sheets')
      .update({ current_hp: 31 })
      .eq('character_id', characterId)
    expect(overHeal.error?.code).toBe('23514')

    // The sheet body is validated by the database.
    const body = await guest.client
      .from('character_sheets')
      .update({
        sheet: {
          version: 1,
          abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
          saving_throws: ['str', 'con'],
          skills: { athletics: 'proficient' },
          attacks: [
            {
              id: crypto.randomUUID(),
              name: 'Sword',
              bonus: '+5',
              damage: '1d8+3',
              notes: '',
            },
          ],
          features: 'Second Wind',
          experience: null,
        },
      })
      .eq('character_id', characterId)
      .select('character_id')
    expect(body.error).toBeNull()
    expect(body.data).toHaveLength(1)

    for (const sheet of [
      [],
      'text',
      { unknown: true },
      { version: 2 },
      { abilities: { str: 31 } },
      { abilities: { str: 0 } },
      { skills: { stealth: 'master' } },
      { saving_throws: ['str', 'str'] },
      { notes: 'x'.repeat(70_000) },
    ]) {
      const bad = await guest.client
        .from('character_sheets')
        .update({ sheet })
        .eq('character_id', characterId)
      expect(bad.error?.code, JSON.stringify(sheet).slice(0, 60)).toBe('23514')
    }

    // Deleting your own character removes its sheet and frees the slot.
    const removed = await guest.client
      .from('characters')
      .delete()
      .eq('id', characterId)
      .select('id')
    expect(removed.data).toHaveLength(1)
    expect(
      localDatabaseQuery(
        `select count(*) from public.character_sheets where character_id = '${characterId}';`,
        {},
      ),
    ).toBe('0')
    expect(RANDOM_ID).toBeTruthy()
  } finally {
    await cleanup(players, ids)
  }
})

test('deleting a campaign removes every character and sheet in it, including a departed player’s', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 cascade')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    seedCharacter(campaignId, guest.id, 'Leaver')
    seedCharacter(campaignId, other.id, 'Stayer')
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))

    const count = () =>
      localDatabaseQuery(
        `select (select count(*) from public.characters where campaign_id = '${campaignId}')
             || ',' || (select count(*) from public.character_sheets s
                        join public.characters c on c.id = s.character_id
                        where c.campaign_id = '${campaignId}');`,
        {},
      )
    expect(count()).toBe('2,2')
    const { error } = await owner.client.from('campaigns').delete().eq('id', campaignId)
    expect(error).toBeNull()
    expect(count()).toBe('0,0')
  } finally {
    await cleanup(players, ids)
  }
})

// --- Phase 2: lifecycle RPCs, departure, rejoin, concurrency -------------------------

type CharacterArgs = {
  p_name?: string
  p_species?: string | null
  p_class_name?: string | null
  p_level?: number | null
  p_in_party?: boolean | null
}

async function createCharacter(player: Player, campaignId: string, args: CharacterArgs = {}) {
  return player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: 'Hero',
    ...args,
  })
}

async function createdId(player: Player, campaignId: string, args: CharacterArgs = {}) {
  const { data, error } = await createCharacter(player, campaignId, args)
  expect(error?.message ?? null).toBeNull()
  return data as string
}

function characterState(id: string) {
  return localDatabaseQuery(
    `select status || '|' || in_party from public.characters where id = '${id}';`,
    {},
  )
}

// The three invariants of plan §4.6, for one campaign. Returns the number of violations.
function invariantViolations(campaignId: string) {
  return localDatabaseQuery(
    `select
       (select count(*) from (
          select 1 from public.characters where campaign_id = '${campaignId}' and status = 'active'
          group by owner_id having count(*) > 1) t)
     + (select count(*) from public.characters where campaign_id = '${campaignId}' and in_party and status <> 'active')
     + (select count(*) from public.characters c where c.campaign_id = '${campaignId}' and c.in_party
          and not exists (select 1 from public.campaign_members m
                          where m.campaign_id = c.campaign_id and m.profile_id = c.owner_id));`,
    {},
  )
}

test('create_character: validation, defaults, one active character, and replacement after retiring', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, outsider } = players
  const anonymous = localClient()
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 create')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    const id = await createdId(guest, campaignId, {
      p_name: '  Brand  ',
      p_species: ' Elf ',
      p_class_name: '   ',
      p_level: 3,
      p_in_party: true,
    })
    expect(
      localDatabaseQuery(
        `select name || '|' || coalesce(species, '~') || '|' || coalesce(class_name, '~') || '|' || level
           || '|' || status || '|' || in_party || '|' || sheet_visibility || '|' || owner_id
         from public.characters where id = '${id}';`,
        {},
      ),
    ).toBe(`Brand|Elf|~|3|active|true|private|${guest.id}`)
    expect(
      localDatabaseQuery(
        `select count(*) from public.character_sheets where character_id = '${id}' and temp_hp = 0 and sheet = '{"version": 1}'::jsonb;`,
        {},
      ),
    ).toBe('1')

    // Defaults: not in the party, level 1.
    const campaign2 = await createCampaign(owner, 'M2 create defaults')
    ids.push(campaign2)
    const plain = await createdId(owner, campaign2, { p_in_party: null, p_level: null })
    expect(characterState(plain)).toBe('active|false')
    expect(
      localDatabaseQuery(`select level from public.characters where id = '${plain}';`, {}),
    ).toBe('1')

    // One active character per player per campaign.
    expect((await rpcError(createCharacter(guest, campaignId))).message).toBe(
      'character_active_exists',
    )
    expect(
      localDatabaseQuery(
        `select count(*) from public.characters where campaign_id = '${campaignId}' and owner_id = '${guest.id}';`,
        {},
      ),
    ).toBe('1')

    // Retiring frees the slot (B6) and removes the party flag.
    await rpcOk(
      guest.client.rpc('set_character_status', { p_character_id: id, p_status: 'retired' }),
    )
    expect(characterState(id)).toBe('retired|false')
    const replacement = await createdId(guest, campaignId, { p_name: 'Second' })
    expect(characterState(replacement)).toBe('active|false')
    expect(invariantViolations(campaignId)).toBe('0')

    // Non-members, departed players, and unknown campaigns are indistinguishable.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    for (const [player, target] of [
      [outsider, campaignId],
      [guest, campaignId],
      [owner, RANDOM_ID],
    ] as const) {
      expect(await rpcError(createCharacter(player, target))).toEqual({
        code: 'P0001',
        message: 'character_campaign_unavailable',
      })
    }

    // Invalid arguments.
    const bad: [CharacterArgs, string][] = [
      [{ p_name: '' }, 'character_name_invalid'],
      [{ p_name: '   ' }, 'character_name_invalid'],
      [{ p_name: 'x'.repeat(81) }, 'character_name_invalid'],
      [{ p_name: 'tab\there' }, 'character_name_invalid'],
      [{ p_species: 'x'.repeat(61) }, 'character_details_invalid'],
      [{ p_class_name: 'bell\u0007' }, 'character_details_invalid'],
      [{ p_level: 0 }, 'character_level_invalid'],
      [{ p_level: 21 }, 'character_level_invalid'],
    ]
    for (const [args, message] of bad) {
      expect(await rpcError(createCharacter(owner, campaign2, args))).toEqual({
        code: '22023',
        message,
      })
    }
    expect(
      await rpcError(owner.client.rpc('create_character', { p_campaign_id: null, p_name: 'x' })),
    ).toEqual({ code: '22023', message: 'character_campaign_required' })
    expect(
      (await rpcError(anonymous.rpc('create_character', { p_campaign_id: campaign2, p_name: 'x' })))
        .code,
    ).toBe('42501')
  } finally {
    await cleanup(players, ids)
  }
})

test('status and party transitions', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  const status = (player: Player, id: string, value: string | null) =>
    player.client.rpc('set_character_status', { p_character_id: id, p_status: value as string })
  const party = (player: Player, id: string, value: boolean | null) =>
    player.client.rpc('set_character_in_party', {
      p_character_id: id,
      p_in_party: value as boolean,
    })
  try {
    const campaignId = await createCampaign(owner, 'M2 status')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const id = await createdId(guest, campaignId, { p_in_party: true })
    const before = characterState(id)

    // Only the character's owner can use either RPC; everyone else gets the same answer.
    for (const player of [owner, other, outsider]) {
      expect(await rpcError(status(player, id, 'retired'))).toEqual({
        code: 'P0001',
        message: 'character_unavailable',
      })
      expect(await rpcError(party(player, id, false))).toEqual({
        code: 'P0001',
        message: 'character_unavailable',
      })
    }
    expect(await rpcError(status(guest, RANDOM_ID, 'retired'))).toEqual({
      code: 'P0001',
      message: 'character_unavailable',
    })
    expect(characterState(id)).toBe(before)

    // Invalid arguments.
    expect((await rpcError(status(guest, id, 'dead'))).message).toBe('character_status_invalid')
    expect((await rpcError(status(guest, id, null))).code).toBe('22023')
    expect((await rpcError(party(guest, id, null))).code).toBe('22023')
    expect(
      (
        await rpcError(
          guest.client.rpc('set_character_in_party', { p_character_id: null, p_in_party: true }),
        )
      ).code,
    ).toBe('22023')

    // Same value is a no-op; leaving the party always works.
    await rpcOk(party(guest, id, true))
    await rpcOk(status(guest, id, 'active'))
    expect(characterState(id)).toBe('active|true')
    await rpcOk(party(guest, id, false))
    expect(characterState(id)).toBe('active|false')
    await rpcOk(party(guest, id, true))

    // Death clears the party flag and stamps status_changed_at.
    const stamped = (cid: string) =>
      localDatabaseQuery(
        `select status_changed_at > now() - interval '1 minute' from public.characters where id = '${cid}';`,
        {},
      )
    localDatabaseQuery(
      `update public.characters set status_changed_at = now() - interval '1 day' where id = '${id}';`,
      {},
    )
    await rpcOk(status(guest, id, 'deceased'))
    expect(characterState(id)).toBe('deceased|false')
    expect(stamped(id)).toBe('t')

    // Joining the party needs an active character.
    expect((await rpcError(party(guest, id, true))).message).toBe('character_not_active')
    await rpcOk(party(guest, id, false))

    // deceased <-> retired and back to active when the slot is free; the party flag stays off.
    await rpcOk(status(guest, id, 'retired'))
    expect(characterState(id)).toBe('retired|false')
    await rpcOk(status(guest, id, 'deceased'))
    await rpcOk(status(guest, id, 'active'))
    expect(characterState(id)).toBe('active|false')
    await rpcOk(status(guest, id, 'retired'))
    await rpcOk(status(guest, id, 'active'))
    expect(characterState(id)).toBe('active|false')

    // Reactivation is refused while another character is active.
    await rpcOk(status(guest, id, 'retired'))
    const second = await createdId(guest, campaignId, { p_name: 'Second' })
    expect((await rpcError(status(guest, id, 'active'))).message).toBe('character_active_exists')
    expect(characterState(id)).toBe('retired|false')
    await rpcOk(status(guest, second, 'deceased'))
    await rpcOk(status(guest, id, 'active'))
    expect(invariantViolations(campaignId)).toBe('0')

    // Deleting the active character frees the slot immediately.
    const removed = await guest.client.from('characters').delete().eq('id', id).select('id')
    expect(removed.data).toHaveLength(1)
    await createdId(guest, campaignId, { p_name: 'Third' })
  } finally {
    await cleanup(players, ids)
  }
})

test('leaving or removal keeps characters out of the party; rejoining does not put them back', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 departure')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const leaverId = await createdId(guest, campaignId, { p_name: 'Leaver', p_in_party: true })
    const removedId = await createdId(other, campaignId, { p_name: 'Removed', p_in_party: true })
    await rpcOk(
      guest.client.rpc('set_character_status', { p_character_id: leaverId, p_status: 'active' }),
    )
    const listed = async (player: Player) => {
      const { data } = await player.client
        .from('characters')
        .select('id')
        .eq('campaign_id', campaignId)
      return data!.length
    }
    expect(await listed(owner)).toBe(2)

    // Leave: the row survives with in_party false and the same status.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(characterState(leaverId)).toBe('active|false')
    expect(await listed(guest)).toBe(0)
    expect(await listed(owner)).toBe(1)
    expect(await listed(other)).toBe(1)

    // The departed player cannot use any character RPC.
    for (const call of [
      guest.client.rpc('set_character_in_party', { p_character_id: leaverId, p_in_party: true }),
      guest.client.rpc('set_character_status', { p_character_id: leaverId, p_status: 'retired' }),
    ]) {
      expect((await rpcError(call)).message).toBe('character_unavailable')
    }

    // Removal behaves identically.
    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: other.id,
      }),
    )
    expect(characterState(removedId)).toBe('active|false')
    expect(await listed(other)).toBe(0)
    expect(await listed(owner)).toBe(0)
    expect(invariantViolations(campaignId)).toBe('0')

    // Rejoin: the same rows return, still out of the party; no duplicate active character.
    await invite(owner, campaignId, guest)
    expect(await listed(guest)).toBe(1)
    expect(characterState(leaverId)).toBe('active|false')
    expect(
      (await rpcError(createCharacter(guest, campaignId, { p_name: 'Duplicate' }))).message,
    ).toBe('character_active_exists')
    await rpcOk(
      guest.client.rpc('set_character_in_party', { p_character_id: leaverId, p_in_party: true }),
    )
    expect(characterState(leaverId)).toBe('active|true')

    // Ownership transfer changes nothing about characters or their privacy.
    await rpcOk(
      owner.client.rpc('transfer_campaign_ownership', {
        p_campaign_id: campaignId,
        p_profile_id: guest.id,
      }),
    )
    expect(characterState(leaverId)).toBe('active|true')
    const sheet = await owner.client
      .from('character_sheets')
      .select('character_id')
      .eq('character_id', leaverId)
    expect(sheet.data).toHaveLength(0)
  } finally {
    await cleanup(players, ids)
  }
})

test('concurrent character and membership changes keep the invariants', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 concurrency')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)

    // Five parallel creates by one player: exactly one succeeds.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createCharacter(guest, campaignId, { p_name: `Racer ${index}` }),
      ),
    )
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(
      results.filter((result) => result.error?.message === 'character_active_exists'),
    ).toHaveLength(4)
    expect(invariantViolations(campaignId)).toBe('0')

    // Create racing reactivation of a retired character: exactly one active afterwards.
    const activeId = results.find((result) => !result.error)!.data as string
    await rpcOk(
      guest.client.rpc('set_character_status', { p_character_id: activeId, p_status: 'retired' }),
    )
    const [created, reactivated] = await Promise.all([
      createCharacter(guest, campaignId, { p_name: 'Late' }),
      guest.client.rpc('set_character_status', { p_character_id: activeId, p_status: 'active' }),
    ])
    expect([created.error, reactivated.error].filter(Boolean)).toHaveLength(1)
    expect(
      localDatabaseQuery(
        `select count(*) from public.characters where campaign_id = '${campaignId}' and owner_id = '${guest.id}' and status = 'active';`,
        {},
      ),
    ).toBe('1')
    expect(invariantViolations(campaignId)).toBe('0')

    // Different players do not block each other.
    const parallel = await Promise.all([
      createCharacter(other, campaignId, { p_name: 'Other Hero', p_in_party: true }),
      createCharacter(owner, campaignId, { p_name: 'Owner Hero', p_in_party: true }),
    ])
    expect(parallel.map((result) => result.error)).toEqual([null, null])

    // Joining the party racing removal: the character ends outside the party either way.
    const otherId = parallel[0].data as string
    await rpcOk(
      other.client.rpc('set_character_in_party', { p_character_id: otherId, p_in_party: false }),
    )
    await Promise.all([
      other.client.rpc('set_character_in_party', { p_character_id: otherId, p_in_party: true }),
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: other.id,
      }),
    ])
    expect(characterState(otherId)).toBe('active|false')
    expect(invariantViolations(campaignId)).toBe('0')

    // Creating with party membership racing a leave: no in-party character for a non-member.
    const guestActive = localDatabaseQuery(
      `select id from public.characters where owner_id = '${guest.id}' and status = 'active';`,
      {},
    )
    await rpcOk(
      guest.client.rpc('set_character_status', {
        p_character_id: guestActive,
        p_status: 'retired',
      }),
    )
    await Promise.all([
      createCharacter(guest, campaignId, { p_name: 'Racing', p_in_party: true }),
      guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }),
    ])
    expect(invariantViolations(campaignId)).toBe('0')
    expect(
      localDatabaseQuery(
        `select count(*) from public.characters where owner_id = '${guest.id}' and in_party;`,
        {},
      ),
    ).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})

test('character lifecycle functions are executable only by authenticated users', () => {
  for (const fn of [
    'public.create_character(uuid, text, text, text, text, text, integer, boolean)',
    'public.set_character_status(uuid, text)',
    'public.set_character_in_party(uuid, boolean)',
  ]) {
    expect(
      localDatabaseQuery(
        `select string_agg(r || ':' || has_function_privilege(r, '${fn}', 'execute'), ',' order by r)
         from unnest(array['${ROLES.join("','")}']) r;`,
        {},
      ),
      fn,
    ).toBe('anon:false,authenticated:true,public:false,service_role:false')
  }
  expect(
    localDatabaseQuery(
      `select string_agg(r || ':' || has_function_privilege(r, 'private.handle_campaign_member_departure(uuid, uuid)', 'execute'), ',' order by r)
       from unnest(array['${ROLES.join("','")}']) r;`,
      {},
    ),
  ).toBe('anon:false,authenticated:false,public:false,service_role:false')
})

test('the sheet body saves only against its previous updated_at (optimistic concurrency)', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M2 optimistic')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdId(guest, campaignId)

    const read = async () => {
      const { data, error } = await guest.client
        .from('character_sheets')
        .select('updated_at')
        .eq('character_id', characterId)
        .single()
      expect(error).toBeNull()
      return data!.updated_at
    }
    const save = (features: string, previous: string) =>
      guest.client
        .from('character_sheets')
        .update({ sheet: { version: 1, features } })
        .eq('character_id', characterId)
        .eq('updated_at', previous)
        .select('updated_at')
        .maybeSingle()

    const first = await read()
    const saved = await save('First', first)
    expect(saved.error).toBeNull()
    expect(saved.data?.updated_at).not.toBe(first)

    // A second device still holding the old stamp matches no row.
    const stale = await save('Second', first)
    expect(stale.error).toBeNull()
    expect(stale.data).toBeNull()

    // A vitals patch moves the stamp too; the cache must adopt the returned row.
    const patched = await guest.client
      .from('character_sheets')
      .update({ current_hp: 3 })
      .eq('character_id', characterId)
      .select('updated_at')
      .single()
    expect((await save('Third', saved.data!.updated_at)).data).toBeNull()
    expect((await save('Third', patched.data!.updated_at)).data).not.toBeNull()
  } finally {
    await cleanup(players, ids)
  }
})

test('portraits: only the owner writes; campaign members read; outsiders and other members cannot', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  const png = () =>
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
  try {
    const campaignId = await createCampaign(owner, 'M2 portraits')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = seedCharacter(campaignId, guest.id, 'Pictured Pip')
    const otherCharacterId = seedCharacter(campaignId, other.id, 'Other Olive')
    const path = `${characterId}/${crypto.randomUUID()}.png`
    const bucket = (player: Player) => player.client.storage.from('character-portraits')

    // Another member cannot put a picture on someone else's character; neither can an outsider.
    expect(
      (await bucket(other).upload(`${characterId}/${crypto.randomUUID()}.png`, png())).error,
    ).not.toBeNull()
    expect(
      (await bucket(outsider).upload(`${characterId}/${crypto.randomUUID()}.png`, png())).error,
    ).not.toBeNull()
    // Nor a file at a path that names no character, or of a type the bucket refuses.
    expect(
      (await bucket(guest).upload(`${RANDOM_ID}/${crypto.randomUUID()}.png`, png())).error,
    ).not.toBeNull()
    const gif = new Blob(['GIF89a'], { type: 'image/gif' })
    expect(
      (await bucket(guest).upload(`${characterId}/${crypto.randomUUID()}.png`, gif)).error,
    ).not.toBeNull()

    // The owner can, and points the row at it.
    expect((await bucket(guest).upload(path, png(), { contentType: 'image/png' })).error).toBeNull()
    const set = await guest.client
      .from('characters')
      .update({ portrait_path: path })
      .eq('id', characterId)
      .select('id')
      .maybeSingle()
    expect(set.error).toBeNull()
    expect(set.data).not.toBeNull()

    // The path must name this character: someone else's folder is refused by the database.
    const foreign = await guest.client
      .from('characters')
      .update({ portrait_path: `${otherCharacterId}/${crypto.randomUUID()}.png` })
      .eq('id', characterId)
      .select('id')
    expect(foreign.error).not.toBeNull()
    // And a member cannot change another player's character row.
    const stolen = await other.client
      .from('characters')
      .update({ portrait_path: null })
      .eq('id', characterId)
      .select('id')
    expect(stolen.data ?? []).toHaveLength(0)

    // Members of the campaign read it (owner of the campaign, the player, another member).
    for (const player of [owner, guest, other]) {
      const signed = await bucket(player).createSignedUrl(path, 60)
      expect(signed.error).toBeNull()
      expect(signed.data?.signedUrl).toBeTruthy()
    }
    // Outsiders get nothing.
    expect((await bucket(outsider).createSignedUrl(path, 60)).error).not.toBeNull()

    // Only the owner removes it.
    await bucket(other).remove([path])
    expect((await bucket(guest).createSignedUrl(path, 60)).error).toBeNull()
    expect((await bucket(guest).remove([path])).error).toBeNull()
    expect((await bucket(guest).createSignedUrl(path, 60)).error).not.toBeNull()
  } finally {
    await cleanup(players, ids)
  }
})

test('a player creates a character in the tent and a second player opens it from the Party panel', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { players } = await newPlayers(['owner', 'guest'])
  const { owner, guest } = players
  const ids: string[] = []
  // Light on resources: one context at a time, reduced motion, no screenshots or video.
  const signIn = async (player: Player) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(`${player.username}@example.com`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns$/)
    return { context, page }
  }
  try {
    const campaignId = await createCampaign(owner, 'M2 real-stack characters')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    // The first player creates a character; it persists across a reload.
    const first = await signIn(owner)
    try {
      const { page } = first
      await page.goto(`/app/campaigns/${campaignId}`)
      await page
        .locator('.camp-directory')
        .getByRole('button', { name: /^My characters/ })
        .click()
      const tent = page.getByRole('dialog', { name: 'My characters' })
      await tent.getByRole('button', { name: 'Create a character' }).click()
      await tent.getByLabel('Name', { exact: true }).fill('Brand')
      await tent.getByLabel(/Species/).fill('Elf')
      await tent.getByLabel(/Class/).fill('Fighter')
      await tent.getByRole('button', { name: 'Create character' }).click()
      await expect(tent.getByRole('heading', { name: 'Brand' })).toBeVisible()
      await expect(
        tent.getByRole('list', { name: 'Character standing' }).getByText('In the party'),
      ).toBeVisible()

      await page.reload()
      await page
        .locator('.camp-directory')
        .getByRole('button', { name: /^My characters/ })
        .click()
      await expect(
        page.getByRole('dialog', { name: 'My characters' }).getByRole('heading', { name: 'Brand' }),
      ).toBeVisible()
    } finally {
      await first.context.close()
    }

    // The second player sees them in the party, but not their private sheet.
    const second = await signIn(guest)
    try {
      const { page } = second
      await page.goto(`/app/campaigns/${campaignId}`)
      const openParty = async () => {
        await page
          .locator('.camp-directory')
          .getByRole('button', { name: /^Party/ })
          .click()
        return page.getByRole('dialog', { name: 'People in this campaign' })
      }
      const party = await openParty()
      await expect(party.getByText('1 of 2 members have a character in the party.')).toBeVisible()
      await expect(party.getByText('Brand')).toBeVisible()
      await expect(party.getByRole('button', { name: "View Brand's sheet" })).toHaveCount(0)

      // The owner shares the sheet (through the API); a reload shows the button.
      const shared = await owner.client
        .from('characters')
        .update({ sheet_visibility: 'campaign' })
        .eq('campaign_id', campaignId)
        .select('id')
      expect(shared.error).toBeNull()
      expect(shared.data).toHaveLength(1)
      await page.reload()
      const reopened = await openParty()
      await reopened.getByRole('button', { name: "View Brand's sheet" }).click()
      await expect(reopened.getByRole('heading', { name: 'Vitals' })).toBeVisible()
      await expect(reopened.locator('.character-sheet')).toHaveAttribute('data-read-only', 'true')
    } finally {
      await second.context.close()
    }
  } finally {
    await cleanup(players, ids)
  }
})
