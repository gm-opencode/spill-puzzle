import { lazy, Suspense, useEffect, useState } from 'react';

/**
 * Dev-only debug route. `import.meta.env.DEV` is a compile-time constant, so in
 * production builds this branch and the debug chunk are removed entirely.
 */
const ShapesDebug = import.meta.env.DEV ? lazy(() => import('../debug/ShapesDebug')) : null;
const BakeDebug = import.meta.env.DEV ? lazy(() => import('../debug/BakeDebug')) : null;

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();

  if (ShapesDebug && hash.startsWith('#/debug/shapes')) {
    return (
      <Suspense fallback={null}>
        <ShapesDebug />
      </Suspense>
    );
  }

  if (BakeDebug && hash.startsWith('#/debug/bake')) {
    return (
      <Suspense fallback={null}>
        <BakeDebug />
      </Suspense>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>PicPuzzle</h1>
    </main>
  );
}
