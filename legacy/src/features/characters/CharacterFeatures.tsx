import { useEffect, useMemo, useRef, useState } from 'react';
import {
  featureMatchesQuery,
  groupCharacterFeatures,
} from './characterFeatureDisplay';
import type { CharacterFeature } from './model';

function featureLabel(feature: CharacterFeature): string {
  return feature.name.trim() || 'Untitled feature';
}

function featureCount(count: number): string {
  return `${count} ${count === 1 ? 'feature' : 'features'}`;
}

export default function CharacterFeatures({
  characterId,
  features,
  editing,
  onChange,
}: {
  characterId: string;
  features: CharacterFeature[];
  editing: boolean;
  onChange: (features: CharacterFeature[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [openFeatureIds, setOpenFeatureIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  const visibleFeatures = useMemo(
    () => features.filter((feature) => featureMatchesQuery(feature, query)),
    [features, query],
  );
  const groups = useMemo(
    () => groupCharacterFeatures(features, query),
    [features, query],
  );

  useEffect(() => {
    setQuery('');
    setOpenFeatureIds(new Set());
    setPendingFocusId(null);
  }, [characterId]);

  useEffect(() => {
    setOpenFeatureIds(new Set());
  }, [editing]);

  useEffect(() => {
    if (!pendingFocusId) return;
    const input = nameInputs.current.get(pendingFocusId);
    if (!input) return;
    input.focus();
    setPendingFocusId(null);
  }, [features, pendingFocusId]);

  function updateFeature(id: string, changes: Partial<CharacterFeature>) {
    onChange(
      features.map((feature) =>
        feature.id === id ? { ...feature, ...changes } : feature,
      ),
    );
  }

  function removeFeature(id: string) {
    onChange(features.filter((feature) => feature.id !== id));
    setOpenFeatureIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function addFeature() {
    const id = crypto.randomUUID();
    setQuery('');
    setOpenFeatureIds((current) => new Set(current).add(id));
    setPendingFocusId(id);
    onChange([...features, { id, name: '', description: '' }]);
  }

  function setFeatureOpen(id: string, open: boolean) {
    setOpenFeatureIds((current) => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function featureEntry(feature: CharacterFeature, showCategory: boolean) {
    const label = featureLabel(feature);
    return (
      <details
        className="feature-entry-accordion"
        key={feature.id}
        open={openFeatureIds.has(feature.id)}
        onToggle={(event) =>
          setFeatureOpen(feature.id, event.currentTarget.open)
        }
      >
        <summary>
          <span className="feature-summary-name">{label}</span>
          {showCategory && (
            <span className="feature-summary-category">
              {feature.category?.trim() || 'Other feature'}
            </span>
          )}
        </summary>
        {editing ? (
          <div className="feature-editor">
            <div className="feature-editor-grid">
              <label>
                Category
                <input
                  className="field-input"
                  value={feature.category ?? ''}
                  onChange={(event) =>
                    updateFeature(feature.id, {
                      category: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Feature name
                <input
                  ref={(input) => {
                    if (input) nameInputs.current.set(feature.id, input);
                    else nameInputs.current.delete(feature.id);
                  }}
                  className="field-input"
                  value={feature.name}
                  onChange={(event) =>
                    updateFeature(feature.id, { name: event.target.value })
                  }
                />
              </label>
              <label className="feature-editor-description">
                Description
                <textarea
                  className="field-input field-textarea"
                  rows={4}
                  value={feature.description}
                  onChange={(event) =>
                    updateFeature(feature.id, {
                      description: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => removeFeature(feature.id)}
            >
              Remove feature
            </button>
          </div>
        ) : (
          <p className="feature-description">
            {feature.description.trim() || 'No description recorded.'}
          </p>
        )}
      </details>
    );
  }

  return (
    <section
      className="sheet-section sheet-section-wide features-section"
      aria-labelledby="features-heading"
    >
      <div className="section-heading feature-section-heading">
        <div className="feature-section-title">
          <h2 id="features-heading">Features</h2>
          <p>{featureCount(features.length)}. Select a feature to read more.</p>
        </div>
        {features.length > 0 && (
          <label className="feature-filter">
            Find a feature
            <input
              className="field-input"
              type="search"
              placeholder="Name or category"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
      </div>

      {query && visibleFeatures.length > 0 && (
        <p className="feature-filter-status" role="status">
          Showing {visibleFeatures.length} of {features.length} features.
        </p>
      )}

      {!features.length ? (
        <div className="feature-empty-state">
          <strong>No features added yet.</strong>
          <span>
            {editing
              ? 'Add a class feature, species trait, feat, or homebrew feature.'
              : 'Select Edit sheet to add class features, traits, feats, or homebrew details.'}
          </span>
        </div>
      ) : !visibleFeatures.length ? (
        <div className="feature-empty-state">
          <strong>No features match “{query.trim()}”.</strong>
          <span>Try a feature name or category.</span>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setQuery('')}
          >
            Clear filter
          </button>
        </div>
      ) : editing ? (
        <div className="feature-accordion-list feature-edit-list">
          {visibleFeatures.map((feature) => featureEntry(feature, true))}
        </div>
      ) : (
        <div className="feature-groups">
          {groups.map((group) => (
            <section className="feature-category-group" key={group.key}>
              <div className="feature-category-heading">
                <h3>{group.label}</h3>
                <span>{featureCount(group.features.length)}</span>
              </div>
              <div className="feature-accordion-list">
                {group.features.map((feature) => featureEntry(feature, false))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <button
          type="button"
          className="button button-quiet add-feature-button"
          onClick={addFeature}
        >
          Add feature
        </button>
      )}
    </section>
  );
}
