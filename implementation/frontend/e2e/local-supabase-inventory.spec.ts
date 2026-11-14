import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  RANDOM_ID,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M03.3 inventory and currency (Phase 1): schema, RLS, and integrity against the real local stack.

const ROLES = ['anon', 'authenticated', 'service_role', 'public']

// Rolled-back fixture: campaign c1 owned by a1 with member b2.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'm3-owner@example.test'),
         ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'm3-member@example.test');
insert into public.campaigns (id, name, owner_id)
  values ('00000000-0000-4000-8000-0000000000c1', 'M3 fixture', '00000000-0000-4000-8000-0000000000a1');
insert into public.campaign_members (campaign_id, profile_id, role)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'member');
set constraints all immediate;
set constraints all deferred;
insert into public.characters (id, campaign_id, owner_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
          '00000000-0000-4000-8000-0000000000b2', 'Fixture');
insert into public.character_sheets (character_id) values ('00000000-0000-4000-8000-0000000000e1');
`
const MEMBER = "'00000000-0000-4000-8000-0000000000b2'"
const CAMPAIGN = "'00000000-0000-4000-8000-0000000000c1'"
const CHARACTER = "'00000000-0000-4000-8000-0000000000e1'"

function insertItem(extra: Record<string, string> = { name: "'Rope'" }, character = CHARACTER) {
  const columns = ['character_id', ...Object.keys(extra)].join(', ')
  const values = [character, ...Object.values(extra)].join(', ')
  return `insert into public.character_items (${columns}) values (${values})`
}

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

test.describe('catalog and privileges', () => {
  test('RLS is on and the item grants are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity from pg_class where oid = 'public.character_items'::regclass;`,
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
        holders((r) => `has_table_privilege(${r}, 'public.character_items', '${privilege}')`),
        privilege,
      ).toBe(expected)
    }

    const columns = [
      'id',
      'character_id',
      'name',
      'quantity',
      'weight',
      'description',
      'equipped',
      'attuned',
      'created_at',
      'updated_at',
    ]
    const withPrivilege = (role: string, privilege: string) =>
      localDatabaseQuery(
        `select coalesce(string_agg(c, ',' order by c), '') from unnest(array['${columns.join("','")}']) c
         where has_column_privilege('${role}', 'public.character_items', c, '${privilege}');`,
        {},
      )
    expect(withPrivilege('authenticated', 'insert')).toBe(
      'attuned,character_id,description,equipped,name,quantity,weight',
    )
    expect(withPrivilege('authenticated', 'update')).toBe(
      'attuned,description,equipped,name,quantity,weight',
    )
    for (const role of ['anon', 'service_role', 'public']) {
      for (const privilege of ['select', 'insert', 'update']) {
        expect(withPrivilege(role, privilege), `${role} ${privilege}`).toBe('')
      }
    }
  })

  test('the purse columns are readable, never writable, by authenticated', () => {
    const purse = ['cp', 'sp', 'gp']
    const withPrivilege = (role: string, privilege: string) =>
      localDatabaseQuery(
        `select coalesce(string_agg(c, ',' order by c), '') from unnest(array['${purse.join("','")}']) c
         where has_column_privilege('${role}', 'public.character_sheets', c, '${privilege}');`,
        {},
      )
    expect(withPrivilege('authenticated', 'select')).toBe('cp,gp,sp')
    for (const privilege of ['insert', 'update']) {
      expect(withPrivilege('authenticated', privilege), privilege).toBe('')
    }
    for (const role of ['anon', 'service_role', 'public']) {
      expect(withPrivilege(role, 'select'), role).toBe('')
    }

    // Coins stop at gold: there are no electrum or platinum columns.
    expect(
      localDatabaseQuery(
        `select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'character_sheets' and column_name in ('ep', 'pp');`,
        {},
      ),
    ).toBe('0')

    // The existing column grants on the sheet are unchanged.
    expect(
      localDatabaseQuery(
        `select string_agg(c, ',' order by c) from unnest(array['character_id','max_hp','current_hp','temp_hp','armor_class','speed','sheet','updated_at']) c
         where has_column_privilege('authenticated', 'public.character_sheets', c, 'update');`,
        {},
      ),
    ).toBe('armor_class,current_hp,max_hp,sheet,speed,temp_hp')
  })

  test('the guard function is postgres-only and the policies are the planned four', () => {
    expect(
      holders(
        (r) => `has_function_privilege(${r}, 'private.guard_character_item_write()', 'execute')`,
      ),
    ).toBe('')
    expect(
      localDatabaseQuery(
        `select string_agg(cmd, ',' order by cmd) from pg_policies
         where schemaname = 'public' and tablename = 'character_items';`,
        {},
      ),
    ).toBe('DELETE,INSERT,SELECT,UPDATE')
    expect(
      localDatabaseQuery(
        `select string_agg(tgname, ',' order by tgname) from pg_trigger
         where tgrelid = 'public.character_items'::regclass and not tgisinternal;`,
        {},
      ),
    ).toBe('character_items_guard_write,character_items_set_updated_at')
    expect(
      localDatabaseQuery(
        `select indexdef from pg_indexes where indexname = 'character_items_character_id_idx';`,
        {},
      ),
    ).toContain('(character_id)')
  })
})

test.describe('database integrity (as postgres, rolled back)', () => {
  test('item checks bound names, quantity, weight, and descriptions', () => {
    const bad: [Record<string, string>, string][] = [
      [{ name: "''" }, 'character_items_name_check'],
      [{ name: "' padded '" }, 'character_items_name_check'],
      [{ name: "repeat('x', 81)" }, 'character_items_name_check'],
      [{ name: "E'tab\\there'" }, 'character_items_name_check'],
      [{ name: "'ok'", quantity: '-1' }, 'character_items_quantity_check'],
      [{ name: "'ok'", quantity: '10000' }, 'character_items_quantity_check'],
      [{ name: "'ok'", weight: '-0.01' }, 'character_items_weight_check'],
      // numeric(7, 2) overflows before the check runs, so the bound reports as an overflow.
      [{ name: "'ok'", weight: '100000' }, 'numeric field overflow'],
      [{ name: "'ok'", weight: '99999.999' }, 'numeric field overflow'],
      [{ name: "'ok'", description: "''" }, 'character_items_description_check'],
      [{ name: "'ok'", description: "repeat('x', 2001)" }, 'character_items_description_check'],
      [{ name: "'ok'", description: "E'bell\\x07'" }, 'character_items_description_check'],
      [{ name: "'ok'", description: "E'nul\\x7f'" }, 'character_items_description_check'],
    ]
    for (const [columns, constraint] of bad) {
      expect(
        sqlError(`${fixture}
${insertItem(columns)};
rollback;`),
        JSON.stringify(columns),
      ).toContain(constraint)
    }

    // Boundaries and the allowed whitespace are accepted.
    const result = localDatabaseQuery(
      `${fixture}
${insertItem({ name: `repeat('x', 80)`, quantity: '0', weight: '0', description: `repeat('d', 2000)` })};
${insertItem({ name: `'Max'`, quantity: '9999', weight: '99999.99', description: `E'line one\\nline\\ttwo'` })};
${insertItem({ name: `'Fractional'`, weight: '0.25' })};
select 'rows:' || count(*) || ',weight:' || (select weight from public.character_items where character_id = ${CHARACTER} and name = 'Fractional')
from public.character_items where character_id = ${CHARACTER};
rollback;`,
      {},
    )
    expect(result).toContain('rows:3,weight:0.25')
  })

  test('an item can never move to another character or change its id', () => {
    for (const change of [
      `character_id = '00000000-0000-4000-8000-0000000000e2'`,
      `id = gen_random_uuid()`,
    ]) {
      expect(
        sqlError(`${fixture}
insert into public.characters (id, campaign_id, owner_id, name, status)
  values ('00000000-0000-4000-8000-0000000000e2', ${CAMPAIGN}, ${MEMBER}, 'Second', 'retired');
${insertItem()};
update public.character_items set ${change} where character_id = ${CHARACTER};
rollback;`),
        change,
      ).toContain('item_reassignment_forbidden')
    }
  })

  test('the 201st item is refused for every write path, and other characters keep their own count', () => {
    const second = `insert into public.characters (id, campaign_id, owner_id, name, status)
  values ('00000000-0000-4000-8000-0000000000e2', ${CAMPAIGN}, ${MEMBER}, 'Second', 'retired');`
    const fill = `insert into public.character_items (character_id, name)
  select ${CHARACTER}, 'Item ' || n from generate_series(1, 200) n;`

    expect(
      sqlError(`${fixture}
${fill}
${insertItem({ name: "'One too many'" })};
rollback;`),
    ).toContain('item_limit_reached')

    // 199 items leave room for exactly one more.
    expect(
      sqlError(`${fixture}
insert into public.character_items (character_id, name)
  select ${CHARACTER}, 'Item ' || n from generate_series(1, 199) n;
${insertItem({ name: "'The 200th'" })};
rollback;`),
    ).toBe('')

    // The cap is per character, and deleting an item frees a slot.
    const result = localDatabaseQuery(
      `${fixture}
${second}
${fill}
${insertItem({ name: "'Elsewhere'" }, "'00000000-0000-4000-8000-0000000000e2'")};
delete from public.character_items where character_id = ${CHARACTER} and name = 'Item 1';
${insertItem({ name: "'Replacement'" })};
select 'counts:' || (select count(*) from public.character_items where character_id = ${CHARACTER})
  || ',' || (select count(*) from public.character_items where character_id = '00000000-0000-4000-8000-0000000000e2');
rollback;`,
      {},
    )
    expect(result).toContain('counts:200,1')
  })

  test('the currency check refuses negative balances and balances above the limit', () => {
    for (const [change, label] of [
      ['gp = -1', 'negative'],
      ['cp = -1', 'negative cp'],
      ['gp = 10000000', 'above the limit'],
      ['sp = 10000000', 'above the limit sp'],
      ['cp = 10000000', 'above the limit cp'],
    ]) {
      expect(
        sqlError(`${fixture}
update public.character_sheets set ${change} where character_id = ${CHARACTER};
rollback;`),
        label,
      ).toContain('character_sheets_currency_check')
    }
    const result = localDatabaseQuery(
      `${fixture}
update public.character_sheets set cp = 9999999, sp = 0, gp = 9999999 where character_id = ${CHARACTER};
select 'ok:' || cp || ',' || gp from public.character_sheets where character_id = ${CHARACTER};
rollback;`,
      {},
    )
    expect(result).toContain('ok:9999999,9999999')
  })

  test('updated_at moves on item updates only', () => {
    const result = localDatabaseQuery(
      `${fixture}
${insertItem({ name: "'Rope'", updated_at: "now() - interval '1 day'" })};
select 'stale:' || (updated_at < now() - interval '1 hour') from public.character_items where character_id = ${CHARACTER};
update public.character_items set quantity = 2 where character_id = ${CHARACTER};
select 'moved:' || (updated_at > now() - interval '1 minute') from public.character_items where character_id = ${CHARACTER};
rollback;`,
      {},
    )
    expect(result).toContain('stale:true')
    expect(result).toContain('moved:true')
  })

  test('items cascade from characters, campaigns, and accounts, scoped to this fixture', () => {
    const count = `(select count(*) from public.character_items where character_id = ${CHARACTER})`
    const result = localDatabaseQuery(
      `${fixture}
${insertItem()};
${insertItem({ name: "'Torch'" })};
select 'before:' || ${count};
delete from public.characters where id = ${CHARACTER};
select 'after_character:' || ${count};
insert into public.characters (id, campaign_id, owner_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', ${CAMPAIGN}, ${MEMBER}, 'Again');
${insertItem()};
delete from public.campaigns where id = ${CAMPAIGN};
select 'after_campaign:' || ${count};
rollback;`,
      {},
    )
    expect(result).toContain('before:2')
    expect(result).toContain('after_character:0')
    expect(result).toContain('after_campaign:0')

    const account = localDatabaseQuery(
      `${fixture}
${insertItem()};
delete from auth.users where id = ${MEMBER};
select 'after_account:' || ${count};
rollback;`,
      {},
    )
    expect(account).toContain('after_account:0')
  })
})

// --- Row-level security through the API with real accounts ---------------------------

type Cast = Record<'owner' | 'guest' | 'other' | 'outsider', Player>

async function newCast() {
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  return players as Cast
}

async function createdCharacter(player: Player, campaignId: string, name = 'Hero') {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: name,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

const itemFields =
  'id, character_id, name, quantity, weight, description, equipped, attuned, updated_at'

function addItem(player: Player, characterId: string, extra: Record<string, unknown> = {}) {
  return player.client
    .from('character_items')
    .insert({ character_id: characterId, name: 'Rope', ...extra })
    .select(itemFields)
    .single()
}

function itemRow(id: string) {
  return localDatabaseQuery(
    `select name || '|' || quantity || '|' || coalesce(weight::text, '~') || '|' || equipped || '|' || attuned
            || '|' || character_id
     from public.character_items where id = '${id}';`,
    {},
  )
}

function itemCount(characterId: string) {
  return Number(
    localDatabaseQuery(
      `select count(*) from public.character_items where character_id = '${characterId}';`,
      {},
    ),
  )
}

function purse(characterId: string) {
  return localDatabaseQuery(
    `select cp || ',' || sp || ',' || gp
     from public.character_sheets where character_id = '${characterId}';`,
    {},
  )
}

async function visibleItems(player: Player, characterId: string) {
  const { data, error } = await player.client
    .from('character_items')
    .select('id')
    .eq('character_id', characterId)
  expect(error).toBeNull()
  return data!.length
}

async function visiblePurse(player: Player, characterId: string) {
  const { data, error } = await player.client
    .from('character_sheets')
    .select('cp, sp, gp')
    .eq('character_id', characterId)
  expect(error).toBeNull()
  return data!.length
}

test('a new character starts with an empty purse and no items', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 defaults')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdCharacter(guest, campaignId)

    expect(purse(characterId)).toBe('0,0,0')
    expect(itemCount(characterId)).toBe(0)
    const { data, error } = await guest.client
      .from('character_sheets')
      .select('cp, sp, gp')
      .eq('character_id', characterId)
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ cp: 0, sp: 0, gp: 0 })
  } finally {
    await cleanup(players, ids)
  }
})

test('the owner adds, edits, equips, attunes, adjusts, and deletes items; checks reject bad input', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 item crud')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdCharacter(guest, campaignId)

    // Add: defaults, then the returned row.
    const added = await addItem(guest, characterId, {
      name: 'Arrows',
      quantity: 20,
      weight: 0.5,
      description: 'Line one\nLine two',
    })
    expect(added.error).toBeNull()
    expect(added.data).toMatchObject({
      character_id: characterId,
      name: 'Arrows',
      quantity: 20,
      weight: 0.5,
      description: 'Line one\nLine two',
      equipped: false,
      attuned: false,
    })
    const item = added.data!

    // Edit with the previous updated_at: applies and advances the stamp.
    const edited = await guest.client
      .from('character_items')
      .update({ name: 'Silver arrows', quantity: 18, weight: null, description: null })
      .eq('id', item.id)
      .eq('updated_at', item.updated_at)
      .select(itemFields)
      .maybeSingle()
    expect(edited.error).toBeNull()
    expect(edited.data).toMatchObject({
      name: 'Silver arrows',
      quantity: 18,
      weight: null,
      description: null,
    })
    expect(edited.data!.updated_at).not.toBe(item.updated_at)

    // A stale stamp matches no row and changes nothing.
    const stale = await guest.client
      .from('character_items')
      .update({ name: 'Stale write' })
      .eq('id', item.id)
      .eq('updated_at', item.updated_at)
      .select(itemFields)
      .maybeSingle()
    expect(stale.error).toBeNull()
    expect(stale.data).toBeNull()
    expect(itemRow(item.id)).toContain('Silver arrows|18')

    // Equip and attune are independent toggles that also advance the stamp.
    const equipped = await guest.client
      .from('character_items')
      .update({ equipped: true })
      .eq('id', item.id)
      .select(itemFields)
      .single()
    expect(equipped.data).toMatchObject({ equipped: true, attuned: false })
    expect(equipped.data!.updated_at).not.toBe(edited.data!.updated_at)
    const attuned = await guest.client
      .from('character_items')
      .update({ attuned: true })
      .eq('id', item.id)
      .select(itemFields)
      .single()
    expect(attuned.data).toMatchObject({ equipped: true, attuned: true })

    // Quantity 0 keeps the item.
    const used = await guest.client
      .from('character_items')
      .update({ quantity: 0 })
      .eq('id', item.id)
      .select(itemFields)
      .single()
    expect(used.data!.quantity).toBe(0)

    // The owner reads their own items; an item with a name only is accepted.
    expect(await visibleItems(guest, characterId)).toBe(1)

    // Bad input: every boundary is rejected with a check violation (23514).
    const bad: [Record<string, unknown>, string, string?][] = [
      [{ name: '' }, 'character_items_name_check'],
      [{ name: '  padded  ' }, 'character_items_name_check'],
      [{ name: 'x'.repeat(81) }, 'character_items_name_check'],
      [{ name: 'tab\there' }, 'character_items_name_check'],
      [{ quantity: -1 }, 'character_items_quantity_check'],
      [{ quantity: 10000 }, 'character_items_quantity_check'],
      [{ weight: 100000 }, 'numeric field overflow', '22003'],
      [{ weight: -1 }, 'character_items_weight_check'],
      [{ description: 'x'.repeat(2001) }, 'character_items_description_check'],
      [{ description: 'bell\u0007' }, 'character_items_description_check'],
    ]
    for (const [columns, constraint, code] of bad) {
      const result = await addItem(guest, characterId, columns)
      expect(result.error?.code, JSON.stringify(columns)).toBe(code ?? '23514')
      expect(result.error?.message, JSON.stringify(columns)).toContain(constraint)
    }
    expect(itemCount(characterId)).toBe(1)

    // Delete returns the row; deleting again matches nothing.
    const removed = await guest.client
      .from('character_items')
      .delete()
      .eq('id', item.id)
      .select('id')
      .maybeSingle()
    expect(removed.error).toBeNull()
    expect(removed.data?.id).toBe(item.id)
    const again = await guest.client
      .from('character_items')
      .delete()
      .eq('id', item.id)
      .select('id')
      .maybeSingle()
    expect(again.data).toBeNull()
    expect(itemCount(characterId)).toBe(0)
  } finally {
    await cleanup(players, ids)
  }
})

test('the item cap holds through the API', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 item cap')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdCharacter(guest, campaignId)

    localDatabaseQuery(
      `insert into public.character_items (character_id, name)
       select '${characterId}', 'Item ' || n from generate_series(1, 199) n;`,
      {},
    )
    expect((await addItem(guest, characterId, { name: 'The 200th' })).error).toBeNull()
    const refused = await addItem(guest, characterId, { name: 'The 201st' })
    expect(refused.error?.message).toBe('item_limit_reached')
    expect(itemCount(characterId)).toBe(200)

    // Deleting one frees a slot.
    await guest.client.from('character_items').delete().eq('name', 'Item 1')
    expect((await addItem(guest, characterId, { name: 'Replacement' })).error).toBeNull()
    expect(itemCount(characterId)).toBe(200)

    // Five parallel inserts at 199 items: exactly one succeeds.
    await guest.client.from('character_items').delete().eq('name', 'Item 2')
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, n) => addItem(guest, characterId, { name: `Racer ${n}` })),
    )
    expect(results.filter((result) => result.error === null)).toHaveLength(1)
    expect(results.filter((result) => result.error?.message === 'item_limit_reached')).toHaveLength(
      4,
    )
    expect(itemCount(characterId)).toBe(200)
  } finally {
    await cleanup(players, ids)
  }
})

test('the API cannot create items for others, move items, set balances, or force columns', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 bypass')
    const outsiderCampaignId = await createCampaign(outsider, 'M3 bypass other')
    ids.push(campaignId, outsiderCampaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const guestCharacter = await createdCharacter(guest, campaignId, 'Guest Hero')
    const otherCharacter = await createdCharacter(other, campaignId, 'Other Hero')
    const outsiderCharacter = await createdCharacter(outsider, outsiderCampaignId, 'Far Hero')
    const guestItem = (await addItem(guest, guestCharacter, { name: 'Guarded' })).data!

    // Sharing the sheet gives other members read access but never write access.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', guestCharacter)

    // Insert for another player's character or one in a campaign the caller is not in: RLS.
    for (const [who, target] of [
      [other, guestCharacter],
      [owner, guestCharacter],
      [outsider, guestCharacter],
      [guest, outsiderCharacter],
      [guest, RANDOM_ID],
    ] as [Player, string][]) {
      const result = await addItem(who, target, { name: 'Smuggled' })
      expect(result.error?.code, `${who.username} → ${target}`).toBe('42501')
    }
    expect(itemCount(guestCharacter)).toBe(1)
    expect(itemCount(outsiderCharacter)).toBe(0)

    // Columns without a grant: character_id, id, and the timestamps.
    expect(
      (
        await guest.client
          .from('character_items')
          .update({ character_id: otherCharacter })
          .eq('id', guestItem.id)
      ).error?.code,
    ).toBe('42501')
    expect(itemRow(guestItem.id)).toContain(guestCharacter)
    for (const forced of [
      { id: crypto.randomUUID() },
      { created_at: '2000-01-01T00:00:00Z' },
      { updated_at: '2000-01-01T00:00:00Z' },
    ]) {
      const result = await addItem(guest, guestCharacter, { name: 'Forced', ...forced })
      expect(result.error?.code, JSON.stringify(forced)).toBe('42501')
    }
    expect(
      (
        await guest.client
          .from('character_items')
          .update({ updated_at: '2000-01-01T00:00:00Z' })
          .eq('id', guestItem.id)
      ).error?.code,
    ).toBe('42501')

    // Other members, the campaign owner, and outsiders update or delete nothing.
    for (const who of [other, owner, outsider]) {
      const update = await who.client
        .from('character_items')
        .update({ name: 'Hijacked', quantity: 9 })
        .eq('id', guestItem.id)
        .select('id')
      expect(update.error).toBeNull()
      expect(update.data ?? []).toHaveLength(0)
      const deleted = await who.client
        .from('character_items')
        .delete()
        .eq('id', guestItem.id)
        .select('id')
      expect(deleted.error).toBeNull()
      expect(deleted.data ?? []).toHaveLength(0)
    }
    expect(itemRow(guestItem.id)).toBe(`Guarded|1|~|false|false|${guestCharacter}`)

    // Balances cannot be written directly, by anyone, including the sheet's owner.
    for (const who of [guest, other, owner]) {
      for (const column of ['cp', 'sp', 'gp']) {
        const result = await who.client
          .from('character_sheets')
          .update({ [column]: 5 })
          .eq('character_id', guestCharacter)
          .select('character_id')
        expect(result.error?.code, `${who.username} ${column}`).toBe('42501')
      }
    }
    expect(purse(guestCharacter)).toBe('0,0,0')
  } finally {
    await cleanup(players, ids)
  }
})

test('visibility: items and coins follow the sheet; the campaign owner has no override', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 visibility')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = await createdCharacter(guest, campaignId)
    await addItem(guest, characterId, { name: 'Lantern' })
    localDatabaseQuery(
      `update public.character_sheets set gp = 12 where character_id = '${characterId}';`,
      {},
    )

    // Private by default: only the character owner reads items and balances.
    const reads = async () => [
      [
        await visibleItems(owner, characterId),
        await visibleItems(guest, characterId),
        await visibleItems(other, characterId),
        await visibleItems(outsider, characterId),
      ],
      [
        await visiblePurse(owner, characterId),
        await visiblePurse(guest, characterId),
        await visiblePurse(other, characterId),
        await visiblePurse(outsider, characterId),
      ],
    ]
    expect(await reads()).toEqual([
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ])

    // Sharing opens both to current members, and to nobody else.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
    expect(await reads()).toEqual([
      [1, 1, 1, 0],
      [1, 1, 1, 0],
    ])
    const seen = await other.client
      .from('character_sheets')
      .select('gp')
      .eq('character_id', characterId)
      .single()
    expect(seen.data).toEqual({ gp: 12 })

    // Members who can read still cannot write (covered in depth by the bypass test).
    const write = await other.client
      .from('character_items')
      .update({ quantity: 5 })
      .eq('character_id', characterId)
      .select('id')
    expect(write.data ?? []).toHaveLength(0)

    // Unsharing hides both again on the next read.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'private' })
      .eq('id', characterId)
    expect(await reads()).toEqual([
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ])
  } finally {
    await cleanup(players, ids)
  }
})

test('leaving or removal keeps items and coins and revokes access; rejoining restores it', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 departure')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const leaverId = await createdCharacter(guest, campaignId, 'Leaver')
    const removedId = await createdCharacter(other, campaignId, 'Removed')
    const leaverItem = (await addItem(guest, leaverId, { name: 'Leaver sword', quantity: 3 })).data!
    const removedItem = (await addItem(other, removedId, { name: 'Removed bow' })).data!
    localDatabaseQuery(
      `update public.character_sheets set gp = 40, cp = 7 where character_id = '${leaverId}';
       update public.character_sheets set sp = 2 where character_id = '${removedId}';`,
      {},
    )
    for (const [player, id] of [
      [guest, leaverId],
      [other, removedId],
    ] as [Player, string][]) {
      await player.client.from('characters').update({ sheet_visibility: 'campaign' }).eq('id', id)
    }
    expect(await visibleItems(owner, leaverId)).toBe(1)
    expect(await visibleItems(other, leaverId)).toBe(1)

    // Leave: the data stays, every read and write stops, and remaining members stop seeing it.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(itemRow(leaverItem.id)).toBe(`Leaver sword|3|~|false|false|${leaverId}`)
    expect(purse(leaverId)).toBe('7,0,40')
    expect(await visibleItems(guest, leaverId)).toBe(0)
    expect(await visiblePurse(guest, leaverId)).toBe(0)
    expect([await visibleItems(owner, leaverId), await visibleItems(other, leaverId)]).toEqual([
      0, 0,
    ])
    expect([await visiblePurse(owner, leaverId), await visiblePurse(other, leaverId)]).toEqual([
      0, 0,
    ])
    expect((await addItem(guest, leaverId, { name: 'Late' })).error?.code).toBe('42501')
    const update = await guest.client
      .from('character_items')
      .update({ quantity: 99 })
      .eq('id', leaverItem.id)
      .select('id')
    expect(update.data ?? []).toHaveLength(0)
    const deleted = await guest.client
      .from('character_items')
      .delete()
      .eq('id', leaverItem.id)
      .select('id')
    expect(deleted.data ?? []).toHaveLength(0)
    expect(itemRow(leaverItem.id)).toBe(`Leaver sword|3|~|false|false|${leaverId}`)

    // Removal behaves the same.
    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: other.id,
      }),
    )
    expect(itemRow(removedItem.id)).toBe(`Removed bow|1|~|false|false|${removedId}`)
    expect(purse(removedId)).toBe('0,2,0')
    expect(await visibleItems(other, removedId)).toBe(0)
    expect(await visibleItems(owner, removedId)).toBe(0)
    expect((await addItem(other, removedId, { name: 'Late' })).error?.code).toBe('42501')

    // Rejoin: the same rows are readable and writable again.
    await invite(owner, campaignId, guest)
    expect(await visibleItems(guest, leaverId)).toBe(1)
    expect(await visiblePurse(guest, leaverId)).toBe(1)
    expect(await visibleItems(owner, leaverId)).toBe(1)
    const back = await guest.client
      .from('character_items')
      .update({ quantity: 4 })
      .eq('id', leaverItem.id)
      .select('quantity')
      .single()
    expect(back.data).toEqual({ quantity: 4 })
    expect((await addItem(guest, leaverId, { name: 'Welcome back' })).error).toBeNull()
  } finally {
    await cleanup(players, ids)
  }
})

test('deleting a character or a campaign removes its items, including a departed player’s', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 cascade')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const guestCharacter = await createdCharacter(guest, campaignId, 'Leaver')
    const otherCharacter = await createdCharacter(other, campaignId, 'Stayer')
    await addItem(guest, guestCharacter, { name: 'A' })
    await addItem(guest, guestCharacter, { name: 'B' })
    await addItem(other, otherCharacter, { name: 'C' })

    const count = () =>
      localDatabaseQuery(
        `select count(*) from public.character_items i
         join public.characters c on c.id = i.character_id
         where c.campaign_id = '${campaignId}';`,
        {},
      )
    expect(count()).toBe('3')

    // The owner deletes their character: its items go, the other character's stay.
    const removed = await other.client
      .from('characters')
      .delete()
      .eq('id', otherCharacter)
      .select('id')
    expect(removed.data).toHaveLength(1)
    expect(count()).toBe('2')

    // A departed player's items are removed with the campaign.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(count()).toBe('2')
    const { error } = await owner.client.from('campaigns').delete().eq('id', campaignId)
    expect(error).toBeNull()
    expect(
      localDatabaseQuery(
        `select count(*) from public.character_items
         where character_id in ('${guestCharacter}', '${otherCharacter}');`,
        {},
      ),
    ).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})

// --- Phase 2: delta RPCs, departure, concurrency, and the sheet token -----------------

type PurseRow = { cp: number; sp: number; gp: number; updated_at: string }
type Deltas = {
  p_cp?: number | null
  p_sp?: number | null
  p_gp?: number | null
}

function adjustCurrency(player: Player, characterId: string, deltas: Deltas = {}) {
  return player.client.rpc('adjust_character_currency', { p_character_id: characterId, ...deltas })
}

async function currencyOk(player: Player, characterId: string, deltas: Deltas) {
  const { data, error } = await adjustCurrency(player, characterId, deltas)
  expect(error?.message ?? null).toBeNull()
  return (data as PurseRow[])[0]
}

function adjustQuantity(player: Player, itemId: string, delta: number | null) {
  return player.client.rpc('adjust_character_item_quantity', { p_item_id: itemId, p_delta: delta })
}

function sheetStamp(characterId: string) {
  return localDatabaseQuery(
    `select updated_at::text from public.character_sheets where character_id = '${characterId}';`,
    {},
  )
}

// The invariants of plan §4.5 for one campaign. Returns the number of violations.
function inventoryViolations(campaignId: string) {
  return localDatabaseQuery(
    `select
       (select count(*) from public.character_sheets s join public.characters c on c.id = s.character_id
        where c.campaign_id = '${campaignId}'
          and (least(s.cp, s.sp, s.gp) < 0 or greatest(s.cp, s.sp, s.gp) > 9999999))
     + (select count(*) from (
          select i.character_id from public.character_items i join public.characters c on c.id = i.character_id
          where c.campaign_id = '${campaignId}' group by i.character_id having count(*) > 200) over_cap)
     + (select count(*) from public.character_items i join public.characters c on c.id = i.character_id
        where c.campaign_id = '${campaignId}' and (i.quantity < 0 or i.quantity > 9999));`,
    {},
  )
}

test('the delta RPCs are executable only by authenticated users', () => {
  for (const fn of [
    'public.adjust_character_currency(uuid, integer, integer, integer)',
    'public.adjust_character_item_quantity(uuid, integer)',
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
})

test('adjust_character_currency adds and spends atomically and validates its input', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 currency')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdCharacter(guest, campaignId)

    // Several denominations in one call; the result matches the row, and a null delta is zero.
    const first = await currencyOk(guest, characterId, { p_gp: 15, p_sp: 4, p_cp: null })
    expect(first).toMatchObject({ cp: 0, sp: 4, gp: 15 })
    expect(purse(characterId)).toBe('0,4,15')
    expect(first.updated_at).not.toBeNull()
    expect(new Date(first.updated_at).getTime()).toBe(new Date(sheetStamp(characterId)).getTime())

    // Add and spend in the same call (a trade).
    const trade = await currencyOk(guest, characterId, { p_gp: 5, p_sp: -3, p_cp: 1 })
    expect(trade).toMatchObject({ cp: 1, sp: 1, gp: 20 })
    expect(new Date(trade.updated_at).getTime()).toBeGreaterThan(
      new Date(first.updated_at).getTime(),
    )

    // Overspending one denomination changes nothing, including the ones that would stay positive.
    const before = purse(characterId)
    const stampBefore = sheetStamp(characterId)
    for (const deltas of [
      { p_gp: 3, p_sp: -2 },
      { p_gp: -21 },
      { p_cp: -2 },
      { p_cp: -2, p_gp: -1 },
    ]) {
      expect(
        (await rpcError(adjustCurrency(guest, characterId, deltas))).message,
        JSON.stringify(deltas),
      ).toBe('currency_insufficient')
    }
    expect(purse(characterId)).toBe(before)
    expect(sheetStamp(characterId)).toBe(stampBefore)

    // Spending everything is allowed (exactly zero).
    expect(await currencyOk(guest, characterId, { p_gp: -20, p_sp: -1, p_cp: -1 })).toMatchObject({
      cp: 0,
      sp: 0,
      gp: 0,
    })

    // The upper limit refuses the whole change.
    await currencyOk(guest, characterId, { p_gp: 9_999_999 })
    expect((await rpcError(adjustCurrency(guest, characterId, { p_gp: 1, p_sp: 5 }))).message).toBe(
      'currency_limit_exceeded',
    )
    expect(purse(characterId)).toBe('0,0,9999999')
    await currencyOk(guest, characterId, { p_gp: -9_999_999 })

    // Out-of-range deltas and a missing character are argument errors (22023).
    for (const deltas of [{ p_gp: 10_000_000 }, { p_cp: -10_000_000 }, { p_sp: 2_147_483_647 }]) {
      const failure = await rpcError(adjustCurrency(guest, characterId, deltas))
      expect([failure.code, failure.message], JSON.stringify(deltas)).toEqual([
        '22023',
        'currency_amount_invalid',
      ])
    }
    const missing = await rpcError(adjustCurrency(guest, null as unknown as string, { p_gp: 1 }))
    expect([missing.code, missing.message]).toEqual(['22023', 'currency_required'])

    // An all-zero call is a no-op: no write, the stamp does not move.
    const stamp = sheetStamp(characterId)
    const noop = await currencyOk(guest, characterId, {})
    expect(noop).toMatchObject({ cp: 0, sp: 0, gp: 0 })
    expect(sheetStamp(characterId)).toBe(stamp)
    await currencyOk(guest, characterId, { p_gp: null, p_cp: 0 })
    expect(sheetStamp(characterId)).toBe(stamp)
  } finally {
    await cleanup(players, ids)
  }
})

test('adjust_character_currency is unavailable to everyone but the character owner', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const anonymous = localClient()
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 currency access')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = await createdCharacter(guest, campaignId)
    await currencyOk(guest, characterId, { p_gp: 10 })
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)

    // A shared sheet is readable by members but still cannot be spent by them.
    const answers: unknown[] = []
    for (const who of [other, owner, outsider]) {
      answers.push(await rpcError(adjustCurrency(who, characterId, { p_gp: -5 })))
    }
    answers.push(await rpcError(adjustCurrency(guest, RANDOM_ID, { p_gp: -5 })))
    for (const answer of answers) {
      expect(answer).toEqual({ code: 'P0001', message: 'character_unavailable' })
    }
    expect(purse(characterId)).toBe('0,0,10')

    // Anonymous callers have no EXECUTE.
    const denied = await rpcError(
      anonymous.rpc('adjust_character_currency', { p_character_id: characterId, p_gp: -5 }),
    )
    expect(denied.code).toBe('42501')

    // A departed owner gets the same answer; rejoining restores it.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await rpcError(adjustCurrency(guest, characterId, { p_gp: 1 }))).toEqual({
      code: 'P0001',
      message: 'character_unavailable',
    })
    expect(purse(characterId)).toBe('0,0,10')
    await invite(owner, campaignId, guest)
    expect(await currencyOk(guest, characterId, { p_gp: -4 })).toMatchObject({ gp: 6 })

    // Removal behaves the same.
    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: guest.id,
      }),
    )
    expect((await rpcError(adjustCurrency(guest, characterId, { p_gp: 1 }))).message).toBe(
      'character_unavailable',
    )
    expect(purse(characterId)).toBe('0,0,6')
  } finally {
    await cleanup(players, ids)
  }
})

test('adjust_character_item_quantity adjusts, bounds, and hides items from everyone else', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const anonymous = localClient()
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 quantity')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = await createdCharacter(guest, campaignId)
    const item = (await addItem(guest, characterId, { name: 'Arrows', quantity: 5 })).data!

    const quantity = async (delta: number | null) => {
      const { data, error } = await adjustQuantity(guest, item.id, delta)
      expect(error?.message ?? null).toBeNull()
      return data
    }
    expect(await quantity(3)).toBe(8)
    expect(await quantity(-8)).toBe(0)
    expect(itemRow(item.id)).toContain('Arrows|0|')
    expect(await quantity(9999)).toBe(9999)
    expect(await quantity(-9999)).toBe(0)

    // Below zero and above the maximum change nothing.
    await quantity(2)
    expect((await rpcError(adjustQuantity(guest, item.id, -3))).message).toBe(
      'item_quantity_insufficient',
    )
    await quantity(9997)
    expect((await rpcError(adjustQuantity(guest, item.id, 1))).message).toBe(
      'item_quantity_invalid',
    )
    expect(itemRow(item.id)).toContain('Arrows|9999|')
    await quantity(-9997)

    // A zero delta returns the current value without writing.
    const stamp = localDatabaseQuery(
      `select updated_at::text from public.character_items where id = '${item.id}';`,
      {},
    )
    expect(await quantity(0)).toBe(2)
    expect(
      localDatabaseQuery(
        `select updated_at::text from public.character_items where id = '${item.id}';`,
        {},
      ),
    ).toBe(stamp)

    // Argument errors (22023).
    for (const delta of [10_000, -10_000]) {
      const failure = await rpcError(adjustQuantity(guest, item.id, delta))
      expect([failure.code, failure.message], String(delta)).toEqual([
        '22023',
        'item_quantity_invalid',
      ])
    }
    for (const call of [
      adjustQuantity(guest, item.id, null),
      adjustQuantity(guest, null as unknown as string, 1),
    ]) {
      const failure = await rpcError(call)
      expect([failure.code, failure.message]).toEqual(['22023', 'item_required'])
    }

    // Other members (even with the sheet shared), the campaign owner, an outsider, and an unknown
    // item all get the same answer; anonymous callers have no EXECUTE.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
    for (const call of [
      adjustQuantity(other, item.id, -1),
      adjustQuantity(owner, item.id, -1),
      adjustQuantity(outsider, item.id, -1),
      adjustQuantity(guest, RANDOM_ID, -1),
    ]) {
      expect(await rpcError(call)).toEqual({ code: 'P0001', message: 'item_unavailable' })
    }
    expect(
      (
        await rpcError(
          anonymous.rpc('adjust_character_item_quantity', { p_item_id: item.id, p_delta: -1 }),
        )
      ).code,
    ).toBe('42501')
    expect(itemRow(item.id)).toContain('Arrows|2|')

    // A departed owner is refused; rejoining restores it.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect((await rpcError(adjustQuantity(guest, item.id, 1))).message).toBe('item_unavailable')
    expect(itemRow(item.id)).toContain('Arrows|2|')
    await invite(owner, campaignId, guest)
    expect(await quantity(1)).toBe(3)

    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: guest.id,
      }),
    )
    expect((await rpcError(adjustQuantity(guest, item.id, 1))).message).toBe('item_unavailable')
    expect(itemRow(item.id)).toContain('Arrows|3|')
  } finally {
    await cleanup(players, ids)
  }
})

test('the sheet token moves with coin changes: a body save needs the returned updated_at', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 sheet token')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdCharacter(guest, campaignId)

    const save = (features: string, previous: string) =>
      guest.client
        .from('character_sheets')
        .update({ sheet: { version: 1, features } })
        .eq('character_id', characterId)
        .eq('updated_at', previous)
        .select('updated_at')
        .maybeSingle()
    const { data: initial } = await guest.client
      .from('character_sheets')
      .select('updated_at')
      .eq('character_id', characterId)
      .single()

    const adjusted = await currencyOk(guest, characterId, { p_gp: 3 })
    expect(adjusted.updated_at).not.toBe(initial!.updated_at)

    // The token read before the adjustment no longer matches; the returned one does.
    expect((await save('Old token', initial!.updated_at)).data).toBeNull()
    expect((await save('New token', adjusted.updated_at)).data).not.toBeNull()
    // The coins survive a body save.
    expect(purse(characterId)).toBe('0,0,3')
  } finally {
    await cleanup(players, ids)
  }
})

test('concurrent coin, quantity, and membership changes keep the invariants', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M3 concurrency')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await createdCharacter(guest, campaignId)
    const parallel = <T>(count: number, make: (n: number) => PromiseLike<T>) =>
      Promise.all(Array.from({ length: count }, (_, n) => make(n)))

    // Ten parallel +1 gp all apply.
    const adds = await parallel(10, () => adjustCurrency(guest, characterId, { p_gp: 1 }))
    expect(adds.filter((result) => result.error)).toHaveLength(0)
    expect(purse(characterId)).toBe('0,0,10')
    expect(inventoryViolations(campaignId)).toBe('0')

    // 10 gp and ten parallel -1 gp: exactly ten succeed. Then 5 gp and ten spends: five succeed.
    await currencyOk(guest, characterId, { p_gp: -5 })
    const spends = await parallel(10, () => adjustCurrency(guest, characterId, { p_gp: -1 }))
    expect(spends.filter((result) => !result.error)).toHaveLength(5)
    expect(
      spends.filter((result) => result.error?.message === 'currency_insufficient'),
    ).toHaveLength(5)
    expect(purse(characterId)).toBe('0,0,0')
    expect(inventoryViolations(campaignId)).toBe('0')

    // Mixed adds and spends across denominations stay consistent.
    await parallel(6, (n) =>
      adjustCurrency(guest, characterId, n % 2 === 0 ? { p_sp: 2, p_cp: 1 } : { p_sp: -1 }),
    )
    const mixed = purse(characterId).split(',').map(Number)
    expect(mixed.every((value) => value >= 0)).toBe(true)
    expect(inventoryViolations(campaignId)).toBe('0')

    // Parallel quantity deltas all apply in order and never go below zero.
    const item = (await addItem(guest, characterId, { name: 'Darts', quantity: 4 })).data!
    const deltas = await parallel(10, () => adjustQuantity(guest, item.id, -1))
    expect(deltas.filter((result) => !result.error)).toHaveLength(4)
    expect(
      deltas.filter((result) => result.error?.message === 'item_quantity_insufficient'),
    ).toHaveLength(6)
    expect(itemRow(item.id)).toContain('Darts|0|')
    const ups = await parallel(10, () => adjustQuantity(guest, item.id, 3))
    expect(ups.filter((result) => result.error)).toHaveLength(0)
    expect(itemRow(item.id)).toContain('Darts|30|')
    expect(inventoryViolations(campaignId)).toBe('0')

    // A currency adjustment racing the owner's removal either applies or is unavailable.
    for (let round = 0; round < 3; round++) {
      const before = Number(purse(characterId).split(',')[2])
      const [adjust, remove] = await Promise.all([
        adjustCurrency(guest, characterId, { p_gp: 1 }),
        owner.client.rpc('remove_campaign_member', {
          p_campaign_id: campaignId,
          p_profile_id: guest.id,
        }),
      ])
      expect(remove.error?.message ?? null).toBeNull()
      const after = Number(purse(characterId).split(',')[2])
      if (adjust.error) {
        expect(adjust.error.message).toBe('character_unavailable')
        expect(after).toBe(before)
      } else {
        expect(after).toBe(before + 1)
      }
      // After removal, nothing gets through.
      expect((await rpcError(adjustCurrency(guest, characterId, { p_gp: 1 }))).message).toBe(
        'character_unavailable',
      )
      expect(inventoryViolations(campaignId)).toBe('0')
      await invite(owner, campaignId, guest)
    }

    // Quantity delta racing the owner's leave.
    const [quantityRace, leave] = await Promise.all([
      adjustQuantity(guest, item.id, 1),
      guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }),
    ])
    expect(leave.error?.message ?? null).toBeNull()
    if (quantityRace.error) {
      expect(quantityRace.error.message).toBe('item_unavailable')
    }
    expect(inventoryViolations(campaignId)).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})
