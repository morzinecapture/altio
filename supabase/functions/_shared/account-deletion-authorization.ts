import { appleClientSecret, appleSubjectFromVerifiedUser, revokeAppleAuthorization } from './apple-revocation.ts';

type VerifiedUser = { id: string; identities?: { provider: string; identity_data?: Record<string, unknown> }[] };
type Environment = (name: string) => string | undefined;

// This function never deletes data, revokes tokens or consumes an Apple code.
export async function prepareAccountDeletion(user: VerifiedUser, get: Environment) {
  const appleSubject = appleSubjectFromVerifiedUser(user);
  if (appleSubject) await appleClientSecret(get); // Also validate the private key before asking the person to sign in.
  return { protocol: 1, ready: true, userId: user.id, requiresApple: appleSubject !== null, ...(appleSubject ? { appleSubject } : {}) };
}

export async function authorizeAccountDeletion(user: VerifiedUser, body: unknown, get: Environment,
  revoke: typeof revokeAppleAuthorization = revokeAppleAuthorization) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Confirmation de suppression requise');
  const input = body as Record<string, unknown>;
  if (input.action !== 'delete' || input.confirmation !== 'DELETE_MY_ACCOUNT') throw new Error('Confirmation de suppression requise');
  // Always resolve again from the server-verified identity. The preparation
  // response and caller-provided identity fields grant no authority.
  const expectedSubject = appleSubjectFromVerifiedUser(user);
  if (expectedSubject) {
    if (typeof input.appleAuthorizationCode !== 'string') throw new Error('Confirmation Apple requise');
    await revoke({ expectedSubject, authorizationCode: input.appleAuthorizationCode, get });
  }
}
