export interface PreviewRoute {
  campaignId: string;
  page: 'list' | 'new' | 'detail';
  adventureId?: string;
  view: 'active' | 'completed';
}
export function readRoute(hash: string): PreviewRoute {
  if (!hash || hash === '#')
    return { campaignId: 'lantern-coast', page: 'list', view: 'active' };
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/');
  const view =
    new URLSearchParams(query).get('view') === 'completed'
      ? 'completed'
      : 'active';
  if (parts[0] !== 'campaigns' || parts[2] !== 'adventures' || parts.length > 4)
    return { campaignId: '', page: 'list', view };
  return {
    campaignId: parts[1],
    page: !parts[3] ? 'list' : parts[3] === 'new' ? 'new' : 'detail',
    adventureId: parts[3] && parts[3] !== 'new' ? parts[3] : undefined,
    view,
  };
}
export function routeHash(route: PreviewRoute): string {
  return `#/campaigns/${route.campaignId}/adventures${route.page === 'new' ? '/new' : route.page === 'detail' ? `/${route.adventureId}` : ''}${route.view === 'completed' ? '?view=completed' : ''}`;
}
