/** Invalidates private caches on identity changes and ignores obsolete profile requests. */
export function createSessionScope(clearPrivateCache: () => void) {
  let identity: string | null | undefined;
  let revision = 0;

  return {
    begin(userId: string | null) {
      if (identity !== userId) {
        clearPrivateCache();
        identity = userId;
      }
      const current = ++revision;
      return () => current === revision;
    },
    dispose() {
      revision++;
    },
  };
}
