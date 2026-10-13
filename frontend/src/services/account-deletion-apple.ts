import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

/** Fresh one-use code, held only in memory; never switches the Altio session. */
export async function confirmAppleAccountDeletion(expectedSubject: string): Promise<string> {
  if (!expectedSubject || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('La confirmation Apple est indisponible sur cet appareil.');
  }
  const state = Crypto.randomUUID();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({ requestedScopes: [], state });
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Suppression annulée. Votre compte est conservé.');
    }
    throw new Error('La confirmation Apple a échoué. Votre compte est conservé. Réessayez.');
  }
  if (credential.state !== state || credential.user !== expectedSubject) {
    throw new Error('Le compte Apple confirmé ne correspond pas à votre compte Altio.');
  }
  if (!credential.authorizationCode?.trim()) {
    throw new Error('Apple n’a pas fourni la confirmation nécessaire. Réessayez.');
  }
  return credential.authorizationCode;
}
