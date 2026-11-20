import { lazy, Suspense, useEffect, useState } from 'react';
import { ToastHost } from '../components/Toast';
import { t } from '../i18n/t';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { NewPuzzleScreen } from '../screens/new/NewPuzzleScreen';
import { PlayScreen } from '../screens/play/PlayScreen';
import styles from './App.module.css';
import { navigate, useRoute } from './router';
import { useAppStore } from './store';

/**
 * Dev-only debug routes. `import.meta.env.DEV` is a compile-time constant, so in
 * production builds these chunks are removed entirely.
 */
const debugPages = import.meta.env.DEV
  ? {
      shapes: lazy(() => import('../debug/ShapesDebug')),
      bake: lazy(() => import('../debug/BakeDebug')),
      play: lazy(() => import('../debug/PlayDebug')),
    }
  : null;

export function App() {
  const route = useRoute();
  const storage = useAppStore((s) => s.storage);
  const init = useAppStore((s) => s.init);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void init().finally(() => setReady(true));
  }, [init]);

  useEffect(() => {
    if (route.name === 'notFound') navigate({ name: 'library' }, { replace: true });
  }, [route.name]);

  if (route.name === 'debug') {
    const Page = debugPages?.[route.page];
    if (Page) {
      return (
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      );
    }
  }

  if (!ready) {
    return (
      <p className={styles.loading} role="status">
        {t('app.loading')}
      </p>
    );
  }

  return (
    <>
      {storage && !storage.persistent && (
        <div className={styles.banner} role="status" data-testid="storage-banner">
          {t('storage.unavailable')}
        </div>
      )}
      {route.name === 'new' ? (
        <NewPuzzleScreen />
      ) : route.name === 'play' ? (
        <PlayScreen key={route.id} puzzleId={route.id} />
      ) : (
        <LibraryScreen />
      )}
      <ToastHost />
    </>
  );
}
