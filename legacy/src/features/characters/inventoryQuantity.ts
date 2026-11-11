import type { Character } from './model';

export function withInventoryQuantity(
  character: Character,
  itemId: string,
  raw: string,
): Character {
  const quantity = Number(raw);
  if (raw.trim() === '' || !Number.isSafeInteger(quantity) || quantity < 0)
    throw new Error('Enter a nonnegative whole number for quantity.');
  const item = character.inventory.find((entry) => entry.id === itemId);
  if (!item) throw new Error('This inventory item is no longer available.');
  if (item.quantity === quantity) return character;
  return {
    ...character,
    inventory: character.inventory.map((entry) =>
      entry.id === itemId ? { ...entry, quantity } : entry,
    ),
  };
}
