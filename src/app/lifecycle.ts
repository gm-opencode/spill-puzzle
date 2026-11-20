/**
 * "Save before the page goes away" hooks. Screens register a flush (the Play screen's
 * autosave); the update prompt calls `flushAll()` before reloading (spec §8: progress is
 * never lost on update).
 */

type Flush = () => Promise<void>;

const flushers = new Set<Flush>();

/** Register a flush. Returns an unregister function. */
export function onFlush(flush: Flush): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** Run every registered flush; failures are logged, not thrown. */
export async function flushAll(): Promise<void> {
  await Promise.all(
    [...flushers].map((f) =>
      f().catch((error: unknown) => console.error('Flush before reload failed', error)),
    ),
  );
}
