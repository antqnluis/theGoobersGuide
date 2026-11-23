begin;

-- Item rarity: the usual D&D progression, shown as a colour and a word on the inventory.
-- Existing items stay 'common'. The row policies already cover every column of the row; only the
-- owner's column grants need to name the new column.
alter table public.character_items
  add column rarity text not null default 'common';

alter table public.character_items
  add constraint character_items_rarity_check check (
    rarity in ('common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact')
  );

grant insert (rarity) on table public.character_items to authenticated;
grant update (rarity) on table public.character_items to authenticated;

commit;
