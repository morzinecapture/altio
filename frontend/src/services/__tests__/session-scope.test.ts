import { QueryClient } from '@tanstack/react-query';
import { createSessionScope } from '../session-scope';

describe('isolation des sessions', () => {
  test('purge les factures privées à la déconnexion et au changement de compte', () => {
    const client = new QueryClient();
    const scope = createSessionScope(() => client.clear());
    scope.begin('owner-a');
    client.setQueryData(['invoices', 'buyer'], [{ owner: 'owner-a' }]);
    scope.begin(null);
    expect(client.getQueryData(['invoices', 'buyer'])).toBeUndefined();
    scope.begin('owner-a');
    client.setQueryData(['invoices', 'buyer'], [{ owner: 'owner-a' }]);
    scope.begin('owner-b');
    expect(client.getQueryData(['invoices', 'buyer'])).toBeUndefined();
    client.clear();
  });

  test('conserve le cache lors du renouvellement du jeton du même compte', () => {
    const clear = jest.fn();
    const scope = createSessionScope(clear);
    scope.begin('owner-a');
    scope.begin('owner-a');
    expect(clear).toHaveBeenCalledTimes(1);
  });

  test('ignore un profil retardé après déconnexion, reconnexion ou démontage', () => {
    const scope = createSessionScope(jest.fn());
    const oldProfile = scope.begin('owner-a');
    scope.begin(null);
    expect(oldProfile()).toBe(false);
    const firstLogin = scope.begin('owner-a');
    const secondLogin = scope.begin('owner-a');
    expect(firstLogin()).toBe(false);
    expect(secondLogin()).toBe(true);
    scope.dispose();
    expect(secondLogin()).toBe(false);
  });

  test('une requête privée en vol ne repeuple pas le cache après purge', async () => {
    const client = new QueryClient();
    const scope = createSessionScope(() => client.clear());
    scope.begin('owner-a');
    let resolve!: (value: string) => void;
    const pending = client.fetchQuery({ queryKey: ['private'], queryFn: () => new Promise<string>(r => { resolve = r; }) });
    const settled = pending.catch(() => undefined);
    scope.begin('owner-b');
    resolve('owner-a-secret');
    await settled;
    expect(client.getQueryData(['private'])).toBeUndefined();
    client.clear();
  });
});
