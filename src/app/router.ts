/**
 * Hash router (spec §1): `#/`, `#/new`, `#/play/:puzzleId`, plus dev-only debug pages.
 * Hash routing works on any static host and offline without server rewrites.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'new' }
  | { name: 'play'; id: string }
  | { name: 'debug'; page: 'shapes' | 'bake' | 'play' }
  | { name: 'notFound' };

/** Parse a `location.hash` value. Pure. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'library' };
  if (parts[0] === 'new' && parts.length === 1) return { name: 'new' };
  if (parts[0] === 'play' && parts.length === 2 && parts[1]) {
    return { name: 'play', id: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'debug' && parts.length === 2) {
    const page = parts[1];
    if (page === 'shapes' || page === 'bake' || page === 'play') return { name: 'debug', page };
  }
  return { name: 'notFound' };
}

/** The hash for a route. Pure. */
export function routeHash(route: Route): string {
  switch (route.name) {
    case 'library':
    case 'notFound':
      return '#/';
    case 'new':
      return '#/new';
    case 'play':
      return `#/play/${encodeURIComponent(route.id)}`;
    case 'debug':
      return `#/debug/${route.page}`;
  }
}

/**
 * Go to a route. `replace` swaps the history entry (e.g. redirects), so Back doesn't
 * return to a dead page.
 */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeHash(route);
  if (options.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
