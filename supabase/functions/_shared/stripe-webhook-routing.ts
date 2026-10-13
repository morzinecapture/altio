// The URL selects a signing secret, never bypasses signature verification.
export function webhookSecretName(url: string): string {
  if (new URL(url).searchParams.get('source') === 'connect-v2') return 'STRIPE_CONNECT_V2_WEBHOOK_SECRET';
  return new URL(url).searchParams.get('source') === 'connect'
    ? 'STRIPE_CONNECT_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET';
}

export const connectV2Events = [
  'v2.core.account[requirements].updated',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account.closed',
];

export function webhookScopeMatches(url: string, event: { type: string; account?: string; livemode: boolean; related_object?: { id?: string; type?: string }; data?: { object?: unknown } }, key: string): boolean {
  const test = /^(sk|rk)_test_/.test(key);
  const live = /^(sk|rk)_live_/.test(key);
  if ((!test && !live) || event.livemode !== live) return false;
  if (new URL(url).searchParams.get('source') === 'connect-v2') {
    if (event.type === 'v2.core.event_destination.ping') return true;
    return connectV2Events.includes(event.type) && event.related_object?.type === 'v2.core.account' &&
      /^acct_[A-Za-z0-9]+$/.test(event.related_object?.id || '');
  }
  if (new URL(url).searchParams.get('source') === 'connect') {
    const object = event.data?.object as { id?: string } | undefined;
    return event.type === 'account.updated' && !!event.account && event.account === object?.id;
  }
  return !event.account && ['payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded'].includes(event.type);
}
