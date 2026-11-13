import { expect, test } from '@playwright/test'
import { localDatabaseQuery } from './support/localSupabase.ts'

function sqlError(sql: string): string {
  try {
    localDatabaseQuery(sql, {})
  } catch (error) {
    const failure = error as { stderr?: string; message: string }
    return `${failure.stderr ?? ''}${failure.message}`
  }
  return ''
}

// Two accounts, one campaign owned by `owner`, and `member` on its roster.
// Every statement runs inside a transaction the caller rolls back.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'm1-owner@example.test'),
         ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'm1-member@example.test');
insert into public.campaigns (id, name, owner_id)
  values ('00000000-0000-4000-8000-0000000000c1', 'M1 fixture', '00000000-0000-4000-8000-0000000000a1');
insert into public.campaign_members (campaign_id, profile_id, role)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'member');
set constraints all immediate;
set constraints all deferred;
`
const OWNER = "'00000000-0000-4000-8000-0000000000a1'"
const MEMBER = "'00000000-0000-4000-8000-0000000000b2'"
const CAMPAIGN = "'00000000-0000-4000-8000-0000000000c1'"

test('new objects created by postgres are not exposed to API roles by default', () => {
  const result = localDatabaseQuery(
    `
begin;
create table public.m1_probe_table (id int);
create function public.m1_probe_public_fn() returns int language sql as 'select 1';
create function private.m1_probe_private_fn() returns int language sql as 'select 1';
select 'table:' || r || ':' || has_table_privilege(r, 'public.m1_probe_table', 'select')
  from unnest(array['anon', 'authenticated', 'service_role']) as r;
select 'public_fn:' || r || ':' || has_function_privilege(r, 'public.m1_probe_public_fn()', 'execute')
  from unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;
select 'private_fn:' || r || ':' || has_function_privilege(r, 'private.m1_probe_private_fn()', 'execute')
  from unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;
rollback;
`,
    {},
  )
  const lines = result.split('\n').filter((line) => /^(table|public_fn|private_fn):/.test(line))
  expect(lines).toHaveLength(11)
  for (const line of lines) {
    expect(line, line).toMatch(/:false$/)
  }
})

test('existing campaigns have exactly one owner row that matches campaigns.owner_id', () => {
  const inconsistent = localDatabaseQuery(
    `select count(*) from public.campaigns c
     where (select count(*) from public.campaign_members m where m.campaign_id = c.id and m.role = 'owner') <> 1
        or not exists (select 1 from public.campaign_members m
                       where m.campaign_id = c.id and m.role = 'owner' and m.profile_id = c.owner_id);`,
    {},
  )
  expect(inconsistent).toBe('0')
})

test('owner deletion is restricted and ownership triggers are deferrable and initially deferred', () => {
  expect(
    localDatabaseQuery(
      `select pg_get_constraintdef(oid) from pg_constraint where conname = 'campaigns_owner_id_fkey';`,
      {},
    ),
  ).toMatch(/ON DELETE RESTRICT/)
  expect(
    localDatabaseQuery(
      `select tgname || ':' || tgdeferrable || ':' || tginitdeferred from pg_trigger
       where tgname in ('campaigns_ownership_consistent', 'campaign_members_ownership_consistent')
       order by tgname;`,
      {},
    ),
  ).toBe(
    'campaign_members_ownership_consistent:true:true\ncampaigns_ownership_consistent:true:true',
  )
  expect(
    localDatabaseQuery(
      `select string_agg(r || ':' || has_function_privilege(r, 'private.assert_campaign_ownership_consistent()', 'execute'), ',' order by r)
       from unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;`,
      {},
    ),
  ).toBe('anon:false,authenticated:false,public:false,service_role:false')
})

test('a valid ownership swap passes the commit-time check', () => {
  const result = localDatabaseQuery(
    `${fixture}
update public.campaign_members set role = 'member' where campaign_id = ${CAMPAIGN} and profile_id = ${OWNER};
update public.campaign_members set role = 'owner' where campaign_id = ${CAMPAIGN} and profile_id = ${MEMBER};
update public.campaigns set owner_id = ${MEMBER} where id = ${CAMPAIGN};
set constraints all immediate;
select 'ok';
rollback;`,
    {},
  )
  expect(result).toContain('ok')
})

test('creating and deleting a campaign still satisfies the invariant', () => {
  const result = localDatabaseQuery(
    `${fixture}
set constraints all immediate;
delete from public.campaigns where id = ${CAMPAIGN};
set constraints all immediate;
select 'ok';
rollback;`,
    {},
  )
  expect(result).toContain('ok')
})

test('demoting the owner row without promoting another fails at commit', () => {
  expect(
    sqlError(`${fixture}
update public.campaign_members set role = 'member' where campaign_id = ${CAMPAIGN} and profile_id = ${OWNER};
set constraints all immediate;
rollback;`),
  ).toContain('campaign_ownership_inconsistent')
})

test('pointing campaigns.owner_id at a member without changing roles fails at commit', () => {
  expect(
    sqlError(`${fixture}
update public.campaigns set owner_id = ${MEMBER} where id = ${CAMPAIGN};
set constraints all immediate;
rollback;`),
  ).toContain('campaign_ownership_inconsistent')
})

test('deleting an owner account is blocked until their campaign is gone', () => {
  const error = sqlError(`${fixture}
delete from auth.users where id = ${OWNER};
rollback;`)
  expect(error).toContain('campaigns_owner_id_fkey')

  const result = localDatabaseQuery(
    `${fixture}
delete from public.campaigns where id = ${CAMPAIGN};
delete from auth.users where id = ${OWNER};
select 'ok';
rollback;`,
    {},
  )
  expect(result).toContain('ok')
})

test('deleting a member account removes only their membership and keeps the invariant', () => {
  const result = localDatabaseQuery(
    `${fixture}
delete from auth.users where id = ${MEMBER};
set constraints all immediate;
select 'members:' || count(*) from public.campaign_members where campaign_id = ${CAMPAIGN};
rollback;`,
    {},
  )
  expect(result).toContain('members:1')
})
