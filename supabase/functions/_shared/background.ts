/**
 * Maintient une tâche asynchrone en vie après l'envoi de la réponse HTTP.
 *
 * Sur le runtime Edge, l'isolate est arrêté dès que le handler retourne sa
 * réponse : toute promesse encore en vol qui n'a pas été enregistrée via
 * `EdgeRuntime.waitUntil()` est tuée avant d'aboutir. C'est ce qui empêchait
 * la génération des factures (appel réseau + Factur-X + upload storage) de
 * se terminer après une capture de paiement.
 *
 * Utiliser pour tout travail qui doit aboutir sans bloquer la réponse.
 */
export function keepAlive<T>(task: Promise<T>, label = 'background task'): Promise<T | void> {
  const guarded = task.catch((err: unknown) => {
    console.error(`[keepAlive] ${label}:`, err instanceof Error ? err.message : String(err));
  });

  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;

  runtime?.waitUntil?.(guarded);

  return guarded;
}
