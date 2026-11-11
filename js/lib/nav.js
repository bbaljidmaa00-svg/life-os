/**
 * Hash-based navigation helpers. Kept separate from router.js so pages can
 * import them without creating a circular import.
 *
 * Routes look like  #/tasks   #/goals/<id>   #/calendar?view=week&date=2026-11-02
 */
export function navigate(path, { replace = false } = {}) {
  const hash = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new Event('lifeos:route'));
  } else if (location.hash === hash) {
    window.dispatchEvent(new Event('lifeos:route'));
  } else {
    location.hash = hash;
  }
}

export function parseRoute(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = clean.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return {
    name: parts[0] || 'dashboard',
    params: parts.slice(1),
    query: Object.fromEntries(new URLSearchParams(qs)),
    key: hash || '#/dashboard',
  };
}

/** Ask the router to re-render the current page (e.g. after local UI state changed). */
export const rerender = () => window.dispatchEvent(new Event('lifeos:route'));
