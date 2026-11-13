import { expect, test } from '@playwright/test'
import { localDatabaseQuery } from './support/localSupabase.ts'

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
