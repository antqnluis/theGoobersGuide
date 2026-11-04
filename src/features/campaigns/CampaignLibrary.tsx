import { useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '../../shared/ui/useUnsavedChanges';
import type { Campaign } from './model';
import type { CampaignDetails } from './campaignService';

const blank: CampaignDetails = {
  name: '',
  partyName: '',
  description: '',
  currentLocation: '',
  status: '',
};

interface Props {
  campaigns: Campaign[];
  onCreate(details: CampaignDetails): boolean;
  onUpdate(id: string, details: CampaignDetails): boolean;
  onDelete(campaign: Campaign): void;
  error: string | null;
  feedback: string | null;
}

export default function CampaignLibrary({
  campaigns,
  onCreate,
  onUpdate,
  onDelete,
  error,
  feedback,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignDetails | null>(null);
  const [original, setOriginal] = useState<CampaignDetails | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(original);
  useUnsavedChanges(dirty, 'Discard unsaved campaign changes?');

  function start(campaign?: Campaign) {
    if (dirty && !window.confirm('Discard unsaved campaign changes?')) return;
    setEditingId(campaign?.id ?? null);
    const values = campaign
      ? {
          name: campaign.name,
          partyName: campaign.partyName,
          description: campaign.description ?? '',
          currentLocation: campaign.currentLocation ?? '',
          status: campaign.status ?? '',
        }
      : { ...blank };
    setOriginal(values);
    setDraft(values);
    setFormError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.partyName.trim()) {
      setFormError('Enter a campaign name and party name.');
      return;
    }
    const saved = editingId ? onUpdate(editingId, draft) : onCreate(draft);
    if (!saved) return;
    setDraft(null);
    setOriginal(null);
    setEditingId(null);
    setFormError(null);
  }

  function field(key: keyof CampaignDetails, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="preview-page">
      <div className="page-heading library-heading">
        <div>
          <p className="page-context">Your adventures</p>
          <h1>Campaign library</h1>
          <p>
            Choose a campaign to bring its party, notes, and character sheets
            into view.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => start()}
        >
          Create campaign
        </button>
      </div>

      {feedback && (
        <p className="form-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {draft && (
        <form className="campaign-form" onSubmit={submit}>
          <div className="section-heading">
            <h2>{editingId ? 'Edit campaign' : 'New campaign'}</h2>
          </div>
          <div className="campaign-fields">
            <label>
              Campaign name <span>Required</span>
              <input
                className="field-input"
                value={draft.name}
                onChange={(event) => field('name', event.target.value)}
                required
                maxLength={120}
                autoFocus
              />
            </label>
            <label>
              Party name <span>Required</span>
              <input
                className="field-input"
                value={draft.partyName}
                onChange={(event) => field('partyName', event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className="campaign-field-wide">
              Description
              <textarea
                className="field-input field-textarea"
                value={draft.description ?? ''}
                onChange={(event) => field('description', event.target.value)}
                rows={3}
              />
            </label>
            <label>
              Current location
              <input
                className="field-input"
                value={draft.currentLocation ?? ''}
                onChange={(event) =>
                  field('currentLocation', event.target.value)
                }
                maxLength={160}
              />
            </label>
            <label>
              Status
              <input
                className="field-input"
                value={draft.status ?? ''}
                onChange={(event) => field('status', event.target.value)}
                maxLength={120}
              />
            </label>
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="campaign-actions">
            <button className="button button-primary" type="submit">
              {editingId ? 'Save changes' : 'Create campaign'}
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => {
                setDraft(null);
                setOriginal(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className="campaign-empty">
          <h2>No campaigns yet</h2>
          <p>Create your first campaign to start its party and journal.</p>
          {!draft && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => start()}
            >
              Create campaign
            </button>
          )}
        </div>
      ) : (
        <div className="library-list" aria-label="Saved campaigns">
          {campaigns.map((campaign) => (
            <div className="campaign-list-row" key={campaign.id}>
              <a className="campaign-entry" href={`#/campaign/${campaign.id}`}>
                <span className="campaign-entry-mark" aria-hidden="true">
                  {campaign.name.charAt(0).toUpperCase()}
                </span>
                <span className="campaign-entry-copy">
                  {campaign.status && (
                    <span className="entry-status">{campaign.status}</span>
                  )}
                  <strong>{campaign.name}</strong>
                  <span>{campaign.partyName}</span>
                </span>
                {campaign.currentLocation && (
                  <span className="campaign-entry-location">
                    {campaign.currentLocation}
                  </span>
                )}
                <span className="entry-chevron" aria-hidden="true">
                  ›
                </span>
              </a>
              <div className="campaign-row-actions">
                <button
                  type="button"
                  onClick={() => start(campaign)}
                  aria-label={`Edit ${campaign.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => onDelete(campaign)}
                  aria-label={`Delete ${campaign.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
