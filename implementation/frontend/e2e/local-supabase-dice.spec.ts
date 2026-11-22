import { expect, test } from '@playwright/test'
import { formatSpec, parseDice } from '../src/features/dice/diceNotation.ts'
import type { DiceTerm, RollSpec } from '../src/features/dice/diceTypes.ts'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  RANDOM_ID,
  rpcError,
  rpcOk,
  type Client,
  type Player,
} from './support/localPlayers.ts'

// M03.7 Phase 2: dice_rolls, roll_dice, RLS, and Realtime against the real local stack.

const ROLES = ['anon', 'authenticated', 'service_role', 'public']
const ROLL_SIGNATURE = 'public.roll_dice(uuid, jsonb, text, text, text, uuid)'

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

function count(sql: string) {
  return Number(localDatabaseQuery(sql, {}))
}

function specOf(text: string): RollSpec {
  const result = parseDice(text)
  if (!result.ok) throw new Error(`"${text}": ${result.error}`)
  return result.spec
}

const d = (count: number, sides: number): DiceTerm => ({ kind: 'dice', sign: 1, count, sides })

type RollRow = {
  id: string
  campaign_id: string
  roller_id: string
  character_id: string | null
  visibility: string
  source: string
  label: string | null
  expression: string
  terms: DiceTerm[]
  dice: { value: number; kept: boolean }[][]
  total: number
  created_at: string
}

function rollArgs(
  campaignId: string,
  terms: unknown,
  extra: {
    p_visibility?: string | null
    p_source?: string | null
    p_label?: string | null
    p_character_id?: string | null
  } = {},
) {
  return { p_campaign_id: campaignId, p_terms: terms, ...extra }
}

async function roll(
  player: Player,
  campaignId: string,
  terms: unknown,
  extra: Parameters<typeof rollArgs>[2] = {},
): Promise<RollRow> {
  const { data, error } = await player.client.rpc('roll_dice', rollArgs(campaignId, terms, extra))
  expect(error?.message ?? null).toBeNull()
  return data as unknown as RollRow
}

/** A campaign with an owner and one invited member. */
async function table() {
  const { players } = await newPlayers(['owner', 'member', 'outsider'])
  const campaignId = await createCampaign(players.owner, 'Dice table')
  await invite(players.owner, campaignId, players.member)
  return {
    players,
    campaignId,
    owner: players.owner,
    member: players.member,
    outsider: players.outsider,
  }
}

async function characterOf(player: Player, campaignId: string) {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: 'Roller',
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

function chiSquare(counts: number[]) {
  const total = counts.reduce((sum, seen) => sum + seen, 0)
  const expected = total / counts.length
  return counts.reduce((sum, seen) => sum + (seen - expected) ** 2 / expected, 0)
}

// --- Catalog and privileges ------------------------------------------------------------------

test.describe('catalog and privileges', () => {
  test('RLS, grants, policy, indexes, and the publication are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity from pg_class where oid = 'public.dice_rolls'::regclass;`,
        {},
      ),
    ).toBe('t')
    expect(holders((r) => `has_table_privilege(${r}, 'public.dice_rolls', 'select')`)).toBe(
      'authenticated',
    )
    for (const privilege of ['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
      expect(
        holders((r) => `has_table_privilege(${r}, 'public.dice_rolls', '${privilege}')`),
        privilege,
      ).toBe('')
    }
    expect(
      localDatabaseQuery(
        `select count(*) from pg_attribute a
         where a.attrelid = 'public.dice_rolls'::regclass and a.attnum > 0 and not a.attisdropped
           and (has_column_privilege('anon', a.attrelid, a.attnum, 'select')
             or has_column_privilege('authenticated', a.attrelid, a.attnum, 'insert')
             or has_column_privilege('authenticated', a.attrelid, a.attnum, 'update'));`,
        {},
      ),
    ).toBe('0')

    expect(
      localDatabaseQuery(
        `select string_agg(policyname || ':' || cmd || ':' || roles::text, ',') from pg_policies
         where schemaname = 'public' and tablename = 'dice_rolls';`,
        {},
      ),
    ).toBe('Members read campaign rolls and their own private rolls:SELECT:{authenticated}')
    expect(
      localDatabaseQuery(
        `select string_agg(indexname, ',' order by indexname) from pg_indexes
         where schemaname = 'public' and tablename = 'dice_rolls' and indexname <> 'dice_rolls_pkey';`,
        {},
      ),
    ).toBe('dice_rolls_campaign_created_idx,dice_rolls_roller_created_idx')
    expect(
      localDatabaseQuery(
        `select string_agg(pubname, ',') from pg_publication_tables
         where schemaname = 'public' and tablename = 'dice_rolls';`,
        {},
      ),
    ).toBe('supabase_realtime')
    expect(
      localDatabaseQuery(
        `select relreplident from pg_class where oid = 'public.dice_rolls'::regclass;`,
        {},
      ),
    ).toBe('d')
  })

  test('roll_dice is executable by authenticated only, and the helpers by nobody', () => {
    expect(holders((r) => `has_function_privilege(${r}, '${ROLL_SIGNATURE}', 'execute')`)).toBe(
      'authenticated',
    )
    expect(
      localDatabaseQuery(
        `select p.prosecdef::text || ',' || pg_get_userbyid(p.proowner) from pg_proc p
         where p.oid = '${ROLL_SIGNATURE}'::regprocedure;`,
        {},
      ),
    ).toBe('true,postgres')
    for (const helper of [
      'private.random_int(integer)',
      'private.dice_int_between(jsonb, numeric, numeric)',
      'private.validate_dice_terms(jsonb)',
      'private.roll_terms(jsonb)',
    ]) {
      expect(
        holders((r) => `has_function_privilege(${r}, '${helper}', 'execute')`),
        helper,
      ).toBe('')
    }
  })

  test('the references to characters clear only the character on delete', () => {
    expect(
      localDatabaseQuery(
        `select string_agg(conname || ':' || confdeltype::text || ':' || cardinality(confdelsetcols), ',' order by conname)
         from pg_constraint
         where conrelid = 'public.dice_rolls'::regclass and contype = 'f' and confrelid = 'public.characters'::regclass;`,
        {},
      ),
    ).toBe('dice_rolls_character_campaign_fkey:n:1,dice_rolls_character_owner_fkey:n:1')
  })
})

// --- Rolling ---------------------------------------------------------------------------------

test.describe('rolling', () => {
  test('faces, keeps, totals, and the canonical expression match the spec', async () => {
    const { players, campaignId, member } = await table()
    try {
      for (const text of [
        'd20 + 5',
        '3d6',
        '4d6kh3',
        '2d20kl1 - 2',
        '2d20kh1 + 1d4 + 2',
        '-1d4 - 3 + 2d8',
        'd%',
        '100d1000',
        '7',
      ]) {
        const spec = specOf(text)
        const row = await roll(member, campaignId, spec.terms)
        expect(row.expression, text).toBe(formatSpec(spec))
        expect(row.terms, text).toEqual(spec.terms)
        expect(row.dice, text).toHaveLength(spec.terms.length)

        let expectedTotal = 0
        row.dice.forEach((faces, index) => {
          const term = spec.terms[index]
          if (term.kind === 'constant') {
            expect(faces).toEqual([])
            expectedTotal += term.sign * term.value
            return
          }
          expect(faces).toHaveLength(term.count)
          for (const face of faces) {
            expect(face.value).toBeGreaterThanOrEqual(1)
            expect(face.value).toBeLessThanOrEqual(term.sides)
          }
          const kept = faces.filter((face) => face.kept)
          if (term.keep) {
            expect(kept).toHaveLength(term.keep.count)
            const droppedValues = faces.filter((face) => !face.kept).map((face) => face.value)
            const keptValues = kept.map((face) => face.value)
            if (droppedValues.length > 0) {
              if (term.keep.mode === 'high') {
                expect(Math.min(...keptValues)).toBeGreaterThanOrEqual(Math.max(...droppedValues))
              } else {
                expect(Math.max(...keptValues)).toBeLessThanOrEqual(Math.min(...droppedValues))
              }
            }
          } else {
            expect(kept).toHaveLength(term.count)
          }
          expectedTotal += term.sign * kept.reduce((sum, face) => sum + face.value, 0)
        })
        expect(row.total, text).toBe(expectedTotal)
        expect(row.roller_id).toBe(member.id)
        expect(row.campaign_id).toBe(campaignId)
        expect(row.visibility).toBe('campaign')
        expect(row.source).toBe('tray')
      }
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('the stored row matches what the roller can read back', async () => {
    const { players, campaignId, member } = await table()
    try {
      const row = await roll(member, campaignId, [d(2, 6)], {
        p_source: 'skill',
        p_label: '  Stealth check  ',
      })
      expect(row.label).toBe('Stealth check')
      expect(row.source).toBe('skill')
      const { data, error } = await member.client.from('dice_rolls').select('*').eq('id', row.id)
      expect(error).toBeNull()
      expect(data).toEqual([row])
      const blank = await roll(member, campaignId, [d(1, 4)], { p_label: '   ' })
      expect(blank.label).toBeNull()
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('a roll with only constants is allowed', async () => {
    const { players, campaignId, member } = await table()
    try {
      const row = await roll(member, campaignId, [{ kind: 'constant', sign: -1, value: 4 }])
      expect(row.total).toBe(-4)
      expect(row.expression).toBe('-4')
      expect(row.dice).toEqual([[]])
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('keeping dice breaks ties toward the earliest die and totals only kept faces', async () => {
    // Direct against the helper: 3d2 keep-highest-1 produces ties constantly. Count rolls that break
    // an invariant: one kept face, total equals the highest face, and the kept face is the earliest
    // of the faces equal to the total.
    const rows = localDatabaseQuery(
      `select count(*) from (
         select r.* from generate_series(1, 300) g,
           lateral private.roll_terms(
             '[{"kind":"dice","sign":1,"count":3,"sides":2,"keep":{"mode":"high","count":1}}]'::jsonb) r
       ) q
       where (select count(*) from jsonb_array_elements(q.dice -> 0) f where (f ->> 'kept')::boolean) <> 1
          or q.total <> (select max((f ->> 'value')::integer) from jsonb_array_elements(q.dice -> 0) f)
          or (
            -- among equal highest faces, the kept one is the first
            (select min(ord) from jsonb_array_elements(q.dice -> 0) with ordinality as e(f, ord)
              where (f ->> 'value')::integer = q.total)
            <> (select ord from jsonb_array_elements(q.dice -> 0) with ordinality as e(f, ord)
              where (f ->> 'kept')::boolean)
          );`,
      {},
    )
    expect(rows).toBe('0')
  })
})

// --- Limits ----------------------------------------------------------------------------------

test.describe('limits', () => {
  test('the edges pass and one past them fails', async () => {
    const { players, campaignId, member } = await table()
    try {
      await roll(member, campaignId, [d(100, 6)])
      await roll(member, campaignId, [d(1, 1000)])
      await roll(member, campaignId, [d(1, 2)])
      await roll(member, campaignId, [{ kind: 'constant', sign: 1, value: 10000 }])
      await roll(member, campaignId, Array(20).fill({ kind: 'constant', sign: 1, value: 1 }))
      await roll(member, campaignId, [d(50, 6), d(50, 8)])

      const bad: [string, unknown][] = [
        ['101 dice', [d(101, 6)]],
        ['101 dice over two terms', [d(51, 6), d(50, 6)]],
        ['1 side', [d(1, 1)]],
        ['1001 sides', [d(1, 1001)]],
        ['0 dice', [d(0, 6)]],
        ['fractional count', [d(1.5, 6)]],
        ['21 terms', Array(21).fill({ kind: 'constant', sign: 1, value: 1 })],
        ['no terms', []],
        ['constant over limit', [{ kind: 'constant', sign: 1, value: 10001 }]],
        ['bad sign', [{ kind: 'constant', sign: 2, value: 1 }]],
        ['zero sign', [{ kind: 'constant', sign: 0, value: 1 }]],
        ['string count', [{ kind: 'dice', sign: 1, count: '2', sides: 6 }]],
        ['null sides', [{ kind: 'dice', sign: 1, count: 2, sides: null }]],
        ['unknown kind', [{ kind: 'exploding', sign: 1, count: 1, sides: 6 }]],
        ['unknown key', [{ kind: 'dice', sign: 1, count: 1, sides: 6, reroll: 1 }]],
        ['missing key', [{ kind: 'dice', sign: 1, count: 1 }]],
        ['keep over count', [{ ...d(2, 6), keep: { mode: 'high', count: 3 } }]],
        ['keep zero', [{ ...d(2, 6), keep: { mode: 'high', count: 0 } }]],
        ['keep bad mode', [{ ...d(2, 6), keep: { mode: 'middle', count: 1 } }]],
        ['keep extra key', [{ ...d(2, 6), keep: { mode: 'high', count: 1, x: 1 } }]],
        ['keep null', [{ ...d(2, 6), keep: null }]],
        ['not an array', { kind: 'constant', sign: 1, value: 1 }],
        ['array of numbers', [1, 2]],
        ['null', null],
        ['a string', 'd20'],
        ['huge number', [{ kind: 'dice', sign: 1, count: 1e300, sides: 6 }]],
      ]
      for (const [name, terms] of bad) {
        const error = await rpcError(member.client.rpc('roll_dice', rollArgs(campaignId, terms)))
        expect(error, name).toMatchObject({ code: '22023' })
      }
      expect(
        count(`select count(*) from public.dice_rolls where campaign_id = '${campaignId}'`),
      ).toBe(6)
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('bad visibility, source, and labels are refused', async () => {
    const { players, campaignId, member } = await table()
    try {
      for (const extra of [
        { p_visibility: 'party' },
        { p_visibility: null },
        { p_source: 'cheat' },
        { p_source: null },
        { p_label: 'x'.repeat(81) },
      ]) {
        const error = await rpcError(
          member.client.rpc('roll_dice', rollArgs(campaignId, [d(1, 6)], extra)),
        )
        expect(error, JSON.stringify(extra)).toMatchObject({ code: '22023' })
      }
      await roll(member, campaignId, [d(1, 6)], { p_label: 'x'.repeat(80), p_source: 'text' })
    } finally {
      await cleanup(players, [campaignId])
    }
  })
})

// --- Forgery ---------------------------------------------------------------------------------

test.describe('forgery', () => {
  test('no client can insert, update, or delete a roll directly', async () => {
    const { players, campaignId, owner, member } = await table()
    try {
      const real = await roll(member, campaignId, [d(1, 6)])
      for (const player of [member, owner]) {
        const insert = await player.client.from('dice_rolls').insert({
          campaign_id: campaignId,
          roller_id: player.id,
          visibility: 'campaign',
          source: 'tray',
          expression: '1d20',
          terms: [d(1, 20)],
          dice: [[{ value: 20, kept: true }]],
          total: 20,
        })
        expect(insert.error?.code).toBe('42501')

        const update = await player.client
          .from('dice_rolls')
          .update({ total: 99 })
          .eq('id', real.id)
        expect(update.error?.code).toBe('42501')

        const remove = await player.client.from('dice_rolls').delete().eq('id', real.id)
        expect(remove.error?.code).toBe('42501')
      }
      expect(
        count(
          `select count(*) from public.dice_rolls where id = '${real.id}' and total = ${real.total}`,
        ),
      ).toBe(1)
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('anonymous callers and the private helpers are refused', async () => {
    const { players, campaignId, member } = await table()
    try {
      const anonymous = localClient()
      expect(
        (await rpcError(anonymous.rpc('roll_dice', rollArgs(campaignId, [d(1, 6)])))).code,
      ).toBe('42501')
      const select = await anonymous.from('dice_rolls').select('id')
      expect(select.data ?? []).toEqual([])

      for (const name of ['random_int', 'roll_terms', 'validate_dice_terms']) {
        const { error } = await member.client.rpc(name, { p_sides: 6, p_terms: [d(1, 6)] })
        expect(error, name).not.toBeNull()
      }
      const privateSchema = await member.client
        .schema('private' as never)
        .rpc('random_int', { p_sides: 6 })
      expect(privateSchema.error).not.toBeNull()
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('a caller outside the campaign cannot roll in it, and a null or unknown campaign fails', async () => {
    const { players, campaignId, outsider, member } = await table()
    try {
      expect(
        await rpcError(outsider.client.rpc('roll_dice', rollArgs(campaignId, [d(1, 6)]))),
      ).toEqual({ code: '42501', message: 'not_a_member' })
      expect(
        (await rpcError(member.client.rpc('roll_dice', rollArgs(RANDOM_ID, [d(1, 6)])))).message,
      ).toBe('not_a_member')
      expect(
        (await rpcError(member.client.rpc('roll_dice', rollArgs(null as never, [d(1, 6)])))).code,
      ).toBe('42501')
      expect(
        count(`select count(*) from public.dice_rolls where campaign_id = '${campaignId}'`),
      ).toBe(0)
    } finally {
      await cleanup(players, [campaignId])
    }
  })
})

// --- Visibility ------------------------------------------------------------------------------

async function visibleIds(player: { client: Client }, campaignId: string) {
  const { data, error } = await player.client
    .from('dice_rolls')
    .select('id')
    .eq('campaign_id', campaignId)
  expect(error).toBeNull()
  return (data ?? []).map((row) => row.id as string).sort()
}

test.describe('visibility', () => {
  test('members read campaign rolls; a private roll is read by its roller only, owner included', async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    try {
      const shared = await roll(member, campaignId, [d(1, 6)])
      const secret = await roll(member, campaignId, [d(1, 6)], { p_visibility: 'self' })
      const ownerSecret = await roll(owner, campaignId, [d(1, 6)], { p_visibility: 'self' })
      const ownerShared = await roll(owner, campaignId, [d(1, 6)])

      expect(await visibleIds(member, campaignId)).toEqual(
        [shared.id, secret.id, ownerShared.id].sort(),
      )
      expect(await visibleIds(owner, campaignId)).toEqual(
        [shared.id, ownerSecret.id, ownerShared.id].sort(),
      )
      expect(await visibleIds(outsider, campaignId)).toEqual([])
      const anonymous = await localClient().from('dice_rolls').select('id')
      expect(anonymous.data ?? []).toEqual([])
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('rolls in one campaign are not visible through another', async () => {
    const { players, campaignId, owner, member } = await table()
    const otherId = await createCampaign(member, 'Elsewhere')
    try {
      const here = await roll(owner, campaignId, [d(1, 6)])
      const there = await roll(member, otherId, [d(1, 6)])
      expect(await visibleIds(member, campaignId)).toEqual([here.id])
      expect(await visibleIds(member, otherId)).toEqual([there.id])
      expect(await visibleIds(owner, otherId)).toEqual([])
    } finally {
      await cleanup(players, [campaignId, otherId])
    }
  })

  test('a member who leaves reads nothing and cannot roll; their rolls stay for the table', async () => {
    const { players, campaignId, owner, member } = await table()
    try {
      const mine = await roll(member, campaignId, [d(1, 6)])
      await rpcOk(member.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
      expect(await visibleIds(member, campaignId)).toEqual([])
      expect(
        (await rpcError(member.client.rpc('roll_dice', rollArgs(campaignId, [d(1, 6)])))).message,
      ).toBe('not_a_member')
      expect(await visibleIds(owner, campaignId)).toEqual([mine.id])
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('a removed member reads nothing and cannot roll', async () => {
    const { players, campaignId, owner, member } = await table()
    try {
      const mine = await roll(member, campaignId, [d(1, 6)])
      await rpcOk(
        owner.client.rpc('remove_campaign_member', {
          p_campaign_id: campaignId,
          p_profile_id: member.id,
        }),
      )
      expect(await visibleIds(member, campaignId)).toEqual([])
      expect(
        (await rpcError(member.client.rpc('roll_dice', rollArgs(campaignId, [d(1, 6)])))).message,
      ).toBe('not_a_member')
      expect(await visibleIds(owner, campaignId)).toEqual([mine.id])
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('deleting the campaign deletes its log', async () => {
    const { players, campaignId, member } = await table()
    await roll(member, campaignId, [d(1, 6)])
    expect(
      count(`select count(*) from public.dice_rolls where campaign_id = '${campaignId}'`),
    ).toBe(1)
    await cleanup(players, [campaignId])
    expect(
      count(`select count(*) from public.dice_rolls where campaign_id = '${campaignId}'`),
    ).toBe(0)
  })
})

// --- Characters ------------------------------------------------------------------------------

test.describe('characters', () => {
  test('rolling as your own character passes; as someone else’s or another campaign’s fails', async () => {
    const { players, campaignId, owner, member } = await table()
    const otherId = await createCampaign(member, 'Elsewhere')
    try {
      const mine = await characterOf(member, campaignId)
      const ownersCharacter = await characterOf(owner, campaignId)
      const elsewhere = await characterOf(member, otherId)

      const row = await roll(member, campaignId, [d(1, 20)], {
        p_character_id: mine,
        p_source: 'skill',
        p_label: 'Stealth check',
      })
      expect(row.character_id).toBe(mine)

      for (const characterId of [ownersCharacter, elsewhere, RANDOM_ID]) {
        expect(
          await rpcError(
            member.client.rpc(
              'roll_dice',
              rollArgs(campaignId, [d(1, 20)], { p_character_id: characterId }),
            ),
          ),
        ).toEqual({ code: '42501', message: 'character_unavailable' })
      }
      // The owner cannot roll as a member's character either.
      expect(
        (
          await rpcError(
            owner.client.rpc(
              'roll_dice',
              rollArgs(campaignId, [d(1, 20)], { p_character_id: mine }),
            ),
          )
        ).message,
      ).toBe('character_unavailable')
    } finally {
      await cleanup(players, [campaignId, otherId])
    }
  })

  test('deleting a character keeps its rolls and clears the reference', async () => {
    const { players, campaignId, member } = await table()
    try {
      const mine = await characterOf(member, campaignId)
      const row = await roll(member, campaignId, [d(1, 20)], { p_character_id: mine })
      localDatabaseQuery(`delete from public.characters where id = '${mine}';`, {})
      const { data } = await member.client
        .from('dice_rolls')
        .select('id, character_id')
        .eq('id', row.id)
      expect(data).toEqual([{ id: row.id, character_id: null }])
    } finally {
      await cleanup(players, [campaignId])
    }
  })

  test('a direct row naming another player’s character is refused by the foreign keys', async () => {
    const { players, campaignId, owner, member } = await table()
    try {
      const ownersCharacter = await characterOf(owner, campaignId)
      const failure = sqlError(
        `insert into public.dice_rolls (campaign_id, roller_id, character_id, visibility, source,
           expression, terms, dice, total)
         values ('${campaignId}', '${member.id}', '${ownersCharacter}', 'campaign', 'tray',
           '1d6', '[]', '[]', 1);`,
      )
      expect(failure).toContain('dice_rolls_character_owner_fkey')
    } finally {
      await cleanup(players, [campaignId])
    }
  })
})

// --- Retention and rate ------------------------------------------------------------------------

test.describe('retention and rate', () => {
  test('the 301st roll prunes the oldest, scoped to its own campaign', async () => {
    const { players, campaignId, member } = await table()
    const otherId = await createCampaign(member, 'Elsewhere')
    try {
      await roll(member, otherId, [d(1, 6)])
      localDatabaseQuery(
        `insert into public.dice_rolls (campaign_id, roller_id, visibility, source, label, expression, terms, dice, total, created_at)
         select '${campaignId}', '${member.id}', 'campaign', 'tray',
                case when n = 1 then 'oldest' when n = 2 then 'second' else 'filler' end,
                '1d6', '[{"kind":"dice","sign":1,"count":1,"sides":6}]'::jsonb,
                '[[{"value":3,"kept":true}]]'::jsonb, 3,
                now() - interval '1 hour' + n * interval '1 second'
         from generate_series(1, 300) as n;`,
        {},
      )
      expect(
        count(`select count(*) from public.dice_rolls where campaign_id = '${campaignId}'`),
      ).toBe(300)

      const newest = await roll(member, campaignId, [d(1, 6)])
      expect(
        count(`select count(*) from public.dice_rolls where campaign_id = '${campaignId}'`),
      ).toBe(300)
      expect(
        count(
          `select count(*) from public.dice_rolls where campaign_id = '${campaignId}' and label = 'oldest'`,
        ),
      ).toBe(0)
      expect(
        count(
          `select count(*) from public.dice_rolls where campaign_id = '${campaignId}' and label = 'second'`,
        ),
      ).toBe(1)
      expect(count(`select count(*) from public.dice_rolls where id = '${newest.id}'`)).toBe(1)
      expect(count(`select count(*) from public.dice_rolls where campaign_id = '${otherId}'`)).toBe(
        1,
      )
    } finally {
      await cleanup(players, [campaignId, otherId])
    }
  })

  test('the 21st roll in ten seconds is refused, per roller and per campaign', async () => {
    const { players, campaignId, owner, member } = await table()
    const otherId = await createCampaign(member, 'Elsewhere')
    try {
      for (let i = 0; i < 20; i += 1) await roll(member, campaignId, [d(1, 6)])
      expect(
        await rpcError(member.client.rpc('roll_dice', rollArgs(campaignId, [d(1, 6)]))),
      ).toEqual({ code: 'P0001', message: 'dice_rate_limited' })
      // Private rolls count too.
      expect(
        (
          await rpcError(
            member.client.rpc(
              'roll_dice',
              rollArgs(campaignId, [d(1, 6)], { p_visibility: 'self' }),
            ),
          )
        ).code,
      ).toBe('P0001')
      // Another roller, and the same roller in another campaign, are unaffected.
      await roll(owner, campaignId, [d(1, 6)])
      await roll(member, otherId, [d(1, 6)])
      expect(
        count(
          `select count(*) from public.dice_rolls where campaign_id = '${campaignId}' and roller_id = '${member.id}'`,
        ),
      ).toBe(20)
    } finally {
      await cleanup(players, [campaignId, otherId])
    }
  })

  test('old rolls fall out of the rate window', async () => {
    const { players, campaignId, member } = await table()
    try {
      localDatabaseQuery(
        `insert into public.dice_rolls (campaign_id, roller_id, visibility, source, expression, terms, dice, total, created_at)
         select '${campaignId}', '${member.id}', 'campaign', 'tray', '1d6',
                '[{"kind":"dice","sign":1,"count":1,"sides":6}]'::jsonb, '[[{"value":3,"kept":true}]]'::jsonb, 3,
                now() - interval '30 seconds'
         from generate_series(1, 25);`,
        {},
      )
      await roll(member, campaignId, [d(1, 6)])
    } finally {
      await cleanup(players, [campaignId])
    }
  })
})

// --- Realtime --------------------------------------------------------------------------------

type Inbox = { ids: string[]; channelClose: () => Promise<unknown> }

async function listen(client: Client, campaignId: string, name: string): Promise<Inbox> {
  const ids: string[] = []
  const channel = client.channel(`dice-test-${name}-${campaignId}`).on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'dice_rolls',
      filter: `campaign_id=eq.${campaignId}`,
    },
    (payload) => ids.push((payload.new as { id: string }).id),
  )
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not subscribe`)), 10000)
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(error ?? new Error(`${name}: ${status}`))
      }
    })
  })
  // SUBSCRIBED arrives before the server has registered the row filter; give it a moment so the
  // first roll is not missed.
  await settle(1000)
  return { ids, channelClose: () => client.removeChannel(channel) }
}

async function settle(ms = 1500) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(condition: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!condition() && Date.now() < end) await settle(100)
}

test.describe('realtime', () => {
  test('members receive a campaign roll; only the roller receives a private roll', async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    const inboxes: Inbox[] = []
    try {
      const ownerInbox = await listen(owner.client, campaignId, 'owner')
      const memberInbox = await listen(member.client, campaignId, 'member')
      const outsiderInbox = await listen(outsider.client, campaignId, 'outsider')
      inboxes.push(ownerInbox, memberInbox, outsiderInbox)

      const shared = await roll(member, campaignId, [d(1, 20)])
      await waitFor(() => ownerInbox.ids.includes(shared.id) && memberInbox.ids.includes(shared.id))
      expect(ownerInbox.ids).toEqual([shared.id])
      expect(memberInbox.ids).toEqual([shared.id])

      const secret = await roll(member, campaignId, [d(1, 20)], { p_visibility: 'self' })
      await waitFor(() => memberInbox.ids.includes(secret.id))
      await settle()
      expect(memberInbox.ids).toEqual([shared.id, secret.id])
      expect(ownerInbox.ids).toEqual([shared.id])

      const ownerSecret = await roll(owner, campaignId, [d(1, 20)], { p_visibility: 'self' })
      await waitFor(() => ownerInbox.ids.includes(ownerSecret.id))
      await settle()
      expect(ownerInbox.ids).toEqual([shared.id, ownerSecret.id])
      expect(memberInbox.ids).toEqual([shared.id, secret.id])

      expect(outsiderInbox.ids).toEqual([])
    } finally {
      for (const inbox of inboxes) await inbox.channelClose()
      await cleanup(players, [campaignId])
    }
  })

  test('a removed member who subscribes again receives nothing', async () => {
    const { players, campaignId, owner, member } = await table()
    const inboxes: Inbox[] = []
    try {
      await rpcOk(
        owner.client.rpc('remove_campaign_member', {
          p_campaign_id: campaignId,
          p_profile_id: member.id,
        }),
      )
      const removedInbox = await listen(member.client, campaignId, 'removed')
      const ownerInbox = await listen(owner.client, campaignId, 'owner')
      inboxes.push(removedInbox, ownerInbox)

      const row = await roll(owner, campaignId, [d(1, 20)])
      await waitFor(() => ownerInbox.ids.includes(row.id))
      await settle()
      expect(ownerInbox.ids).toEqual([row.id])
      expect(removedInbox.ids).toEqual([])
    } finally {
      for (const inbox of inboxes) await inbox.channelClose()
      await cleanup(players, [campaignId])
    }
  })
})

// --- Distribution ------------------------------------------------------------------------------

test.describe('distribution', () => {
  // 5 degrees of freedom: 20.5 is the p = 0.001 critical value; 30 keeps this stable (p < 0.0001).
  test('60,000 server d6 draws are uniform and in bounds', () => {
    const rows = localDatabaseQuery(
      `select string_agg(v || ':' || n, ',' order by v) from (
         select v, count(*) n from (select private.random_int(6) v from generate_series(1, 60000)) q group by v
       ) t;`,
      {},
    )
    const counts = rows.split(',').map((pair) => Number(pair.split(':')[1]))
    expect(counts).toHaveLength(6)
    expect(rows.split(',').map((pair) => Number(pair.split(':')[0]))).toEqual([1, 2, 3, 4, 5, 6])
    expect(chiSquare(counts)).toBeLessThan(30)
  })

  test('every die size stays within 1..sides', () => {
    expect(
      localDatabaseQuery(
        `select string_agg(s || ':' || mn || '-' || mx, ',' order by s) from (
           select s, min(private.random_int(s)) mn, max(private.random_int(s)) mx
           from unnest(array[1, 2, 3, 7, 20, 100, 1000]) s, generate_series(1, 500) g group by s
         ) t
         where mn < 1 or mx > s;`,
        {},
      ),
    ).toBe('')
  })

  test('2,000 faces rolled through the RPC are uniform', async () => {
    const { players, campaignId, member } = await table()
    try {
      const counts = new Array<number>(6).fill(0)
      for (let i = 0; i < 20; i += 1) {
        const row = await roll(member, campaignId, [d(100, 6)])
        for (const face of row.dice[0]) counts[face.value - 1] += 1
      }
      expect(counts.reduce((sum, seen) => sum + seen, 0)).toBe(2000)
      expect(chiSquare(counts)).toBeLessThan(30)
    } finally {
      await cleanup(players, [campaignId])
    }
  })
})
