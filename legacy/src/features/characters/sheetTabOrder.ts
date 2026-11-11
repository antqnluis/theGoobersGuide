import { sheetTabIds, type SheetTab } from './model';

export const sheetTabLabels: Record<SheetTab, string> = {
  overview: 'Overview',
  skills: 'Skills & saves',
  inventory: 'Inventory',
  features: 'Features',
  notes: 'Notes',
  spells: 'Spells',
};

export function normalizeSheetTabOrder(value: unknown): SheetTab[] {
  const known = new Set<string>(sheetTabIds);
  const seen = new Set<SheetTab>();
  if (Array.isArray(value)) {
    for (const id of value) {
      if (typeof id === 'string' && known.has(id)) seen.add(id as SheetTab);
    }
  }
  for (const id of sheetTabIds) seen.add(id);
  return [...seen];
}

export function isSheetTabOrder(value: unknown): value is SheetTab[] {
  return (
    Array.isArray(value) &&
    value.length === sheetTabIds.length &&
    value.every((id, index) => id === normalizeSheetTabOrder(value)[index])
  );
}

// The destination is the tab's final index, after removing its old position.
export function moveSheetTab(
  order: readonly SheetTab[],
  id: SheetTab,
  destination: number,
): SheetTab[] {
  const next = normalizeSheetTabOrder(order);
  const from = next.indexOf(id);
  if (
    !Number.isInteger(destination) ||
    destination < 0 ||
    destination >= next.length ||
    from < 0 ||
    from === destination
  )
    return next;
  next.splice(from, 1);
  next.splice(destination, 0, id);
  return next;
}
