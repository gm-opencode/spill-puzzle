import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from '../../../src/app/router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'library' }],
    ['#', { name: 'library' }],
    ['#/', { name: 'library' }],
    ['#/new', { name: 'new' }],
    ['#/new?shared=1', { name: 'new' }],
    ['#/play/abc-123', { name: 'play', id: 'abc-123' }],
    ['#/play/a%20b', { name: 'play', id: 'a b' }],
    ['#/debug/shapes', { name: 'debug', page: 'shapes' }],
    ['#/debug/play', { name: 'debug', page: 'play' }],
    ['#/debug/nope', { name: 'notFound' }],
    ['#/play', { name: 'notFound' }],
    ['#/play/a/b', { name: 'notFound' }],
    ['#/elsewhere', { name: 'notFound' }],
  ] as Array<[string, Route]>)('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips through routeHash', () => {
    const routes: Route[] = [
      { name: 'library' },
      { name: 'new' },
      { name: 'play', id: 'x y/z' },
      { name: 'debug', page: 'bake' },
    ];
    for (const r of routes) expect(parseRoute(routeHash(r))).toEqual(r);
    expect(routeHash({ name: 'notFound' })).toBe('#/');
  });
});
