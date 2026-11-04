import type { AppData, AppRepository } from '../../shared/persistence/model';
import type { CampaignNote } from './model';

export const noteCategories = [
  'Session Notes',
  'NPCs',
  'Locations',
  'Quests',
  'Discoveries',
  'General',
] as const;

export type NoteDetails = Pick<CampaignNote, 'title' | 'content' | 'category'>;

export function recentNotes(notes: CampaignNote[], limit = 3): CampaignNote[] {
  return [...notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function saveNote(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  details: NoteDetails,
  noteId?: string,
): { data: AppData; note: CampaignNote } {
  if (!data.campaigns.some((campaign) => campaign.id === campaignId))
    throw new Error('Campaign no longer exists.');
  const title = details.title.trim();
  const content = details.content.trim();
  if (!title || !content) throw new Error('Enter a title and note content.');
  const category = details.category?.trim() || 'General';
  const existing = noteId
    ? data.notes.find(
        (note) => note.id === noteId && note.campaignId === campaignId,
      )
    : undefined;
  if (noteId && !existing) throw new Error('Note not found in this campaign.');
  const now = new Date().toISOString();
  const note: CampaignNote = {
    id: existing?.id ?? crypto.randomUUID(),
    campaignId,
    title,
    content,
    category,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = {
    ...data,
    notes: existing
      ? data.notes.map((item) => (item.id === existing.id ? note : item))
      : [...data.notes, note],
  };
  repository.save(next);
  return { data: next, note };
}

export function deleteNote(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  noteId: string,
): AppData {
  if (
    !data.notes.some(
      (note) => note.id === noteId && note.campaignId === campaignId,
    )
  )
    throw new Error('Note not found in this campaign.');
  const next = {
    ...data,
    notes: data.notes.filter((note) => note.id !== noteId),
  };
  repository.save(next);
  return next;
}
