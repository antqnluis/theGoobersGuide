import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  PASSWORD,
  RANDOM_ID,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M03.5 adventures: schema, RLS, and integrity against the real local stack (Phase 1), and the
// map table's board with real accounts (Phase 5).

const ROLES = ['anon', 'authenticated', 'service_role', 'public']
const TABLES = [
  'adventures',
  'adventure_participants',
  'adventure_objectives',
  'adventure_updates',
] as const

const A1 = "'00000000-0000-4000-8000-0000000005a1'"
const B2 = "'00000000-0000-4000-8000-0000000005b2'"
const C1 = "'00000000-0000-4000-8000-0000000005c1'"
const C2 = "'00000000-0000-4000-8000-0000000005c2'"
const E1 = "'00000000-0000-4000-8000-0000000005e1'"
const E2 = "'00000000-0000-4000-8000-0000000005e2'"
const E3 = "'00000000-0000-4000-8000-0000000005e3'"
const P1 = "'00000000-0000-4000-8000-0000000005f1'"
const M1 = "'00000000-0000-4000-8000-0000000005f2'"

// Rolled-back fixture: campaign c1 owned by a1 with member b2; campaign c2 owned by a1.
// Characters: e1 (b2, c1), e2 (a1, c2), e3 (a1, c1). Adventures in c1: p1 personal for b2's e1,
// m1 main created by a1.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values (${A1}, 'authenticated', 'authenticated', 'm5-owner@example.test'),
         (${B2}, 'authenticated', 'authenticated', 'm5-member@example.test');
insert into public.campaigns (id, name, owner_id)
  values (${C1}, 'M5 fixture', ${A1}), (${C2}, 'M5 other', ${A1});
insert into public.campaign_members (campaign_id, profile_id, role) values (${C1}, ${B2}, 'member');
insert into public.characters (id, campaign_id, owner_id, name)
  values (${E1}, ${C1}, ${B2}, 'Fixture'), (${E2}, ${C2}, ${A1}, 'Elsewhere'),
         (${E3}, ${C1}, ${A1}, 'Owner hero');
insert into public.character_sheets (character_id) values (${E1}), (${E2}), (${E3});
insert into public.adventures (id, campaign_id, created_by, type, visibility, title)
  values (${P1}, ${C1}, ${B2}, 'personal', 'participants', 'Solo'),
         (${M1}, ${C1}, ${A1}, 'main', 'campaign', 'Story');
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id)
  values (${P1}, ${C1}, ${E1}, ${B2});
`

const asUser = (id: string) =>
  `select set_config('request.jwt.claims', '{"sub":${id.replace(/'/g, '"')},"role":"authenticated"}', true);`

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

function resultLine(output: string) {
  return output.split('\n').find((line) => line.startsWith('result|'))
}

function columnsWith(table: string, role: string, privilege: string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(attname, ',' order by attname), '') from pg_attribute
     where attrelid = 'public.${table}'::regclass and attnum > 0 and not attisdropped
       and has_column_privilege('${role}', 'public.${table}', attname, '${privilege}');`,
    {},
  )
}

test.describe('catalog and privileges', () => {
  test('RLS is on and the table grants are exactly the planned set', () => {
    for (const table of TABLES) {
      expect(
        localDatabaseQuery(
          `select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`,
          {},
        ),
        table,
      ).toBe('t')
    }

    const expected: Record<string, Record<string, string>> = {
      adventures: { select: 'authenticated', delete: '', insert: '', update: '' },
      adventure_participants: { select: 'authenticated', delete: '', insert: '', update: '' },
      adventure_objectives: {
        select: 'authenticated',
        delete: 'authenticated',
        insert: '',
        update: '',
      },
      adventure_updates: {
        select: 'authenticated',
        delete: 'authenticated',
        insert: '',
        update: '',
      },
    }
    for (const table of TABLES) {
      for (const privilege of [
        'select',
        'insert',
        'update',
        'delete',
        'truncate',
        'references',
        'trigger',
      ]) {
        expect(
          holders((r) => `has_table_privilege(${r}, 'public.${table}', '${privilege}')`),
          `${table} ${privilege}`,
        ).toBe(expected[table][privilege] ?? '')
      }
    }

    expect(columnsWith('adventures', 'authenticated', 'insert')).toBe('')
    expect(columnsWith('adventures', 'authenticated', 'update')).toBe(
      'archived_at,description,next_step,reference,status,title,type',
    )
    expect(columnsWith('adventure_participants', 'authenticated', 'insert')).toBe('')
    expect(columnsWith('adventure_participants', 'authenticated', 'update')).toBe('')
    expect(columnsWith('adventure_objectives', 'authenticated', 'insert')).toBe(
      'adventure_id,title',
    )
    expect(columnsWith('adventure_objectives', 'authenticated', 'update')).toBe('done,title')
    expect(columnsWith('adventure_updates', 'authenticated', 'insert')).toBe('adventure_id,body')
    expect(columnsWith('adventure_updates', 'authenticated', 'update')).toBe('')
    for (const table of TABLES) {
      for (const role of ['anon', 'service_role', 'public']) {
        for (const privilege of ['select', 'insert', 'update']) {
          expect(columnsWith(table, role, privilege), `${table} ${role} ${privilege}`).toBe('')
        }
      }
    }
  })

  test('functions, policies, triggers, and the departure hook are as planned', () => {
    const executable = (signature: string) =>
      holders((r) => `has_function_privilege(${r}, '${signature}', 'execute')`)
    expect(executable('public.create_adventure(uuid, text, text, uuid, text, text)')).toBe(
      'authenticated',
    )
    expect(executable('private.visible_adventure_ids()')).toBe('authenticated')
    expect(executable('private.editable_adventure_ids()')).toBe('authenticated')
    for (const guard of [
      'private.guard_adventure_write()',
      'private.guard_adventure_participant_write()',
      'private.guard_adventure_objective_write()',
      'private.guard_adventure_update_insert()',
      'private.after_adventure_participant_delete()',
    ]) {
      expect(executable(guard), guard).toBe('')
    }

    const policies = (table: string) =>
      localDatabaseQuery(
        `select string_agg(cmd, ',' order by cmd) from pg_policies
         where schemaname = 'public' and tablename = '${table}';`,
        {},
      )
    expect(policies('adventures')).toBe('SELECT,UPDATE')
    expect(
      localDatabaseQuery(
        `select policyname from pg_policies where schemaname = 'public' and tablename = 'adventures' and cmd = 'UPDATE';`,
        {},
      ),
    ).toBe('Writers edit their adventures')
    expect(policies('adventure_participants')).toBe('SELECT')
    expect(policies('adventure_objectives')).toBe('DELETE,INSERT,SELECT,UPDATE')
    expect(policies('adventure_updates')).toBe('DELETE,INSERT,SELECT')

    const triggers = (table: string) =>
      localDatabaseQuery(
        `select string_agg(tgname, ',' order by tgname) from pg_trigger
         where tgrelid = 'public.${table}'::regclass and not tgisinternal;`,
        {},
      )
    // M6 adds the reconcile-on-archive trigger and the deferred consent constraint triggers.
    expect(triggers('adventures')).toBe(
      'adventures_check_share_consent,adventures_guard_write,adventures_reconcile_on_archive,adventures_set_updated_at',
    )
    expect(triggers('adventure_participants')).toBe(
      'adventure_participants_after_delete,adventure_participants_check_share_consent,adventure_participants_guard_write',
    )
    expect(triggers('adventure_objectives')).toBe(
      'adventure_objectives_guard_write,adventure_objectives_set_updated_at',
    )
    expect(triggers('adventure_updates')).toBe('adventure_updates_guard_insert')

    // M6 D9: the departure hook now handles adventure participations.
    expect(
      localDatabaseQuery(
        `select prosrc ~ 'adventure_participants' from pg_proc
         where oid = 'private.handle_campaign_member_departure(uuid, uuid)'::regprocedure;`,
        {},
      ),
    ).toBe('t')
  })
})

test.describe('database integrity (as postgres, rolled back)', () => {
  test('checks bound every text field, type, status, and visibility', () => {
    const insertAdventure = (columns: Record<string, string>) => {
      const all = {
        campaign_id: C1,
        created_by: A1,
        type: "'main'",
        visibility: "'campaign'",
        title: "'T'",
        ...columns,
      }
      return `insert into public.adventures (${Object.keys(all).join(', ')}) values (${Object.values(all).join(', ')});`
    }
    const bad: [string, string][] = [
      [insertAdventure({ title: "''" }), 'adventures_title_check'],
      [insertAdventure({ title: "' padded '" }), 'adventures_title_check'],
      [insertAdventure({ title: "repeat('x', 121)" }), 'adventures_title_check'],
      [insertAdventure({ title: "E'line\\nbreak'" }), 'adventures_title_check'],
      [insertAdventure({ description: "repeat('x', 4001)" }), 'adventures_description_check'],
      [insertAdventure({ description: "E'bell\\x07'" }), 'adventures_description_check'],
      [insertAdventure({ next_step: "repeat('x', 281)" }), 'adventures_next_step_check'],
      [insertAdventure({ next_step: "E'two\\nlines'" }), 'adventures_next_step_check'],
      [insertAdventure({ next_step: "' padded'" }), 'adventures_next_step_check'],
      [insertAdventure({ reference: "repeat('x', 281)" }), 'adventures_reference_check'],
      [insertAdventure({ reference: "E'tab\\there'" }), 'adventures_reference_check'],
      [insertAdventure({ type: "'quest'" }), 'adventures_type_check'],
      [insertAdventure({ status: "'done'" }), 'adventures_status_check'],
      [insertAdventure({ visibility: "'everyone'" }), 'adventures_visibility_check'],
      // M6: 'party' is a valid value, but never for main.
      [insertAdventure({ visibility: "'party'" }), 'adventures_visibility_matches_type'],
      [insertAdventure({ visibility: "'participants'" }), 'adventures_visibility_matches_type'],
      [
        insertAdventure({ type: "'side'", visibility: "'campaign'" }),
        'adventures_visibility_matches_type',
      ],
      [
        `insert into public.adventure_objectives (adventure_id, title) values (${M1}, '');`,
        'adventure_objectives_title_check',
      ],
      [
        `insert into public.adventure_objectives (adventure_id, title) values (${M1}, repeat('x', 201));`,
        'adventure_objectives_title_check',
      ],
      [
        `insert into public.adventure_updates (adventure_id, author_id, body) values (${M1}, ${A1}, '');`,
        'adventure_updates_body_check',
      ],
      [
        `insert into public.adventure_updates (adventure_id, author_id, body) values (${M1}, ${A1}, repeat('x', 2001));`,
        'adventure_updates_body_check',
      ],
      [
        `insert into public.adventure_updates (adventure_id, author_id, body) values (${M1}, ${A1}, E'bell\\x07');`,
        'adventure_updates_body_check',
      ],
    ]
    for (const [sql, constraint] of bad) {
      expect(sqlError(`${fixture}\n${sql}\nrollback;`), sql).toContain(constraint)
    }

    const good = [
      insertAdventure({ title: "repeat('x', 120)" }),
      insertAdventure({ description: "E'line one\\n\\tindented\\r\\nthree'" }),
      insertAdventure({ description: "repeat('x', 4000)", next_step: "repeat('x', 280)" }),
      insertAdventure({ reference: "repeat('x', 280)", status: "'on_hold'" }),
      `insert into public.adventure_objectives (adventure_id, title) values (${M1}, repeat('x', 200));`,
      `insert into public.adventure_updates (adventure_id, author_id, body) values (${M1}, ${A1}, E'one\\n\\ttwo');`,
    ]
    for (const sql of good) {
      expect(sqlError(`${fixture}\n${sql}\nrollback;`), sql).toBe('')
    }
  })

  test('keys and visibility never change, and main never changes type', () => {
    for (const change of [
      `campaign_id = ${C2}`,
      `created_by = ${B2}`,
      `id = gen_random_uuid()`,
      `created_at = created_at - interval '1 day'`,
    ]) {
      expect(
        sqlError(`${fixture}\nupdate public.adventures set ${change} where id = ${M1};\nrollback;`),
        change,
      ).toContain('adventure_reassignment_forbidden')
    }
    // M6: visibility may change only to the derived value.
    for (const [id, visibility] of [
      [M1, 'participants'],
      [M1, 'party'],
      [P1, 'party'],
      [P1, 'campaign'],
    ]) {
      expect(
        sqlError(
          `${fixture}\nupdate public.adventures set visibility = '${visibility}' where id = ${id};\nrollback;`,
        ),
        `${id} ${visibility}`,
      ).toMatch(/adventure_visibility_forbidden|adventures_visibility_matches_type/)
    }
    expect(
      sqlError(
        `${fixture}\nupdate public.adventures set type = 'personal' where id = ${M1};\nrollback;`,
      ),
    ).toContain('adventure_type_change_forbidden')
    expect(
      sqlError(
        `${fixture}\nupdate public.adventures set type = 'main' where id = ${P1};\nrollback;`,
      ),
    ).toContain('adventure_type_change_forbidden')
    expect(
      sqlError(
        `${fixture}\nupdate public.adventures set type = 'side' where id = ${P1};\nrollback;`,
      ),
    ).toBe('')
  })

  test('only the creator archives or restores, and archived rows are read-only', () => {
    // No identity, or a member who is not the creator: refused.
    expect(
      sqlError(
        `${fixture}\nupdate public.adventures set archived_at = now() where id = ${M1};\nrollback;`,
      ),
    ).toContain('adventure_archive_creator_only')
    expect(
      sqlError(
        `${fixture}\n${asUser(B2)}\nupdate public.adventures set archived_at = now() where id = ${M1};\nrollback;`,
      ),
    ).toContain('adventure_archive_creator_only')

    // The creator: allowed, and the time is the server's.
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}
${asUser(A1)}
update public.adventures set archived_at = '2000-01-01' where id = ${M1};
select 'result', archived_at > now() - interval '1 minute' from public.adventures where id = ${M1};
rollback;`,
          {},
        ),
      ),
    ).toBe('result|t')

    const archived = `${fixture}\n${asUser(A1)}\nupdate public.adventures set archived_at = now() where id = ${M1};`
    for (const change of ["title = 'Edited'", "status = 'completed'", 'archived_at = now()']) {
      expect(
        sqlError(
          `${archived}\nupdate public.adventures set ${change} where id = ${M1};\nrollback;`,
        ),
        change,
      ).toContain('adventure_archived')
    }
    expect(
      sqlError(
        `${archived}\nupdate public.adventures set archived_at = null, title = 'Sneaky' where id = ${M1};\nrollback;`,
      ),
    ).toContain('adventure_archived')
    expect(
      sqlError(
        `${archived}\n${asUser(B2)}\nupdate public.adventures set archived_at = null where id = ${M1};\nrollback;`,
      ),
    ).toContain('adventure_archive_creator_only')
    expect(
      sqlError(
        `${archived}\nupdate public.adventures set archived_at = null where id = ${M1};\nrollback;`,
      ),
    ).toBe('')
  })

  test('status changes and edits are attributed; attributions cannot be forged', () => {
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}
${asUser(B2)}
update public.adventures set status = 'in_progress', status_changed_by = ${A1}, updated_by = ${A1}
  where id = ${M1};
${asUser(A1)}
update public.adventures set title = 'Story, revised', status_changed_by = ${A1} where id = ${M1};
select 'result', status, status_changed_by = ${B2}, status_changed_at is not null, updated_by = ${A1}
  from public.adventures where id = ${M1};
rollback;`,
          {},
        ),
      ),
    ).toBe('result|in_progress|t|t|t')
  })

  test('participants: main has none, keys are fixed, and the character must match', () => {
    expect(
      sqlError(`${fixture}
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id)
  values (${M1}, ${C1}, ${E3}, ${A1});
rollback;`),
    ).toContain('adventure_main_has_no_participants')
    // Another player's character, or one from another campaign: the composite FKs refuse it.
    expect(
      sqlError(`${fixture}
insert into public.adventures (id, campaign_id, created_by, type, visibility, title)
  values ('00000000-0000-4000-8000-0000000005f4', ${C1}, ${A1}, 'side', 'participants', 'Other');
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
  values ('00000000-0000-4000-8000-0000000005f4', ${C1}, ${E3}, ${B2}, 'proposed');
rollback;`),
    ).toContain('adventure_participants_character_owner_fkey')
    expect(
      sqlError(`${fixture}
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
  values (${P1}, ${C1}, ${E2}, ${A1}, 'proposed');
rollback;`),
    ).toContain('adventure_participants_character_campaign_fkey')
    expect(
      sqlError(`${fixture}
update public.adventure_participants set character_id = ${E3}, profile_id = ${A1} where adventure_id = ${P1};
rollback;`),
    ).toContain('adventure_reassignment_forbidden')
  })

  test('objectives: tick attribution, fixed keys, and a cap of 50', () => {
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}
${asUser(A1)}
insert into public.adventure_objectives (id, adventure_id, title)
  values ('00000000-0000-4000-8000-0000000005d1', ${M1}, 'Find the map');
${asUser(B2)}
update public.adventure_objectives set done = true, completed_by = ${A1}
  where id = '00000000-0000-4000-8000-0000000005d1';
select 'result', created_by = ${A1}, completed_by = ${B2}, completed_at is not null
  from public.adventure_objectives;
rollback;`,
          {},
        ),
      ),
    ).toBe('result|t|t|t')
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}
${asUser(B2)}
insert into public.adventure_objectives (adventure_id, title, done) values (${M1}, 'Done', true);
update public.adventure_objectives set done = false;
select 'result', done, completed_by is null, completed_at is null from public.adventure_objectives;
rollback;`,
          {},
        ),
      ),
    ).toBe('result|f|t|t')
    expect(
      sqlError(`${fixture}
insert into public.adventure_objectives (adventure_id, title) values (${M1}, 'x');
update public.adventure_objectives set adventure_id = ${P1};
rollback;`),
    ).toContain('adventure_reassignment_forbidden')

    const seed = `${fixture}
insert into public.adventure_objectives (adventure_id, title)
  select ${M1}, 'Objective ' || n from generate_series(1, 50) n;`
    expect(sqlError(`${seed}\nrollback;`)).toBe('')
    expect(
      sqlError(
        `${seed}\ninsert into public.adventure_objectives (adventure_id, title) values (${M1}, 'One more');\nrollback;`,
      ),
    ).toContain('adventure_objective_limit_reached')
    // The cap is per adventure.
    expect(
      sqlError(
        `${seed}\ninsert into public.adventure_objectives (adventure_id, title) values (${P1}, 'Elsewhere');\nrollback;`,
      ),
    ).toBe('')
  })

  test('updates: a cap of 500 per adventure', () => {
    const seed = `${fixture}
insert into public.adventure_updates (adventure_id, author_id, body)
  select ${M1}, ${A1}, 'Update ' || n from generate_series(1, 500) n;`
    expect(sqlError(`${seed}\nrollback;`)).toBe('')
    expect(
      sqlError(
        `${seed}\ninsert into public.adventure_updates (adventure_id, author_id, body) values (${M1}, ${B2}, 'More');\nrollback;`,
      ),
    ).toContain('adventure_update_limit_reached')
    expect(
      sqlError(
        `${seed}\ninsert into public.adventure_updates (adventure_id, author_id, body) values (${P1}, ${B2}, 'Elsewhere');\nrollback;`,
      ),
    ).toBe('')
  })

  test('deleting a character deletes the adventures only it was in (D5)', () => {
    const output = localDatabaseQuery(
      `${fixture}
insert into public.adventure_objectives (adventure_id, title) values (${P1}, 'Solo task'), (${M1}, 'Main task');
insert into public.adventure_updates (adventure_id, author_id, body) values (${P1}, ${B2}, 'Solo note');
-- A side adventure with two accepted participants survives losing one. The second participant
-- joins through the proposed -> invited -> accepted transitions (M6 guard).
insert into public.adventures (id, campaign_id, created_by, type, visibility, title)
  values ('00000000-0000-4000-8000-0000000005f3', ${C1}, ${A1}, 'side', 'participants', 'Duo');
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id)
  values ('00000000-0000-4000-8000-0000000005f3', ${C1}, ${E3}, ${A1});
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
  values ('00000000-0000-4000-8000-0000000005f3', ${C1}, ${E1}, ${B2}, 'proposed');
update public.adventure_participants set status = 'invited' where character_id = ${E1} and adventure_id = '00000000-0000-4000-8000-0000000005f3';
update public.adventure_participants set status = 'accepted' where character_id = ${E1} and adventure_id = '00000000-0000-4000-8000-0000000005f3';
delete from public.characters where id = ${E1};
-- Counts are scoped to this campaign so unrelated rows in the local database cannot shift them.
select 'result', string_agg(title, ',' order by title),
  (select count(*) from public.adventure_objectives where adventure_id in (select id from public.adventures where campaign_id = ${C1})),
  (select count(*) from public.adventure_updates where adventure_id in (select id from public.adventures where campaign_id = ${C1})),
  (select count(*) from public.adventure_participants where campaign_id = ${C1})
  from public.adventures where campaign_id = ${C1};
rollback;`,
      {},
    )
    expect(resultLine(output)).toBe('result|Duo,Story|1|0|1')
  })

  test('deleting an account cascades its adventures and clears its attributions (D7)', () => {
    const output = localDatabaseQuery(
      `${fixture}
${asUser(B2)}
update public.adventures set status = 'in_progress' where id = ${M1};
insert into public.adventure_objectives (adventure_id, title, done) values (${M1}, 'Ticked by b2', true);
insert into public.adventure_updates (adventure_id, author_id, body) values (${M1}, ${B2}, 'From b2');
select set_config('request.jwt.claims', '', true);
delete from public.campaign_members where profile_id = ${B2};
delete from auth.users where id = ${B2};
select 'result', string_agg(a.title, ',' order by a.title),
  bool_and(a.updated_by is null and a.status_changed_by is null),
  (select bool_and(created_by is null and completed_by is null) from public.adventure_objectives where adventure_id in (select id from public.adventures where campaign_id = ${C1})),
  (select count(*) from public.adventure_updates where adventure_id in (select id from public.adventures where campaign_id = ${C1}))
  from public.adventures as a where a.campaign_id = ${C1};
rollback;`,
      {},
    )
    expect(resultLine(output)).toBe('result|Story|t|t|0')
  })
})

// --- Row-level security through the API with real accounts ---------------------------

type Cast = Record<'owner' | 'guest' | 'other' | 'outsider', Player>

async function newCast() {
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  return players as Cast
}

const adventureFields =
  'id, campaign_id, created_by, type, visibility, status, title, description, next_step, reference, updated_by, status_changed_at, status_changed_by, archived_at, created_at, updated_at'

async function createdCharacter(player: Player, campaignId: string, name = 'Hero') {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: name,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

function createAdventure(
  player: Player,
  campaignId: string,
  type: string,
  title: string,
  characterId: string | null = null,
  extra: Record<string, unknown> = {},
) {
  return player.client.rpc('create_adventure', {
    p_campaign_id: campaignId,
    p_type: type,
    p_title: title,
    p_character_id: characterId,
    ...extra,
  })
}

async function created(
  player: Player,
  campaignId: string,
  type: string,
  title: string,
  characterId: string | null = null,
) {
  const { data, error } = await createAdventure(player, campaignId, type, title, characterId)
  expect(error?.message ?? null).toBeNull()
  return data as string
}

async function readAdventure(player: Player, id: string) {
  const { data, error } = await player.client
    .from('adventures')
    .select(adventureFields)
    .eq('id', id)
    .maybeSingle()
  expect(error).toBeNull()
  return data
}

async function visibleIds(player: Player, table: string, column: string, campaignId?: string) {
  let query = player.client.from(table).select(column)
  if (campaignId && table === 'adventures') query = query.eq('campaign_id', campaignId)
  const { data, error } = await query
  expect(error).toBeNull()
  return ((data ?? []) as unknown as Record<string, string>[]).map((row) => row[column]).sort()
}

function adventureRow(id: string) {
  return localDatabaseQuery(
    `select type || '|' || status || '|' || title || '|' || coalesce(archived_at::text, '~')
     from public.adventures where id = '${id}';`,
    {},
  )
}

function count(sql: string) {
  return Number(localDatabaseQuery(sql, {}))
}

/** Plan §4.2 invariants, asserted after racing writes. */
function assertInvariants(campaignId: string) {
  expect(
    count(`select count(*) from public.adventures a where a.campaign_id = '${campaignId}'
           and a.type <> 'main' and not exists (
             select 1 from public.adventure_participants p
             where p.adventure_id = a.id and p.status = 'accepted');`),
    'personal or side adventure without a participant',
  ).toBe(0)
  expect(
    count(`select count(*) from public.adventure_participants p join public.adventures a
           on a.id = p.adventure_id where a.campaign_id = '${campaignId}' and a.type = 'main';`),
    'main adventure with participants',
  ).toBe(0)
  expect(
    count(`select count(*) from public.adventure_participants p join public.characters c
           on c.id = p.character_id where p.campaign_id = '${campaignId}'
           and (c.campaign_id <> p.campaign_id or c.owner_id <> p.profile_id);`),
    'participant character mismatch',
  ).toBe(0)
  expect(
    count(`select count(*) from (select 1 from public.adventures where campaign_id = '${campaignId}'
           group by created_by having count(*) > 200) over;`),
  ).toBe(0)
  expect(
    count(`select count(*) from (select 1 from public.adventure_objectives o join public.adventures a
           on a.id = o.adventure_id where a.campaign_id = '${campaignId}'
           group by o.adventure_id having count(*) > 50) over;`),
  ).toBe(0)
}

test('creating adventures: each type, its participant, and every argument error', async () => {
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 create')
    const elsewhere = await createCampaign(guest, 'M5 elsewhere')
    ids.push(campaignId, elsewhere)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const hero = await createdCharacter(guest, campaignId, 'Hero')
    const otherHero = await createdCharacter(other, campaignId, 'Other')
    const farHero = await createdCharacter(guest, elsewhere, 'Far')

    const personal = await created(guest, campaignId, 'personal', 'Find my sister', hero)
    const side = await createAdventure(guest, campaignId, 'side', '  Duo job  ', hero, {
      p_next_step: ' Meet at dawn ',
      p_description: 'Line one\r\nLine two',
    })
    expect(side.error).toBeNull()
    const main = await created(owner, campaignId, 'main', 'The dragon')

    const personalRow = await readAdventure(guest, personal)
    expect(personalRow).toMatchObject({
      type: 'personal',
      visibility: 'participants',
      status: 'pending',
      created_by: guest.id,
      updated_by: guest.id,
      description: '',
      next_step: '',
      reference: '',
      archived_at: null,
      status_changed_at: null,
    })
    const sideRow = await readAdventure(guest, side.data as string)
    expect(sideRow).toMatchObject({
      title: 'Duo job',
      next_step: 'Meet at dawn',
      description: 'Line one\nLine two',
    })
    expect(await readAdventure(owner, main)).toMatchObject({
      type: 'main',
      visibility: 'campaign',
      created_by: owner.id,
    })

    const participants = await guest.client
      .from('adventure_participants')
      .select('adventure_id, campaign_id, character_id, profile_id, status')
      .eq('adventure_id', personal)
    expect(participants.data).toEqual([
      {
        adventure_id: personal,
        campaign_id: campaignId,
        character_id: hero,
        profile_id: guest.id,
        status: 'accepted',
      },
    ])
    expect(
      count(`select count(*) from public.adventure_participants where adventure_id = '${main}';`),
    ).toBe(0)

    const errors: [
      PromiseLike<{ error: { message: string; code: string } | null }>,
      string,
      string,
    ][] = [
      [
        createAdventure(guest, null as unknown as string, 'personal', 'x', hero),
        'adventure_campaign_required',
        '22023',
      ],
      [createAdventure(guest, campaignId, 'quest', 'x', hero), 'adventure_type_invalid', '22023'],
      [
        createAdventure(guest, campaignId, null as unknown as string, 'x', hero),
        'adventure_type_invalid',
        '22023',
      ],
      [
        createAdventure(guest, campaignId, 'personal', '   ', hero),
        'adventure_title_invalid',
        '22023',
      ],
      [
        createAdventure(guest, campaignId, 'personal', 'x'.repeat(121), hero),
        'adventure_title_invalid',
        '22023',
      ],
      [
        createAdventure(guest, campaignId, 'personal', 'a\nb', hero),
        'adventure_title_invalid',
        '22023',
      ],
      [
        createAdventure(guest, campaignId, 'personal', 'x', hero, { p_next_step: 'x'.repeat(281) }),
        'adventure_details_invalid',
        '22023',
      ],
      [
        createAdventure(guest, campaignId, 'personal', 'x', hero, {
          p_description: 'x'.repeat(4001),
        }),
        'adventure_details_invalid',
        '22023',
      ],
      [
        createAdventure(guest, campaignId, 'main', 'x', hero),
        'adventure_main_has_no_participants',
        '22023',
      ],
      [createAdventure(guest, campaignId, 'side', 'x'), 'adventure_character_required', '22023'],
      [
        createAdventure(guest, campaignId, 'personal', 'x', otherHero),
        'adventure_character_unavailable',
        'P0001',
      ],
      [
        createAdventure(guest, campaignId, 'personal', 'x', farHero),
        'adventure_character_unavailable',
        'P0001',
      ],
      [
        createAdventure(guest, campaignId, 'personal', 'x', RANDOM_ID),
        'adventure_character_unavailable',
        'P0001',
      ],
      [
        createAdventure(players.outsider, campaignId, 'main', 'x'),
        'adventure_campaign_unavailable',
        'P0001',
      ],
      [createAdventure(guest, RANDOM_ID, 'main', 'x'), 'adventure_campaign_unavailable', 'P0001'],
    ]
    for (const [call, message, code] of errors) {
      const { error } = await call
      expect(error, message).not.toBeNull()
      expect(error!.message).toBe(message)
      expect(error!.code).toBe(code)
    }

    // Anonymous callers cannot reach the RPC at all.
    const anon = await localClient().rpc('create_adventure', {
      p_campaign_id: campaignId,
      p_type: 'main',
      p_title: 'x',
    })
    expect(anon.error).not.toBeNull()
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('a creator may keep 200 adventures per campaign', async () => {
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 cap')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    localDatabaseQuery(
      `insert into public.adventures (campaign_id, created_by, type, visibility, title)
       select '${campaignId}', '${guest.id}', 'main', 'campaign', 'Seed ' || n from generate_series(1, 199) n;`,
      {},
    )
    // Five racing creates at 199: exactly one succeeds.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, n) => createAdventure(guest, campaignId, 'main', `Race ${n}`)),
    )
    expect(results.filter(({ error }) => !error)).toHaveLength(1)
    for (const { error } of results.filter(({ error }) => error)) {
      expect(error!.message).toBe('adventure_limit_reached')
    }
    // Archived ones count too; another creator is unaffected.
    await rpcOk(
      guest.client
        .from('adventures')
        .update({ archived_at: new Date().toISOString() })
        .eq('title', 'Seed 1'),
    )
    expect((await createAdventure(guest, campaignId, 'main', 'Over')).error?.message).toBe(
      'adventure_limit_reached',
    )
    expect((await createAdventure(owner, campaignId, 'main', 'Owner')).error).toBeNull()
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('personal adventures are invisible to everyone else, including the campaign owner', async () => {
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 visibility')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const hero = await createdCharacter(guest, campaignId)
    const ownerHero = await createdCharacter(owner, campaignId, 'Owner hero')

    const secret = await created(guest, campaignId, 'personal', 'Secret', hero)
    const ownerSecret = await created(owner, campaignId, 'side', 'Owner secret', ownerHero)
    const main = await created(other, campaignId, 'main', 'Story')
    for (const [adventureId, author] of [
      [secret, guest],
      [main, other],
    ] as const) {
      await rpcOk(
        author.client
          .from('adventure_objectives')
          .insert({ adventure_id: adventureId, title: 'Task' }),
      )
      await rpcOk(
        author.client.from('adventure_updates').insert({ adventure_id: adventureId, body: 'News' }),
      )
    }

    expect(await visibleIds(guest, 'adventures', 'id', campaignId)).toEqual([main, secret].sort())
    expect(await visibleIds(owner, 'adventures', 'id', campaignId)).toEqual(
      [main, ownerSecret].sort(),
    )
    expect(await visibleIds(other, 'adventures', 'id', campaignId)).toEqual([main])
    expect(await visibleIds(outsider, 'adventures', 'id', campaignId)).toEqual([])

    for (const viewer of [owner, other, outsider]) {
      for (const table of ['adventure_participants', 'adventure_objectives', 'adventure_updates']) {
        expect(await visibleIds(viewer, table, 'adventure_id'), `${table}`).not.toContain(secret)
      }
      // Counts and embeds reveal nothing either.
      const counted = await viewer.client
        .from('adventures')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .neq('type', 'main')
      expect(counted.count).toBe(viewer === owner ? 1 : 0)
      const embedded = await viewer.client
        .from('characters')
        .select(
          'id, adventure_participants!adventure_participants_character_campaign_fkey(adventure_id)',
        )
        .eq('id', hero)
      expect(embedded.error).toBeNull()
      for (const row of embedded.data ?? []) {
        expect((row as { adventure_participants: unknown[] }).adventure_participants).toEqual([])
      }
    }

    // Writes to the secret adventure from anyone else touch nothing.
    for (const viewer of [owner, other, outsider]) {
      const edit = await viewer.client
        .from('adventures')
        .update({ title: 'Mine now' })
        .eq('id', secret)
        .select('id')
      expect(edit.data ?? []).toHaveLength(0)
      const objective = await viewer.client
        .from('adventure_objectives')
        .insert({ adventure_id: secret, title: 'Intrude' })
      expect(objective.error?.code).toBe('42501')
      const update = await viewer.client
        .from('adventure_updates')
        .insert({ adventure_id: secret, body: 'Intrude' })
      expect(update.error?.code).toBe('42501')
      const ticked = await viewer.client
        .from('adventure_objectives')
        .update({ done: true })
        .eq('adventure_id', secret)
        .select('id')
      expect(ticked.data ?? []).toHaveLength(0)
      const removed = await viewer.client
        .from('adventure_objectives')
        .delete()
        .eq('adventure_id', secret)
        .select('id')
      expect(removed.data ?? []).toHaveLength(0)
    }
    expect(adventureRow(secret)).toBe('personal|pending|Secret|~')

    // The main adventure is readable and editable by every member, objectives and updates too.
    for (const member of [owner, guest]) {
      const edit = await member.client
        .from('adventures')
        .update({ next_step: `by ${member.username}` })
        .eq('id', main)
        .select('updated_by')
        .single()
      expect(edit.data?.updated_by).toBe(member.id)
      await rpcOk(
        member.client
          .from('adventure_objectives')
          .insert({ adventure_id: main, title: member.username }),
      )
      await rpcOk(
        member.client
          .from('adventure_updates')
          .insert({ adventure_id: main, body: member.username }),
      )
    }
    expect(await visibleIds(outsider, 'adventure_objectives', 'adventure_id')).toEqual([])
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('edits: stale saves, status attribution, type rules, objectives, and updates', async () => {
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 edits')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const hero = await createdCharacter(guest, campaignId)
    const personal = await created(guest, campaignId, 'personal', 'Mine', hero)
    const main = await created(owner, campaignId, 'main', 'Story')

    const start = (await readAdventure(guest, personal))!
    const saved = await guest.client
      .from('adventures')
      .update({ title: 'Mine, revised', type: 'side', reference: 'The Rusty Anchor' })
      .eq('id', personal)
      .eq('updated_at', start.updated_at)
      .select(adventureFields)
      .maybeSingle()
    expect(saved.data).toMatchObject({
      title: 'Mine, revised',
      type: 'side',
      reference: 'The Rusty Anchor',
    })
    const stale = await guest.client
      .from('adventures')
      .update({ title: 'Stale' })
      .eq('id', personal)
      .eq('updated_at', start.updated_at)
      .select('id')
      .maybeSingle()
    expect(stale.error).toBeNull()
    expect(stale.data).toBeNull()
    expect(adventureRow(personal)).toBe('side|pending|Mine, revised|~')

    const toMain = await guest.client
      .from('adventures')
      .update({ type: 'main' })
      .eq('id', personal)
      .select('id')
    expect(toMain.error?.message).toBe('adventure_type_change_forbidden')
    const fromMain = await guest.client
      .from('adventures')
      .update({ type: 'side' })
      .eq('id', main)
      .select('id')
    expect(fromMain.error?.message).toBe('adventure_type_change_forbidden')

    // Status: complete and reopen, attributed to whoever changed it.
    const completed = await guest.client
      .from('adventures')
      .update({ status: 'completed' })
      .eq('id', main)
      .select('status, status_changed_by, status_changed_at')
      .single()
    expect(completed.data).toMatchObject({ status: 'completed', status_changed_by: guest.id })
    const reopened = await owner.client
      .from('adventures')
      .update({ status: 'in_progress' })
      .eq('id', main)
      .select('status, status_changed_by')
      .single()
    expect(reopened.data).toEqual({ status: 'in_progress', status_changed_by: owner.id })
    const invalid = await owner.client.from('adventures').update({ status: 'won' }).eq('id', main)
    expect(invalid.error?.code).toBe('23514')

    // Objectives: add, rename, tick, untick, delete.
    const objective = await owner.client
      .from('adventure_objectives')
      .insert({ adventure_id: main, title: 'Scout the cave' })
      .select('id, created_by, done')
      .single()
    expect(objective.data).toMatchObject({ created_by: owner.id, done: false })
    const ticked = await guest.client
      .from('adventure_objectives')
      .update({ done: true, title: 'Scout the big cave' })
      .eq('id', objective.data!.id)
      .select('title, done, completed_by, completed_at')
      .single()
    expect(ticked.data).toMatchObject({
      title: 'Scout the big cave',
      done: true,
      completed_by: guest.id,
    })
    const unticked = await owner.client
      .from('adventure_objectives')
      .update({ done: false })
      .eq('id', objective.data!.id)
      .select('done, completed_by, completed_at')
      .single()
    expect(unticked.data).toEqual({ done: false, completed_by: null, completed_at: null })
    const gone = await guest.client
      .from('adventure_objectives')
      .delete()
      .eq('id', objective.data!.id)
      .select('id')
    expect(gone.data).toHaveLength(1)

    // Updates: posted as yourself, deleted only by their author, never edited.
    const update = await owner.client
      .from('adventure_updates')
      .insert({ adventure_id: main, body: 'We found the cave.\n\tIt was dark.' })
      .select('id, author_id, body')
      .single()
    expect(update.data).toMatchObject({
      author_id: owner.id,
      body: 'We found the cave.\n\tIt was dark.',
    })
    const notMine = await guest.client
      .from('adventure_updates')
      .delete()
      .eq('id', update.data!.id)
      .select('id')
    expect(notMine.data ?? []).toHaveLength(0)
    const edit = await owner.client
      .from('adventure_updates')
      .update({ body: 'Edited' })
      .eq('id', update.data!.id)
    expect(edit.error?.code).toBe('42501')
    const mine = await owner.client
      .from('adventure_updates')
      .delete()
      .eq('id', update.data!.id)
      .select('id')
    expect(mine.data).toHaveLength(1)
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('archiving: creator only, hidden from others, read-only, and restorable', async () => {
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 archive')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const main = await created(guest, campaignId, 'main', 'Guest story')
    await rpcOk(
      guest.client.from('adventure_objectives').insert({ adventure_id: main, title: 'Task' }),
    )

    // The campaign owner is not the creator.
    const byOwner = await owner.client
      .from('adventures')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', main)
      .select('id')
    expect(byOwner.error?.message).toBe('adventure_archive_creator_only')
    expect(byOwner.error?.code).toBe('42501')

    const archived = await guest.client
      .from('adventures')
      .update({ archived_at: '2000-01-01T00:00:00Z' })
      .eq('id', main)
      .select('archived_at')
      .single()
    expect(new Date(archived.data!.archived_at!).getFullYear()).toBeGreaterThan(2000)

    expect(await readAdventure(owner, main)).toBeNull()
    expect(await visibleIds(owner, 'adventure_objectives', 'adventure_id')).not.toContain(main)
    expect(await readAdventure(guest, main)).not.toBeNull()
    expect(await visibleIds(guest, 'adventure_objectives', 'adventure_id')).toContain(main)

    const edit = await guest.client
      .from('adventures')
      .update({ title: 'Edit' })
      .eq('id', main)
      .select('id')
    expect(edit.error?.message).toBe('adventure_archived')
    const objective = await guest.client
      .from('adventure_objectives')
      .insert({ adventure_id: main, title: 'More' })
    expect(objective.error?.code).toBe('42501')
    const tick = await guest.client
      .from('adventure_objectives')
      .update({ done: true })
      .eq('adventure_id', main)
      .select('id')
    expect(tick.data ?? []).toHaveLength(0)
    const update = await guest.client
      .from('adventure_updates')
      .insert({ adventure_id: main, body: 'News' })
    expect(update.error?.code).toBe('42501')

    const restored = await guest.client
      .from('adventures')
      .update({ archived_at: null })
      .eq('id', main)
      .select('archived_at')
      .single()
    expect(restored.data?.archived_at).toBeNull()
    expect(await readAdventure(owner, main)).not.toBeNull()
  } finally {
    await cleanup(players, ids)
  }
})

test('bypass attempts through the API are refused', async () => {
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 bypass')
    const elsewhere = await createCampaign(owner, 'M5 bypass elsewhere')
    ids.push(campaignId, elsewhere)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const hero = await createdCharacter(guest, campaignId)
    const otherHero = await createdCharacter(other, campaignId, 'Other')
    const main = await created(owner, campaignId, 'main', 'Story')
    const personal = await created(guest, campaignId, 'personal', 'Mine', hero)

    const direct = await guest.client
      .from('adventures')
      .insert({ campaign_id: campaignId, type: 'main', visibility: 'campaign', title: 'Direct' })
    expect(direct.error?.code).toBe('42501')
    const join = await other.client.from('adventure_participants').insert({
      adventure_id: personal,
      campaign_id: campaignId,
      character_id: otherHero,
      profile_id: other.id,
    })
    expect(join.error?.code).toBe('42501')
    const deleteAdventure = await owner.client.from('adventures').delete().eq('id', main)
    expect(deleteAdventure.error?.code).toBe('42501')
    const deleteParticipant = await guest.client
      .from('adventure_participants')
      .delete()
      .eq('adventure_id', personal)
    expect(deleteParticipant.error?.code).toBe('42501')

    for (const change of [
      { campaign_id: elsewhere },
      { created_by: guest.id },
      { visibility: 'participants' },
      { updated_by: guest.id },
      { status_changed_by: guest.id },
      { created_at: '2000-01-01T00:00:00Z' },
      { updated_at: '2000-01-01T00:00:00Z' },
    ]) {
      const { error } = await guest.client.from('adventures').update(change).eq('id', main)
      expect(error?.code, JSON.stringify(change)).toBe('42501')
    }

    for (const insert of [
      { adventure_id: main, title: 'x', created_by: owner.id },
      { adventure_id: main, title: 'x', completed_by: guest.id },
      { adventure_id: main, title: 'x', done: true },
    ] as Record<string, unknown>[]) {
      const { error } = await guest.client.from('adventure_objectives').insert(insert)
      expect(error?.code, JSON.stringify(insert)).toBe('42501')
    }
    const update = await guest.client
      .from('adventure_updates')
      .insert({ adventure_id: main, body: 'As the owner', author_id: owner.id })
    expect(update.error?.code).toBe('42501')
    const backdated = await guest.client
      .from('adventure_updates')
      .insert({ adventure_id: main, body: 'Old', created_at: '2000-01-01T00:00:00Z' })
    expect(backdated.error?.code).toBe('42501')
    expect(
      count(`select count(*) from public.adventure_updates where adventure_id = '${main}';`),
    ).toBe(0)
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('leaving or removal changes nothing and hides everything; rejoining restores access', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 lifecycle')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const hero = await createdCharacter(guest, campaignId)
    const otherHero = await createdCharacter(other, campaignId, 'Other')
    const personal = await created(guest, campaignId, 'personal', 'Guest secret', hero)
    const guestMain = await created(guest, campaignId, 'main', 'Guest story')
    const otherPersonal = await created(other, campaignId, 'personal', 'Other secret', otherHero)
    const snapshot = () =>
      localDatabaseQuery(
        `select string_agg(a.id || ':' || a.status || ':' || a.title || ':' || coalesce(p.status, '~'), ',' order by a.id)
         from public.adventures a left join public.adventure_participants p on p.adventure_id = a.id
         where a.campaign_id = '${campaignId}';`,
        {},
      )
    const before = snapshot()

    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(snapshot()).toBe(before)
    expect(await visibleIds(guest, 'adventures', 'id', campaignId)).toEqual([])
    const late = await guest.client
      .from('adventures')
      .update({ title: 'Late' })
      .eq('id', personal)
      .select('id')
    expect(late.data ?? []).toHaveLength(0)
    expect((await createAdventure(guest, campaignId, 'main', 'Late')).error?.message).toBe(
      'adventure_campaign_unavailable',
    )
    // Members keep the departed creator's main adventure and can edit it, but not archive it.
    expect(await visibleIds(owner, 'adventures', 'id', campaignId)).toEqual([guestMain])
    const edit = await owner.client
      .from('adventures')
      .update({ status: 'completed' })
      .eq('id', guestMain)
      .select('status')
      .single()
    expect(edit.data?.status).toBe('completed')
    const archive = await owner.client
      .from('adventures')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', guestMain)
    expect(archive.error?.message).toBe('adventure_archive_creator_only')

    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: other.id,
      }),
    )
    expect(await visibleIds(other, 'adventures', 'id', campaignId)).toEqual([])
    expect(await visibleIds(owner, 'adventures', 'id', campaignId)).toEqual([guestMain])

    await invite(owner, campaignId, guest)
    expect(await visibleIds(guest, 'adventures', 'id', campaignId)).toEqual(
      [guestMain, personal].sort(),
    )
    const back = await guest.client
      .from('adventures')
      .update({ next_step: 'Back' })
      .eq('id', personal)
      .select('next_step')
      .single()
    expect(back.data?.next_step).toBe('Back')
    expect(await visibleIds(guest, 'adventures', 'id', campaignId)).not.toContain(otherPersonal)
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('races: saves, caps, character deletion, and removal keep the invariants', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 races')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const main = await created(owner, campaignId, 'main', 'Story')

    // Two details saves from the same version: exactly one applies.
    const version = (await readAdventure(owner, main))!.updated_at
    const saves = await Promise.all(
      [guest, other].map((player) =>
        player.client
          .from('adventures')
          .update({ title: `By ${player.username}` })
          .eq('id', main)
          .eq('updated_at', version)
          .select('id')
          .maybeSingle(),
      ),
    )
    expect(saves.map(({ error }) => error)).toEqual([null, null])
    expect(saves.filter(({ data }) => data)).toHaveLength(1)

    // Five parallel objective inserts at 49: exactly one succeeds.
    localDatabaseQuery(
      `insert into public.adventure_objectives (adventure_id, title)
       select '${main}', 'Seed ' || n from generate_series(1, 49) n;`,
      {},
    )
    const objectives = await Promise.all(
      Array.from({ length: 5 }, (_, n) =>
        [owner, guest, other][n % 3].client
          .from('adventure_objectives')
          .insert({ adventure_id: main, title: `Race ${n}` }),
      ),
    )
    expect(objectives.filter(({ error }) => !error)).toHaveLength(1)
    for (const { error } of objectives.filter(({ error }) => error)) {
      expect(error!.message).toBe('adventure_objective_limit_reached')
    }

    // Updates at 499 the same way.
    localDatabaseQuery(
      `insert into public.adventure_updates (adventure_id, author_id, body)
       select '${main}', '${owner.id}', 'Seed ' || n from generate_series(1, 499) n;`,
      {},
    )
    const updates = await Promise.all(
      Array.from({ length: 5 }, (_, n) =>
        [owner, guest, other][n % 3].client
          .from('adventure_updates')
          .insert({ adventure_id: main, body: `Race ${n}` }),
      ),
    )
    expect(updates.filter(({ error }) => !error)).toHaveLength(1)
    for (const { error } of updates.filter(({ error }) => error)) {
      expect(error!.message).toBe('adventure_update_limit_reached')
    }

    // A create racing the character's deletion: either the create fails, or the delete takes
    // the new adventure with it. Never an orphan.
    for (let round = 0; round < 3; round += 1) {
      const hero = await createdCharacter(guest, campaignId, `Hero ${round}`)
      const [create, removal] = await Promise.all([
        createAdventure(guest, campaignId, 'personal', `Race ${round}`, hero),
        guest.client.from('characters').delete().eq('id', hero).select('id'),
      ])
      expect(removal.error).toBeNull()
      if (create.error)
        expect(create.error.message).toMatch(/adventure_character_unavailable|violates foreign key/)
      expect(
        count(
          `select count(*) from public.adventures where title = 'Race ${round}' and campaign_id = '${campaignId}';`,
        ),
      ).toBe(0)
      assertInvariants(campaignId)
    }

    // A create racing removal: either it fails, or it exists and is hidden from the creator.
    const otherHero = await createdCharacter(other, campaignId, 'Other')
    const [create, removed] = await Promise.all([
      createAdventure(other, campaignId, 'personal', 'Before removal', otherHero),
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: other.id,
      }),
    ])
    expect(removed.error).toBeNull()
    if (create.error) expect(create.error.message).toBe('adventure_campaign_unavailable')
    expect(await visibleIds(other, 'adventures', 'id', campaignId)).toEqual([])
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('deleting a campaign removes its adventures and everything in them', async () => {
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M5 cascade')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const hero = await createdCharacter(guest, campaignId)
    const personal = await created(guest, campaignId, 'personal', 'Mine', hero)
    const main = await created(owner, campaignId, 'main', 'Story')
    await rpcOk(
      guest.client.from('adventure_objectives').insert({ adventure_id: personal, title: 'Task' }),
    )
    await rpcOk(owner.client.from('adventure_updates').insert({ adventure_id: main, body: 'News' }))
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))

    await rpcOk(owner.client.from('campaigns').delete().eq('id', campaignId))
    expect(
      count(`select count(*) from public.adventures where id in ('${personal}', '${main}');`),
    ).toBe(0)
    expect(
      count(`select (select count(*) from public.adventure_participants where adventure_id in ('${personal}', '${main}'))
             + (select count(*) from public.adventure_objectives where adventure_id in ('${personal}', '${main}'))
             + (select count(*) from public.adventure_updates where adventure_id in ('${personal}', '${main}'));`),
    ).toBe(0)
  } finally {
    await cleanup(players, ids)
  }
})

// --- The board at the map table, against the real stack ------------------------------

test('players create adventures at the map table, and a second player ticks an objective on the main story', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const players = await newCast()
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
    const campaignId = await createCampaign(owner, 'M5 real-stack board')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await createdCharacter(owner, campaignId, 'Brindle')

    const openBoard = async (page: Awaited<ReturnType<typeof signIn>>['page']) => {
      await page.goto(`/app/campaigns/${campaignId}`)
      await page
        .getByRole('list', { name: 'Camp places' })
        .getByRole('button', { name: /^Adventures/ })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Adventures' })
      await expect(dialog).toBeVisible()
      return dialog
    }

    // The owner starts a personal adventure and a main one, and adds an objective to the main one.
    const first = await signIn(owner)
    try {
      const { page } = first
      let dialog = await openBoard(page)
      await expect(dialog.getByText('No adventures yet. Start one.')).toBeVisible()

      await dialog.getByRole('button', { name: 'New adventure' }).click()
      await dialog.getByLabel('Title', { exact: true }).fill('Private quest')
      await expect(dialog.getByLabel('For which character')).toHaveValue(/.+/)
      await dialog.getByRole('button', { name: 'Create adventure' }).click()
      await expect(dialog.getByRole('heading', { level: 3, name: 'Private quest' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Back to adventures' }).click()

      await dialog.getByRole('button', { name: 'New adventure' }).click()
      await dialog.getByLabel('Title', { exact: true }).fill('The long road')
      await dialog.getByRole('radio', { name: 'Main' }).check()
      await dialog.getByRole('button', { name: 'Create adventure' }).click()
      await expect(dialog.getByRole('heading', { level: 3, name: 'The long road' })).toBeVisible()
      await dialog.getByLabel('Add an objective').fill('Reach the pass')
      await dialog.getByRole('button', { name: 'Add objective' }).click()
      await expect(dialog.getByRole('checkbox', { name: 'Reach the pass' })).toBeVisible()

      // What the screen shows is what the database holds.
      await expect
        .poll(() =>
          localDatabaseQuery(
            `select string_agg(a.title || '|' || a.type || '|' || a.visibility || '|'
                    || (select count(*) from public.adventure_participants p where p.adventure_id = a.id),
                    ';' order by a.title)
             from public.adventures a where a.campaign_id = '${campaignId}';`,
            {},
          ),
        )
        .toBe('Private quest|personal|participants|1;The long road|main|campaign|0')

      // Both survive a reload.
      dialog = await openBoard(page)
      await expect(dialog.getByRole('button', { name: 'Private quest' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'The long road' })).toBeVisible()
    } finally {
      await first.context.close()
    }

    // A second player sees only the main story and ticks the objective.
    const second = await signIn(guest)
    try {
      const { page } = second
      const dialog = await openBoard(page)
      await expect(dialog.getByRole('button', { name: 'The long road' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Private quest' })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'The long road' }).click()
      await expect(dialog.getByRole('button', { name: 'Archive adventure' })).toHaveCount(0)
      // The tick shows once the database has taken it, so click and then look.
      await dialog.getByRole('checkbox', { name: 'Reach the pass' }).click()
      await expect(dialog.getByText(/^Done by you/)).toBeVisible()
      await expect
        .poll(() =>
          localDatabaseQuery(
            `select (done and completed_by = '${guest.id}')::text
             from public.adventure_objectives where title = 'Reach the pass'
               and adventure_id in (select id from public.adventures where campaign_id = '${campaignId}');`,
            {},
          ),
        )
        .toBe('true')
    } finally {
      await second.context.close()
    }

    // The owner sees who ticked it after reopening.
    const third = await signIn(owner)
    try {
      const { page } = third
      const dialog = await openBoard(page)
      await dialog.getByRole('button', { name: 'The long road' }).click()
      await expect(dialog.getByRole('checkbox', { name: 'Reach the pass' })).toBeChecked()
      await expect(dialog.getByText(new RegExp(`^Done by ${guest.username}`))).toBeVisible()
    } finally {
      await third.context.close()
    }
  } finally {
    await cleanup(players, ids)
  }
})
