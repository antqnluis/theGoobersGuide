import { describe, expect, it } from 'vitest';
import {
  featureMatchesQuery,
  groupCharacterFeatures,
} from '../src/features/characters/characterFeatureDisplay';
import type { CharacterFeature } from '../src/features/characters/model';

function feature(
  id: string,
  name: string,
  category?: string,
  description = `${name} description`,
): CharacterFeature {
  return { id, name, category, description };
}

describe('character feature display', () => {
  it('groups categories case-insensitively in first-seen order', () => {
    const groups = groupCharacterFeatures([
      feature('maneuver-1', 'Riposte', 'Maneuver'),
      feature('species', 'Darkvision', 'Species trait'),
      feature('maneuver-2', 'Precision Attack', ' maneuver '),
      feature('feat', 'Sentinel', 'Feat'),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'Maneuver',
      'Species trait',
      'Feat',
    ]);
    expect(groups[0].features.map((entry) => entry.id)).toEqual([
      'maneuver-1',
      'maneuver-2',
    ]);
  });

  it('keeps feature order and places uncategorized entries last', () => {
    const groups = groupCharacterFeatures([
      feature('other-1', 'First uncategorized'),
      feature('class-1', 'Action Surge', 'Class feature'),
      feature('other-2', 'Second uncategorized', '   '),
      feature('class-2', 'Second Wind', 'Class feature'),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'Class feature',
      'Other features',
    ]);
    expect(groups[0].features.map((entry) => entry.id)).toEqual([
      'class-1',
      'class-2',
    ]);
    expect(groups[1].features.map((entry) => entry.id)).toEqual([
      'other-1',
      'other-2',
    ]);
  });

  it('filters by feature name or category without matching descriptions', () => {
    const features = [
      feature('class', 'Action Surge', 'Class feature', 'Act again.'),
      feature('species', 'Darkvision', 'Species trait', 'See in darkness.'),
    ];

    expect(groupCharacterFeatures(features, 'SURGE')[0].features[0].id).toBe(
      'class',
    );
    expect(groupCharacterFeatures(features, 'species')[0].features[0].id).toBe(
      'species',
    );
    expect(groupCharacterFeatures(features, 'darkness')).toEqual([]);
    expect(featureMatchesQuery(features[0], ' class ')).toBe(true);
  });
});
