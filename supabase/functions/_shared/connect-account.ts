export interface ConnectAccount {
  id: string;
  closed?: boolean;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: { stripe_transfers?: { status?: string } | null } | null;
      } | null;
    } | null;
  } | null;
}

export interface ConnectAccountReader {
  v2: { core: { accounts: {
    retrieve: (id: string, params: { include: Array<'configuration.recipient' | 'requirements'> }) => Promise<ConnectAccount>;
  } } };
}

export function recipientReady(account: ConnectAccount): boolean {
  return !account.closed && account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active'
}

export async function retrieveConnectAccount(stripe: ConnectAccountReader, accountId: string) {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient', 'requirements'],
  })
  if (account.id !== accountId) throw new Error('Compte de paiement incohérent')
  return account
}

export function connectProfileStatus(account: ConnectAccount) {
  const ready = recipientReady(account)
  // Keep the existing app/DB contract. These are marketplace readiness flags,
  // not the deprecated v1 charge/payout fields (nor a bank payout guarantee).
  return {
    stripe_charges_enabled: ready,
    stripe_payouts_enabled: ready,
    stripe_onboarding_complete: ready,
  }
}

export function recipientAccountParams(providerId: string, email: string) {
  return {
    contact_email: email,
    identity: { country: 'FR' },
    dashboard: 'express' as const,
    defaults: { responsibilities: { fees_collector: 'application' as const, losses_collector: 'application' as const } },
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
    metadata: { altio_provider_id: providerId },
  }
}

export function onboardingLinkParams(accountId: string, baseUrl: string) {
  return {
    account: accountId,
    use_case: {
      type: 'account_onboarding' as const,
      account_onboarding: {
        refresh_url: `${baseUrl}/functions/v1/stripe-redirect?type=refresh`,
        return_url: `${baseUrl}/functions/v1/stripe-redirect?type=success`,
      },
    },
  }
}

export function connectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/authorization|authentication/i.test(message)) return 'Ta session a expiré. Reconnecte-toi puis réessaie.'
  if (message.includes('Rate limit')) return 'Trop de tentatives. Réessaie dans une minute.'
  return 'Impossible de configurer ton compte de paiement pour le moment. Réessaie dans quelques instants. Si le problème persiste, contacte le support Altio.'
}
