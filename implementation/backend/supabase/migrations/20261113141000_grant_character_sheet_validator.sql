begin;

-- Postgres checks EXECUTE on a function used in a CHECK constraint against the role
-- performing the write, so API writers of character_sheets need it on the validator.
-- It is pure (reads no tables, touches no data), so this exposes nothing. The schema
-- USAGE grant on private already exists for authenticated.
grant execute on function private.character_sheet_is_valid(jsonb) to authenticated;

commit;
