import { expect, test } from '@playwright/test'
import { localDatabaseQuery, sqlError } from './support/localSupabase.ts'
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

// M03.4 notes (Phase 1): schema, RLS, and integrity against the real local stack.

const ROLES = ['anon', 'authenticated', 'service_role', 'public']

const A1 = "'00000000-0000-4000-8000-0000000000a1'"
const B2 = "'00000000-0000-4000-8000-0000000000b2'"
const C1 = "'00000000-0000-4000-8000-0000000000c1'"
const C2 = "'00000000-0000-4000-8000-0000000000c2'"
const E1 = "'00000000-0000-4000-8000-0000000000e1'"
const E2 = "'00000000-0000-4000-8000-0000000000e2'"

// Rolled-back fixture: campaign c1 owned by a1 with member b2 (character e1), and campaign c2
// owned by a1 (character e2).
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'm4-owner@example.test'),
         ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'm4-member@example.test');
insert into public.campaigns (id, name, owner_id)
  values ('00000000-0000-4000-8000-0000000000c1', 'M4 fixture', '00000000-0000-4000-8000-0000000000a1'),
         ('00000000-0000-4000-8000-0000000000c2', 'M4 other', '00000000-0000-4000-8000-0000000000a1');
insert into public.campaign_members (campaign_id, profile_id, role)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'member');
set constraints all immediate;
set constraints all deferred;
insert into public.characters (id, campaign_id, owner_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
          '00000000-0000-4000-8000-0000000000b2', 'Fixture'),
         ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2',
          '00000000-0000-4000-8000-0000000000a1', 'Elsewhere');
insert into public.character_sheets (character_id)
  values ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2');
`

function insertNote(extra: Record<string, string> = {}, campaign = C1, author = A1) {
  const columns = { campaign_id: campaign, author_id: author, title: "'Note'", ...extra }
  return `insert into public.notes (${Object.keys(columns).join(', ')})
          values (${Object.values(columns).join(', ')})`
}

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

test.describe('catalog and privileges', () => {
  test('RLS is on and the note grants are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity from pg_class where oid = 'public.notes'::regclass;`,
        {},
      ),
    ).toBe('t')

    for (const [privilege, expected] of [
      ['select', 'authenticated'],
      ['delete', 'authenticated'],
      ['insert', ''],
      ['update', ''],
      ['truncate', ''],
      ['references', ''],
      ['trigger', ''],
    ]) {
      expect(
        holders((r) => `has_table_privilege(${r}, 'public.notes', '${privilege}')`),
        privilege,
      ).toBe(expected)
    }

    const columns = [
      'id',
      'campaign_id',
      'author_id',
      'visibility',
      'title',
      'body',
      'character_id',
      'updated_by',
      'created_at',
      'updated_at',
    ]
    const withPrivilege = (role: string, privilege: string) =>
      localDatabaseQuery(
        `select coalesce(string_agg(c, ',' order by c), '') from unnest(array['${columns.join("','")}']) c
         where has_column_privilege('${role}', 'public.notes', c, '${privilege}');`,
        {},
      )
    expect(withPrivilege('authenticated', 'select')).toBe([...columns].sort().join(','))
    expect(withPrivilege('authenticated', 'insert')).toBe(
      'body,campaign_id,character_id,title,visibility',
    )
    expect(withPrivilege('authenticated', 'update')).toBe('body,character_id,title,visibility')
    for (const role of ['anon', 'service_role', 'public']) {
      for (const privilege of ['select', 'insert', 'update']) {
        expect(withPrivilege(role, privilege), `${role} ${privilege}`).toBe('')
      }
    }
  })

  test('the guard function is postgres-only, with the planned policies, triggers, and indexes', () => {
    expect(
      holders((r) => `has_function_privilege(${r}, 'private.guard_note_write()', 'execute')`),
    ).toBe('')
    expect(
      localDatabaseQuery(
        `select string_agg(cmd, ',' order by cmd) from pg_policies
         where schemaname = 'public' and tablename = 'notes';`,
        {},
      ),
    ).toBe('DELETE,INSERT,SELECT,UPDATE')
    expect(
      localDatabaseQuery(
        `select string_agg(tgname, ',' order by tgname) from pg_trigger
         where tgrelid = 'public.notes'::regclass and not tgisinternal;`,
        {},
      ),
    ).toBe('notes_guard_write,notes_set_updated_at')
    expect(
      localDatabaseQuery(
        `select string_agg(indexname, ',' order by indexname) from pg_indexes
         where schemaname = 'public' and tablename = 'notes' and indexname <> 'notes_pkey';`,
        {},
      ),
    ).toBe('notes_author_idx,notes_campaign_updated_idx,notes_character_idx')
    // The link is a composite FK that clears only the link when the character is deleted.
    expect(
      localDatabaseQuery(
        `select pg_get_constraintdef(oid) from pg_constraint where conname = 'notes_character_fkey';`,
        {},
      ),
    ).toContain('ON DELETE SET NULL (character_id)')
  })

  test('the departure hook is the M2 body: it never touches notes', () => {
    expect(
      localDatabaseQuery(
        `select prosrc ~ 'notes' from pg_proc
         where oid = 'private.handle_campaign_member_departure(uuid, uuid)'::regprocedure;`,
        {},
      ),
    ).toBe('f')
  })
})

test.describe('database integrity (as postgres, rolled back)', () => {
  test('note checks bound titles, bodies, and visibility', () => {
    const bad: [Record<string, string>, string][] = [
      [{ title: "''" }, 'notes_title_check'],
      [{ title: "'   '" }, 'notes_title_check'],
      [{ title: "' padded '" }, 'notes_title_check'],
      [{ title: "repeat('x', 121)" }, 'notes_title_check'],
      [{ title: "E'tab\\there'" }, 'notes_title_check'],
      [{ title: "E'line\\nbreak'" }, 'notes_title_check'],
      [{ body: "repeat('x', 20001)" }, 'notes_body_check'],
      [{ body: "E'bell\\x07'" }, 'notes_body_check'],
      [{ body: "E'nul\\x7f'" }, 'notes_body_check'],
      [{ visibility: "'secret'" }, 'notes_visibility_check'],
      [{ visibility: "''" }, 'notes_visibility_check'],
    ]
    for (const [columns, constraint] of bad) {
      expect(
        sqlError(`${fixture}
${insertNote(columns)};
rollback;`),
        JSON.stringify(columns),
      ).toContain(constraint)
    }

    // Boundaries and the allowed whitespace are accepted.
    const good: Record<string, string>[] = [
      { title: "'x'" },
      { title: "repeat('x', 120)" },
      { body: "''" },
      { body: "repeat('x', 20000)" },
      { body: "E'line one\\n\\tindented\\r\\nline three'" },
      { visibility: "'campaign'" },
    ]
    for (const columns of good) {
      expect(
        sqlError(`${fixture}
${insertNote(columns)};
rollback;`),
        JSON.stringify(columns),
      ).toBe('')
    }
  })

  test('defaults: private visibility, empty body, no editor without an identity', () => {
    expect(
      localDatabaseQuery(
        `${fixture}
${insertNote()} returning visibility || '|' || body || '|' || coalesce(updated_by::text, '~') || '|' || (created_at = updated_at);
rollback;`,
        {},
      )
        .split('\n')
        .find((line) => line.includes('|')),
    ).toBe('private||~|true')
  })

  test('a note cannot move to another campaign, author, id, or creation time', () => {
    for (const change of [
      `campaign_id = ${C2}`,
      `author_id = ${B2}`,
      `id = gen_random_uuid()`,
      `created_at = created_at - interval '1 day'`,
    ]) {
      expect(
        sqlError(`${fixture}
${insertNote()};
update public.notes set ${change} where campaign_id = ${C1};
rollback;`),
        change,
      ).toContain('note_reassignment_forbidden')
    }
  })

  test('the visibility guard needs the author’s identity on every path', () => {
    const asUser = (id: string) =>
      `select set_config('request.jwt.claims', '{"sub":${id.replace(/'/g, '"')},"role":"authenticated"}', true);`

    // No Auth identity (postgres, service tooling): refused.
    expect(
      sqlError(`${fixture}
${insertNote()};
update public.notes set visibility = 'campaign' where campaign_id = ${C1};
rollback;`),
    ).toContain('note_visibility_author_only')

    // A member who is not the author: refused. The author: allowed.
    expect(
      sqlError(`${fixture}
${insertNote({ visibility: "'campaign'" })};
${asUser(B2)}
update public.notes set visibility = 'private' where campaign_id = ${C1};
rollback;`),
    ).toContain('note_visibility_author_only')
    expect(
      sqlError(`${fixture}
${insertNote({ visibility: "'campaign'" })};
${asUser(A1)}
update public.notes set visibility = 'private' where campaign_id = ${C1};
rollback;`),
    ).toBe('')

    // Any identity may edit text of a campaign note, and the editor is recorded.
    expect(
      localDatabaseQuery(
        `${fixture}
${insertNote({ visibility: "'campaign'" })};
${asUser(B2)}
update public.notes set body = 'edited' where campaign_id = ${C1} returning (updated_by = ${B2}) || '|' || (author_id = ${A1});
rollback;`,
        {},
      )
        .split('\n')
        .find((line) => line.includes('|')),
    ).toBe('true|true')
  })

  test('the 500-note cap is per author per campaign', () => {
    const seed = `${fixture}
insert into public.notes (campaign_id, author_id, title)
select ${C1}, ${B2}, 'Note ' || n from generate_series(1, 500) n;`
    expect(
      sqlError(`${seed}
${insertNote({}, C1, B2)};
rollback;`),
    ).toContain('note_limit_reached')
    // Another author in the same campaign is unaffected.
    expect(
      sqlError(`${seed}
${insertNote({}, C1, A1)};
rollback;`),
    ).toBe('')
    // The same author in another campaign is unaffected.
    expect(
      sqlError(`${seed}
${insertNote({}, C2, A1)};
rollback;`),
    ).toBe('')
    // The 500th is accepted.
    expect(
      sqlError(`${fixture}
insert into public.notes (campaign_id, author_id, title)
select ${C1}, ${B2}, 'Note ' || n from generate_series(1, 500) n;
rollback;`),
    ).toBe('')
  })

  test('links must point at a character in the same campaign owned by a current member', () => {
    expect(
      sqlError(`${fixture}
${insertNote({ character_id: E1 })};
rollback;`),
    ).toBe('')
    for (const character of [E2, "'00000000-0000-4000-8000-00000000dead'"]) {
      expect(
        sqlError(`${fixture}
${insertNote({ character_id: character })};
rollback;`),
        character,
      ).toContain('note_character_unavailable')
    }
    expect(
      sqlError(`${fixture}
${insertNote()};
update public.notes set character_id = ${E2} where campaign_id = ${C1};
rollback;`),
    ).toContain('note_character_unavailable')
  })

  test('deleting a linked character clears the link and nothing else', () => {
    const result = localDatabaseQuery(
      `${fixture}
${insertNote({ character_id: E1, visibility: "'campaign'" })};
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
update public.notes set body = 'by the owner' where campaign_id = ${C1};
set constraints all immediate;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
delete from public.characters where id = ${E1};
select 'result', character_id is null, updated_by = ${A1}, body, campaign_id = ${C1}
  from public.notes;
rollback;`,
      {},
    )
    expect(result).toContain('result|t|t|by the owner|t')
  })

  test('deleting an account removes its notes and clears it as editor elsewhere', () => {
    const result = localDatabaseQuery(
      `${fixture}
${insertNote({ title: "'Mine'" }, C1, B2)};
${insertNote({ title: "'Theirs'", visibility: "'campaign'" }, C1, A1)};
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
update public.notes set body = 'edited by b2' where campaign_id = ${C1} and title = 'Theirs';
select set_config('request.jwt.claims', '', true);
delete from public.characters where owner_id = ${B2};
delete from public.campaign_members where profile_id = ${B2};
delete from auth.users where id = ${B2};
select 'result', title, coalesce(updated_by::text, '~') from public.notes order by title;
rollback;`,
      {},
    )
    expect(result).toContain('result|Theirs|~')
    expect(result).not.toContain('result|Mine')
  })
})

// --- Row-level security through the API with real accounts ---------------------------

type Cast = Record<'owner' | 'guest' | 'other' | 'outsider', Player>

async function newCast() {
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  return players as Cast
}

const noteFields =
  'id, campaign_id, author_id, visibility, title, body, character_id, updated_by, created_at, updated_at'

function addNote(player: Player, campaignId: string, extra: Record<string, unknown> = {}) {
  return player.client
    .from('notes')
    .insert({ campaign_id: campaignId, title: 'Plan', ...extra })
    .select(noteFields)
    .single()
}

async function created(player: Player, campaignId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await addNote(player, campaignId, extra)
  expect(error?.message ?? null).toBeNull()
  return data!
}

async function createdCharacter(player: Player, campaignId: string, name = 'Hero') {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: name,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

async function visibleNotes(player: Player, campaignId: string) {
  const { data, error } = await player.client
    .from('notes')
    .select('id')
    .eq('campaign_id', campaignId)
  expect(error).toBeNull()
  return (data ?? []).map((row) => row.id as string).sort()
}

function noteRow(id: string) {
  return localDatabaseQuery(
    `select visibility || '|' || title || '|' || body || '|' || author_id || '|' || coalesce(updated_by::text, '~')
            || '|' || coalesce(character_id::text, '~')
     from public.notes where id = '${id}';`,
    {},
  )
}

function noteCount(campaignId: string, authorId?: string) {
  return Number(
    localDatabaseQuery(
      `select count(*) from public.notes where campaign_id = '${campaignId}'
       ${authorId ? `and author_id = '${authorId}'` : ''};`,
      {},
    ),
  )
}

/** Plan §4.2 invariants, asserted after racing writes. */
function assertInvariants(campaignId: string) {
  expect(
    localDatabaseQuery(
      `select count(*) from (
         select author_id from public.notes where campaign_id = '${campaignId}'
         group by author_id having count(*) > 500) over_cap;`,
      {},
    ),
  ).toBe('0')
  expect(
    localDatabaseQuery(
      `select count(*) from public.notes n join public.characters c on c.id = n.character_id
       where n.campaign_id = '${campaignId}' and c.campaign_id <> n.campaign_id;`,
      {},
    ),
  ).toBe('0')
}

function leave(player: Player, campaignId: string) {
  return rpcOk(player.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
}

test('an author creates, edits, shares, hides, and deletes notes', async () => {
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 author flow')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    const note = await created(guest, campaignId, { title: 'Clues' })
    expect(note.visibility).toBe('private')
    expect(note.body).toBe('')
    expect(note.author_id).toBe(guest.id)
    expect(note.updated_by).toBe(guest.id)
    expect(note.character_id).toBeNull()

    const edited = await guest.client
      .from('notes')
      .update({ title: 'Clues, revised', body: 'Line one\n\tindented\r\nLine three' })
      .eq('id', note.id)
      .eq('updated_at', note.updated_at)
      .select(noteFields)
      .maybeSingle()
    expect(edited.error).toBeNull()
    expect(edited.data?.title).toBe('Clues, revised')
    expect(edited.data?.body).toBe('Line one\n\tindented\r\nLine three')
    expect(new Date(edited.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(note.updated_at).getTime(),
    )
    expect(edited.data?.created_at).toBe(note.created_at)

    const shared = await guest.client
      .from('notes')
      .update({ visibility: 'campaign' })
      .eq('id', note.id)
      .eq('updated_at', edited.data!.updated_at)
      .select(noteFields)
      .maybeSingle()
    expect(shared.data?.visibility).toBe('campaign')
    expect(await visibleNotes(owner, campaignId)).toEqual([note.id])

    const hidden = await guest.client
      .from('notes')
      .update({ visibility: 'private' })
      .eq('id', note.id)
      .eq('updated_at', shared.data!.updated_at)
      .select(noteFields)
      .maybeSingle()
    expect(hidden.data?.visibility).toBe('private')
    expect(await visibleNotes(owner, campaignId)).toEqual([])

    const removed = await guest.client.from('notes').delete().eq('id', note.id).select('id')
    expect(removed.data).toHaveLength(1)
    expect(noteCount(campaignId)).toBe(0)
    const again = await guest.client.from('notes').delete().eq('id', note.id).select('id')
    expect(again.data ?? []).toHaveLength(0)
  } finally {
    await cleanup(players, ids)
  }
})

test('the API enforces the checks and rejects stale saves', async () => {
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 checks')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    for (const extra of [
      { title: '' },
      { title: '   ' },
      { title: ' padded ' },
      { title: 'x'.repeat(121) },
      { title: 'tab\there' },
      { body: 'x'.repeat(20001) },
      { body: 'bell\u0007' },
      { visibility: 'secret' },
    ]) {
      const result = await addNote(guest, campaignId, extra)
      expect(result.error?.code, JSON.stringify(extra).slice(0, 40)).toBe('23514')
    }
    expect(noteCount(campaignId)).toBe(0)

    expect((await addNote(guest, campaignId, { title: 'x'.repeat(120) })).error).toBeNull()
    expect((await addNote(guest, campaignId, { body: 'x'.repeat(20000) })).error).toBeNull()

    // A save from a stale version changes nothing.
    const note = await created(guest, campaignId, { title: 'Versioned' })
    const first = await guest.client
      .from('notes')
      .update({ body: 'first' })
      .eq('id', note.id)
      .eq('updated_at', note.updated_at)
      .select('id')
      .maybeSingle()
    expect(first.data).not.toBeNull()
    const stale = await guest.client
      .from('notes')
      .update({ body: 'stale' })
      .eq('id', note.id)
      .eq('updated_at', note.updated_at)
      .select('id')
      .maybeSingle()
    expect(stale.error).toBeNull()
    expect(stale.data).toBeNull()
    expect(noteRow(note.id)).toBe(`private|Versioned|first|${guest.id}|${guest.id}|~`)
  } finally {
    await cleanup(players, ids)
  }
})

test('private notes belong to their author alone, including against the campaign owner', async () => {
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 private')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)

    const secret = await created(guest, campaignId, { title: 'Secret', body: 'mine' })
    const ownerSecret = await created(owner, campaignId, { title: 'Owner secret' })

    expect(await visibleNotes(guest, campaignId)).toEqual([secret.id])
    expect(await visibleNotes(owner, campaignId)).toEqual([ownerSecret.id])
    expect(await visibleNotes(other, campaignId)).toEqual([])
    expect(await visibleNotes(outsider, campaignId)).toEqual([])

    for (const stranger of [owner, other, outsider]) {
      const read = await stranger.client.from('notes').select('id').eq('id', secret.id)
      expect(read.data ?? []).toHaveLength(0)
      const update = await stranger.client
        .from('notes')
        .update({ body: 'tampered' })
        .eq('id', secret.id)
        .select('id')
      expect(update.error).toBeNull()
      expect(update.data ?? []).toHaveLength(0)
      const deleted = await stranger.client.from('notes').delete().eq('id', secret.id).select('id')
      expect(deleted.data ?? []).toHaveLength(0)
    }
    expect(noteRow(secret.id)).toBe(`private|Secret|mine|${guest.id}|${guest.id}|~`)

    // Making it shared is the author's call alone.
    const share = await other.client
      .from('notes')
      .update({ visibility: 'campaign' })
      .eq('id', secret.id)
      .select('id')
    expect(share.data ?? []).toHaveLength(0)
    expect(noteRow(secret.id)).toContain('private|Secret|')

    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('every member edits a campaign note, and only its author changes visibility or deletes it', async () => {
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 shared')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)

    const note = await created(guest, campaignId, {
      title: 'Plan',
      body: 'v1',
      visibility: 'campaign',
    })
    expect(await visibleNotes(owner, campaignId)).toEqual([note.id])
    expect(await visibleNotes(other, campaignId)).toEqual([note.id])
    expect(await visibleNotes(outsider, campaignId)).toEqual([])

    // Both the owner and another member edit it; the editor is recorded and the author is kept.
    for (const [editor, body] of [
      [owner, 'v2 by owner'],
      [other, 'v3 by other'],
    ] as [Player, string][]) {
      const result = await editor.client
        .from('notes')
        .update({ body })
        .eq('id', note.id)
        .select(noteFields)
        .maybeSingle()
      expect(result.error).toBeNull()
      expect(result.data?.body).toBe(body)
      expect(result.data?.updated_by).toBe(editor.id)
      expect(result.data?.author_id).toBe(guest.id)
    }
    const outsiderEdit = await outsider.client
      .from('notes')
      .update({ body: 'nope' })
      .eq('id', note.id)
      .select('id')
    expect(outsiderEdit.data ?? []).toHaveLength(0)

    // Visibility and deletion are the author's alone.
    for (const member of [owner, other]) {
      const hide = await member.client
        .from('notes')
        .update({ visibility: 'private' })
        .eq('id', note.id)
        .select('id')
      expect(hide.error?.code).toBe('42501')
      expect(hide.error?.message).toBe('note_visibility_author_only')
      const deleted = await member.client.from('notes').delete().eq('id', note.id).select('id')
      expect(deleted.error).toBeNull()
      expect(deleted.data ?? []).toHaveLength(0)
    }
    expect(noteRow(note.id)).toBe(`campaign|Plan|v3 by other|${guest.id}|${other.id}|~`)

    // Making it private hides it from everyone else on the next read, and their saves fail.
    const hidden = await guest.client
      .from('notes')
      .update({ visibility: 'private' })
      .eq('id', note.id)
      .select('id')
    expect(hidden.data).toHaveLength(1)
    expect(await visibleNotes(owner, campaignId)).toEqual([])
    expect(await visibleNotes(other, campaignId)).toEqual([])
    const lateEdit = await other.client
      .from('notes')
      .update({ body: 'too late' })
      .eq('id', note.id)
      .select('id')
    expect(lateEdit.data ?? []).toHaveLength(0)

    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('the API cannot write notes as someone else, move them, or force columns', async () => {
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 bypass')
    const outsiderCampaignId = await createCampaign(outsider, 'M4 bypass other')
    ids.push(campaignId, outsiderCampaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const note = await created(guest, campaignId, { title: 'Guarded', visibility: 'campaign' })

    // Columns without an insert grant.
    for (const extra of [
      { author_id: other.id },
      { updated_by: other.id },
      { id: crypto.randomUUID() },
      { created_at: '2020-01-01T00:00:00Z' },
      { updated_at: '2020-01-01T00:00:00Z' },
    ]) {
      const result = await addNote(guest, campaignId, extra)
      expect(result.error?.code, Object.keys(extra)[0]).toBe('42501')
    }

    // A campaign the caller is not in, and one that does not exist.
    for (const target of [outsiderCampaignId, RANDOM_ID]) {
      const result = await addNote(guest, target)
      expect(result.error?.code, target).toBe('42501')
    }
    expect((await addNote(outsider, campaignId)).error?.code).toBe('42501')

    // Columns without an update grant.
    for (const change of [
      { campaign_id: outsiderCampaignId },
      { author_id: other.id },
      { updated_by: other.id },
      { id: crypto.randomUUID() },
      { created_at: '2020-01-01T00:00:00Z' },
      { updated_at: '2020-01-01T00:00:00Z' },
    ]) {
      for (const who of [guest, other]) {
        const result = await who.client.from('notes').update(change).eq('id', note.id).select('id')
        expect(result.error?.code, `${who.username} ${Object.keys(change)[0]}`).toBe('42501')
      }
    }
    expect(noteRow(note.id)).toBe(`campaign|Guarded||${guest.id}|${guest.id}|~`)
    expect(noteCount(outsiderCampaignId)).toBe(0)
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('links accept characters of current members and reject everything else', async () => {
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 links')
    const outsiderCampaignId = await createCampaign(outsider, 'M4 links other')
    ids.push(campaignId, outsiderCampaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const ownCharacter = await createdCharacter(guest, campaignId, 'Mine')
    const otherCharacter = await createdCharacter(other, campaignId, 'Theirs')
    const farCharacter = await createdCharacter(outsider, outsiderCampaignId, 'Far')

    // Any character in the campaign works, including another player's (D5).
    const linkedOwn = await created(guest, campaignId, { character_id: ownCharacter })
    const linkedOther = await created(guest, campaignId, { character_id: otherCharacter })
    expect([linkedOwn.character_id, linkedOther.character_id]).toEqual([
      ownCharacter,
      otherCharacter,
    ])

    // Another campaign's character, a random id: refused by the guard.
    for (const target of [farCharacter, RANDOM_ID]) {
      const result = await addNote(guest, campaignId, { character_id: target })
      expect(result.error?.message, target).toBe('note_character_unavailable')
      const update = await guest.client
        .from('notes')
        .update({ character_id: target })
        .eq('id', linkedOwn.id)
        .select('id')
      expect(update.error?.message, target).toBe('note_character_unavailable')
    }
    expect(noteRow(linkedOwn.id)).toContain(`|${ownCharacter}`)

    // The link can be removed and changed.
    const cleared = await guest.client
      .from('notes')
      .update({ character_id: null })
      .eq('id', linkedOwn.id)
      .select('character_id')
      .single()
    expect(cleared.data?.character_id).toBeNull()

    // Deleting the linked character clears the link and leaves the note and its editor alone.
    await created(guest, campaignId, {
      title: 'Shared link',
      visibility: 'campaign',
      character_id: ownCharacter,
    })
    const before = localDatabaseQuery(
      `select id || '|' || updated_at from public.notes
       where campaign_id = '${campaignId}' and title = 'Shared link';`,
      {},
    ).split('|')
    const edit = await other.client
      .from('notes')
      .update({ body: 'edited by other' })
      .eq('id', before[0])
      .select('updated_at')
      .single()
    const deleteCharacter = await guest.client.from('characters').delete().eq('id', ownCharacter)
    expect(deleteCharacter.error).toBeNull()
    expect(noteRow(before[0])).toBe(
      `campaign|Shared link|edited by other|${guest.id}|${other.id}|~`,
    )
    expect(
      localDatabaseQuery(
        `select updated_at > '${edit.data!.updated_at}' from public.notes where id = '${before[0]}';`,
        {},
      ),
    ).toBe('t')

    // A departed player's character cannot be newly linked, but a kept link still saves.
    await leave(other, campaignId)
    const departed = await addNote(guest, campaignId, { character_id: otherCharacter })
    expect(departed.error?.message).toBe('note_character_unavailable')
    const stillSaves = await guest.client
      .from('notes')
      .update({ body: 'still works' })
      .eq('id', linkedOther.id)
      .select('character_id')
      .single()
    expect(stillSaves.error).toBeNull()
    expect(stillSaves.data?.character_id).toBe(otherCharacter)
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('the 500-note cap holds through the API, including parallel inserts', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 cap')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    localDatabaseQuery(
      `insert into public.notes (campaign_id, author_id, title)
       select '${campaignId}', '${guest.id}', 'Note ' || n from generate_series(1, 498) n;`,
      {},
    )
    expect((await addNote(guest, campaignId, { title: 'The 499th' })).error).toBeNull()

    // Five parallel inserts at 499 notes: exactly one succeeds.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, n) => addNote(guest, campaignId, { title: `Racer ${n}` })),
    )
    expect(results.filter((result) => result.error === null)).toHaveLength(1)
    expect(results.filter((result) => result.error?.message === 'note_limit_reached')).toHaveLength(
      4,
    )
    expect(noteCount(campaignId, guest.id)).toBe(500)
    assertInvariants(campaignId)

    // The cap is the author's own: the owner can still write, and deleting frees a slot.
    expect((await addNote(owner, campaignId, { title: 'Owner note' })).error).toBeNull()
    const full = await addNote(guest, campaignId, { title: 'The 501st' })
    expect(full.error?.message).toBe('note_limit_reached')
    await guest.client.from('notes').delete().eq('title', 'Note 1')
    expect((await addNote(guest, campaignId, { title: 'Replacement' })).error).toBeNull()
    expect(noteCount(campaignId, guest.id)).toBe(500)
  } finally {
    await cleanup(players, ids)
  }
})

test('leaving or removal keeps notes, hides the author’s, and rejoining restores access', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 lifecycle')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)

    const guestPrivate = await created(guest, campaignId, { title: 'Guest private', body: 'p' })
    const guestShared = await created(guest, campaignId, {
      title: 'Guest shared',
      body: 's',
      visibility: 'campaign',
    })
    const otherPrivate = await created(other, campaignId, { title: 'Other private' })
    const otherShared = await created(other, campaignId, {
      title: 'Other shared',
      visibility: 'campaign',
    })
    const before = {
      guestPrivate: noteRow(guestPrivate.id),
      guestShared: noteRow(guestShared.id),
      otherPrivate: noteRow(otherPrivate.id),
      otherShared: noteRow(otherShared.id),
    }

    // Leave: the notes stay, and the author loses every read and write.
    await leave(guest, campaignId)
    expect(noteRow(guestPrivate.id)).toBe(before.guestPrivate)
    expect(noteRow(guestShared.id)).toBe(before.guestShared)
    expect(await visibleNotes(guest, campaignId)).toEqual([])
    expect((await addNote(guest, campaignId)).error?.code).toBe('42501')
    for (const id of [guestPrivate.id, guestShared.id]) {
      const update = await guest.client
        .from('notes')
        .update({ body: 'late' })
        .eq('id', id)
        .select('id')
      expect(update.data ?? []).toHaveLength(0)
      const deleted = await guest.client.from('notes').delete().eq('id', id).select('id')
      expect(deleted.data ?? []).toHaveLength(0)
    }

    // Members keep the shared note and never see the private one. Nobody but the author can
    // delete the shared note or make it private (D1), though members can still edit it.
    expect(await visibleNotes(other, campaignId)).toEqual(
      [guestShared.id, otherPrivate.id, otherShared.id].sort(),
    )
    expect(await visibleNotes(owner, campaignId)).toEqual([guestShared.id, otherShared.id].sort())
    for (const member of [owner, other]) {
      const edit = await member.client
        .from('notes')
        .update({ body: `edited by ${member === owner ? 'owner' : 'other'}` })
        .eq('id', guestShared.id)
        .select('author_id, updated_by')
        .single()
      expect(edit.error).toBeNull()
      expect(edit.data).toEqual({ author_id: guest.id, updated_by: member.id })
      const hide = await member.client
        .from('notes')
        .update({ visibility: 'private' })
        .eq('id', guestShared.id)
        .select('id')
      expect(hide.error?.message).toBe('note_visibility_author_only')
      const deleted = await member.client
        .from('notes')
        .delete()
        .eq('id', guestShared.id)
        .select('id')
      expect(deleted.data ?? []).toHaveLength(0)
    }
    expect(await visibleNotes(owner, campaignId)).not.toContain(guestPrivate.id)

    // Removal behaves the same.
    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: other.id,
      }),
    )
    expect(noteRow(otherPrivate.id)).toBe(before.otherPrivate)
    expect(noteRow(otherShared.id)).toBe(before.otherShared)
    expect(await visibleNotes(other, campaignId)).toEqual([])
    expect((await addNote(other, campaignId)).error?.code).toBe('42501')
    expect(await visibleNotes(owner, campaignId)).toEqual([guestShared.id, otherShared.id].sort())
    const hideRemoved = await owner.client
      .from('notes')
      .update({ visibility: 'private' })
      .eq('id', otherShared.id)
      .select('id')
    expect(hideRemoved.error?.message).toBe('note_visibility_author_only')

    // Rejoin: the author reads and writes both again, and the shared note is theirs to manage.
    await invite(owner, campaignId, guest)
    expect(await visibleNotes(guest, campaignId)).toEqual(
      [guestPrivate.id, guestShared.id, otherShared.id].sort(),
    )
    const back = await guest.client
      .from('notes')
      .update({ body: 'welcome back' })
      .eq('id', guestPrivate.id)
      .select('body')
      .single()
    expect(back.data?.body).toBe('welcome back')
    const hideAgain = await guest.client
      .from('notes')
      .update({ visibility: 'private' })
      .eq('id', guestShared.id)
      .select('visibility')
      .single()
    expect(hideAgain.data?.visibility).toBe('private')
    const deleteAgain = await guest.client
      .from('notes')
      .delete()
      .eq('id', guestShared.id)
      .select('id')
    expect(deleteAgain.data).toHaveLength(1)
    assertInvariants(campaignId)
  } finally {
    await cleanup(players, ids)
  }
})

test('deleting a campaign removes every note, including a departed author’s', async () => {
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 cascade')
    const keepId = await createCampaign(owner, 'M4 cascade keep')
    ids.push(campaignId, keepId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    await created(guest, campaignId, { title: 'Goes with the campaign' })
    await created(other, campaignId, { title: 'Shared', visibility: 'campaign' })
    await created(owner, campaignId)
    await created(owner, keepId, { title: 'Stays' })
    await leave(guest, campaignId)
    expect(noteCount(campaignId)).toBe(3)

    const deleted = await owner.client.from('campaigns').delete().eq('id', campaignId).select('id')
    expect(deleted.data).toHaveLength(1)
    expect(noteCount(campaignId)).toBe(0)
    expect(noteCount(keepId)).toBe(1)
  } finally {
    await cleanup(players, ids)
  }
})

test.describe('concurrency', () => {
  test('two saves from the same version change exactly one row', async () => {
    const players = await newCast()
    const { owner, guest, other } = players
    const ids: string[] = []
    try {
      const campaignId = await createCampaign(owner, 'M4 race saves')
      ids.push(campaignId)
      await invite(owner, campaignId, guest)
      await invite(owner, campaignId, other)
      const note = await created(guest, campaignId, { title: 'Race', visibility: 'campaign' })

      const save = (player: Player, body: string) =>
        player.client
          .from('notes')
          .update({ body })
          .eq('id', note.id)
          .eq('updated_at', note.updated_at)
          .select('id, body')
          .maybeSingle()
      const [first, second] = await Promise.all([
        save(guest, 'from guest'),
        save(other, 'from other'),
      ])
      expect([first.error, second.error]).toEqual([null, null])
      expect([first.data, second.data].filter(Boolean)).toHaveLength(1)
      const winner = (first.data ?? second.data)!
      expect(noteRow(note.id)).toContain(`|${winner.body}|`)
      assertInvariants(campaignId)
    } finally {
      await cleanup(players, ids)
    }
  })

  test('a save racing a removal is either applied or finds nothing', async () => {
    test.setTimeout(90_000)
    const players = await newCast()
    const { owner, guest } = players
    const ids: string[] = []
    try {
      const campaignId = await createCampaign(owner, 'M4 race removal')
      ids.push(campaignId)
      await invite(owner, campaignId, guest)
      const mine = await created(guest, campaignId, { title: 'Mine' })
      const note = await created(owner, campaignId, { title: 'Shared', visibility: 'campaign' })
      expect(mine.id).not.toBe(note.id)

      const [save, removal] = await Promise.all([
        guest.client.from('notes').update({ body: 'racing' }).eq('id', note.id).select('id'),
        owner.client.rpc('remove_campaign_member', {
          p_campaign_id: campaignId,
          p_profile_id: guest.id,
        }),
      ])
      expect(removal.error).toBeNull()
      expect(save.error).toBeNull()
      expect([0, 1]).toContain((save.data ?? []).length)
      expect(noteRow(note.id)).toContain((save.data ?? []).length === 1 ? '|racing|' : '|Shared||')

      // After removal the guest reads and writes nothing.
      expect(await visibleNotes(guest, campaignId)).toEqual([])
      const late = await guest.client
        .from('notes')
        .update({ body: 'late' })
        .eq('id', note.id)
        .select('id')
      expect(late.data ?? []).toHaveLength(0)
      expect(noteCount(campaignId, guest.id)).toBe(1)
      assertInvariants(campaignId)
    } finally {
      await cleanup(players, ids)
    }
  })

  test('a link racing the character’s deletion ends cleared or refused, never dangling', async () => {
    test.setTimeout(90_000)
    const players = await newCast()
    const { owner, guest } = players
    const ids: string[] = []
    try {
      const campaignId = await createCampaign(owner, 'M4 race link')
      ids.push(campaignId)
      await invite(owner, campaignId, guest)
      for (let round = 0; round < 3; round += 1) {
        const characterId = await createdCharacter(guest, campaignId, `Racer ${round}`)
        const note = await created(guest, campaignId, { title: `Round ${round}` })
        const [link, removed] = await Promise.all([
          guest.client
            .from('notes')
            .update({ character_id: characterId })
            .eq('id', note.id)
            .select('id'),
          guest.client.from('characters').delete().eq('id', characterId),
        ])
        expect(removed.error).toBeNull()
        // The link is applied then cleared, or it loses the race and is refused.
        if (link.error) {
          expect(
            link.error.message === 'note_character_unavailable' || link.error.code === '23503',
          ).toBe(true)
        }
        expect(noteRow(note.id).endsWith('|~')).toBe(true)
      }
      assertInvariants(campaignId)
    } finally {
      await cleanup(players, ids)
    }
  })
})

test('players write private and shared notes at the crates, and a second player edits the shared one', async ({
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
    const campaignId = await createCampaign(owner, 'M4 real-stack notes')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    const openNotes = async (page: Awaited<ReturnType<typeof signIn>>['page']) => {
      await page.goto(`/app/campaigns/${campaignId}`)
      await page
        .getByRole('list', { name: 'Camp places' })
        .getByRole('button', { name: /^Notes/ })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Notes & NPCs' })
      await expect(dialog).toBeVisible()
      return dialog
    }

    // The owner writes a private note and a shared one; both survive a reload.
    const first = await signIn(owner)
    try {
      const { page } = first
      let dialog = await openNotes(page)
      await expect(dialog.getByText('No notes yet. Write the first one.')).toBeVisible()
      await dialog.getByRole('button', { name: 'New note' }).click()
      await dialog.getByLabel('Title', { exact: true }).fill('Private plot')
      await dialog.getByLabel(/^Note/).fill('Only I know this.')
      await dialog.getByRole('button', { name: 'Create note' }).click()
      await expect(dialog.getByRole('heading', { name: 'Private plot' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Back to notes' }).click()

      await dialog.getByRole('button', { name: 'New note' }).click()
      await dialog.getByLabel('Title', { exact: true }).fill('Shared plan')
      await dialog.getByLabel(/^Note/).fill('Meet at the gate.')
      await dialog.getByRole('radio', { name: 'Shared with the campaign' }).check()
      await dialog.getByRole('button', { name: 'Create note' }).click()
      await expect(dialog.getByRole('heading', { name: 'Shared plan' })).toBeVisible()

      // What the screen shows is what the database holds.
      await expect
        .poll(() =>
          localDatabaseQuery(
            `select string_agg(title || '|' || visibility || '|' || body, ';' order by title)
             from public.notes where campaign_id = '${campaignId}';`,
            {},
          ),
        )
        .toBe('Private plot|private|Only I know this.;Shared plan|campaign|Meet at the gate.')

      dialog = await openNotes(page)
      await expect(
        dialog.getByRole('region', { name: 'Only you' }).getByRole('button', {
          name: /Private plot/,
        }),
      ).toBeVisible()
      await expect(
        dialog.getByRole('region', { name: 'Shared with the campaign' }).getByRole('button', {
          name: /Shared plan/,
        }),
      ).toBeVisible()
    } finally {
      await first.context.close()
    }

    // A second player sees only the shared note and edits it.
    const second = await signIn(guest)
    try {
      const { page } = second
      const dialog = await openNotes(page)
      await expect(dialog.getByRole('button', { name: /Shared plan/ })).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Private plot/ })).toHaveCount(0)
      await dialog.getByRole('button', { name: /Shared plan/ }).click()
      await expect(dialog.getByRole('button', { name: 'Delete note' })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Edit note' }).click()
      await dialog.getByLabel(/^Note/).fill('Meet at the gate at dawn.')
      await dialog.getByRole('button', { name: 'Save note' }).click()
      await expect(dialog.getByText('Note saved.')).toBeVisible()
      await expect
        .poll(() =>
          localDatabaseQuery(
            `select body || '|' || (updated_by = '${guest.id}')
             from public.notes where campaign_id = '${campaignId}' and title = 'Shared plan';`,
            {},
          ),
        )
        .toBe('Meet at the gate at dawn.|true')
    } finally {
      await second.context.close()
    }

    // The author sees the edit and who made it after reopening.
    const third = await signIn(owner)
    try {
      const { page } = third
      const dialog = await openNotes(page)
      await expect(
        dialog.locator('.note-row', { has: page.getByRole('button', { name: /Shared plan/ }) }),
      ).toContainText(`Edited by ${guest.username}`)
      await dialog.getByRole('button', { name: /Shared plan/ }).click()
      await expect(dialog.locator('.note-body')).toHaveText('Meet at the gate at dawn.')
      await expect(dialog.getByText(`Edited by ${guest.username}`)).toBeVisible()
    } finally {
      await third.context.close()
    }
  } finally {
    await cleanup(players, ids)
  }
})
