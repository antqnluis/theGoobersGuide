import type { CharacterFeature } from './model';

export interface CharacterFeatureGroup {
  key: string;
  label: string;
  features: CharacterFeature[];
}

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export function featureMatchesQuery(
  feature: CharacterFeature,
  query: string,
): boolean {
  const match = normalized(query);
  if (!match) return true;

  return (
    normalized(feature.name).includes(match) ||
    normalized(feature.category).includes(match)
  );
}

export function groupCharacterFeatures(
  features: CharacterFeature[],
  query = '',
): CharacterFeatureGroup[] {
  const groups = new Map<string, CharacterFeatureGroup>();
  const uncategorized: CharacterFeature[] = [];

  for (const feature of features) {
    if (!featureMatchesQuery(feature, query)) continue;

    const category = feature.category?.trim();
    if (!category) {
      uncategorized.push(feature);
      continue;
    }

    const key = normalized(category);
    const group = groups.get(key);
    if (group) group.features.push(feature);
    else
      groups.set(key, {
        key: `category:${key}`,
        label: category,
        features: [feature],
      });
  }

  const result = [...groups.values()];
  if (uncategorized.length)
    result.push({
      key: 'uncategorized',
      label: 'Other features',
      features: uncategorized,
    });
  return result;
}
