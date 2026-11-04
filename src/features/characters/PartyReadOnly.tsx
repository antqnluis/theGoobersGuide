import { useRef, useState } from 'react';
import type { Campaign } from '../campaigns/model';
import { CHARACTER_CONVERSION_PROMPT } from './characterConversionPrompt';
import type { Character } from './model';

export default function PartyReadOnly({
  campaign,
  characters,
  onDelete,
  onImportFile,
  onImportText,
  error,
}: {
  campaign: Campaign;
  characters: Character[];
  onDelete: (character: Character) => void;
  onImportFile: (file: File) => void;
  onImportText: (source: string) => void;
  error: string | null;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [formatOpen, setFormatOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copyConversionPrompt() {
    try {
      await navigator.clipboard.writeText(CHARACTER_CONVERSION_PROMPT);
      setCopyStatus('Conversion prompt copied.');
    } catch {
      setCopyStatus(
        'Copy failed. Select the prompt text and copy it manually.',
      );
    }
  }

  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">{campaign.name}</p>
        <h1>Party</h1>
        <div className="page-heading-actions">
          <a
            className="button button-primary"
            href={`#/characters/${campaign.id}/new`}
          >
            Add character
          </a>
          <button
            className="button button-quiet"
            type="button"
            aria-expanded={importOpen}
            aria-controls="character-json-import"
            onClick={() => {
              setImportOpen((open) => !open);
              setFormatOpen(false);
              setCopyStatus(null);
            }}
          >
            Import JSON
          </button>
          <button
            className="button button-quiet"
            type="button"
            aria-expanded={formatOpen}
            aria-controls="character-format-guide"
            onClick={() => {
              setFormatOpen((open) => !open);
              setImportOpen(false);
              setCopyStatus(null);
            }}
          >
            Format guide
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {importOpen && (
          <section
            className="import-workspace"
            id="character-json-import"
            aria-labelledby="character-import-heading"
          >
            <div className="import-workspace-heading">
              <h2 id="character-import-heading">Import a character</h2>
              <p>
                Paste converted JSON directly, or choose a saved character file.
                You will review everything before it is added.
              </p>
            </div>
            <div className="import-options">
              <div className="import-paste-option">
                <label htmlFor="character-json-text">Paste JSON</label>
                <textarea
                  id="character-json-text"
                  className="import-json-text"
                  rows={13}
                  spellCheck={false}
                  placeholder='Paste JSON beginning with { "format": "the-goobers-guide-character" ... }'
                  value={pastedJson}
                  onChange={(event) => setPastedJson(event.target.value)}
                />
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => onImportText(pastedJson)}
                >
                  Review pasted JSON
                </button>
              </div>
              <div className="import-file-option">
                <div>
                  <strong>Upload a file</strong>
                  <span>Choose a .json file smaller than 1 MB.</span>
                </div>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => fileInput.current?.click()}
                >
                  Choose JSON file
                </button>
                <input
                  ref={fileInput}
                  className="visually-hidden"
                  type="file"
                  accept=".json,application/json"
                  aria-label="Choose a character JSON file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImportFile(file);
                    event.target.value = '';
                  }}
                />
              </div>
            </div>
          </section>
        )}
        {formatOpen && (
          <section
            className="conversion-guide"
            id="character-format-guide"
            aria-labelledby="character-format-heading"
          >
            <div className="conversion-guide-heading">
              <div>
                <h2 id="character-format-heading">
                  Convert a Markdown character sheet
                </h2>
                <p>
                  Copy this prompt, attach or paste the character&apos;s
                  Markdown handoff, then paste the returned JSON into the
                  importer or save it as a <code>.json</code> file.
                </p>
              </div>
              <button
                className="button button-primary"
                type="button"
                onClick={copyConversionPrompt}
              >
                Copy conversion prompt
              </button>
            </div>
            <textarea
              className="conversion-prompt"
              aria-label="Markdown to character JSON conversion prompt"
              readOnly
              rows={18}
              value={CHARACTER_CONVERSION_PROMPT}
              onFocus={(event) => event.currentTarget.select()}
            />
            {copyStatus && (
              <p className="conversion-copy-status" role="status">
                {copyStatus}
              </p>
            )}
          </section>
        )}
      </div>
      {characters.length ? (
        characters.map((character) => (
          <div className="party-entry party-entry-large" key={character.id}>
            <a
              className="party-entry-link"
              href={`#/characters/${campaign.id}/${character.id}`}
            >
              <span className="party-initial" aria-hidden="true">
                {character.name.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{character.name}</strong>
                <small>
                  Level {character.level} {character.species}{' '}
                  {character.className}
                </small>
              </span>
              <span className="party-entry-hp">
                {character.combat.currentHp}/{character.combat.maximumHp} HP ·
                AC {character.combat.armorClass}
              </span>
            </a>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => onDelete(character)}
              aria-label={`Delete ${character.name}`}
            >
              Delete
            </button>
          </div>
        ))
      ) : (
        <div className="campaign-empty">
          <h2>No party members yet</h2>
          <p>Add a character to start this campaign's roster.</p>
          <a
            className="button button-primary"
            href={`#/characters/${campaign.id}/new`}
          >
            Add character
          </a>
        </div>
      )}
    </div>
  );
}
