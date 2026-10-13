import { type ConnectAccountReader, retrieveConnectAccount, recipientReady } from './connect-account.ts'
import { expectedApplicationFee } from './billing.ts'

/** Fail closed: no customer payment without an operational Connect recipient. */
export async function requireConnectSplit(
  stripe: ConnectAccountReader,
  accountId: string | null | undefined,
  amount: number,
  applicationFee = Math.round(amount * 2 / 11),
) {
  if (!accountId) throw new Error('Le prestataire doit finaliser son compte de paiement')
  if (!Number.isSafeInteger(amount) || amount < 50) throw new Error('Montant de paiement invalide')
  if (!Number.isSafeInteger(applicationFee) || applicationFee < 0 || applicationFee >= amount) throw new Error('Commission de paiement invalide')
  const account = await retrieveConnectAccount(stripe, accountId)
  if (!recipientReady(account)) {
    throw new Error('Le compte de paiement du prestataire n’est pas encore actif')
  }
  return {
    transfer_data: { destination: accountId },
    application_fee_amount: applicationFee,
  }
}

/** Legacy authorizations without a split must be replaced, never captured. */
export function assertConnectIntent(intent: {
  transfer_data?: { destination: string | { id: string } } | null;
  application_fee_amount?: number | null;
  amount: number;
  metadata?: Record<string, string> | null;
}, expectedAccount: string | null | undefined) {
  const destination = intent.transfer_data?.destination
  const account = typeof destination === 'string' ? destination : destination?.id
  if (!expectedAccount || account !== expectedAccount ||
    intent.application_fee_amount !== expectedApplicationFee(intent)) {
    throw new Error('Autorisation de paiement sans partage Connect valide : un nouveau paiement est requis')
  }
}
