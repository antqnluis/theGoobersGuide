begin;

-- Objects postgres creates in public are no longer granted to the API roles.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless the creator's
-- global default says otherwise. This covers public and private alike.
alter default privileges for role postgres
  revoke execute on functions from public;

commit;
