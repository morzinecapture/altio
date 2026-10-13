// Server-only helper. The Apple subject must come from auth.getUser(), never
// from request JSON or user-editable metadata. No credential is logged/stored.
type Env = (name: string) => string | undefined;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const jsonPart = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));

export function appleSubjectFromVerifiedUser(user: { identities?: { provider: string; identity_data?: Record<string, unknown> }[]; app_metadata?: { provider?: string; providers?: unknown } }): string | null {
  if (!Array.isArray(user.identities)) throw new Error('Identités de connexion indisponibles');
  const identities = user.identities.filter(identity => identity.provider === 'apple');
  if (!identities.length) {
    const providers = user.app_metadata?.providers;
    if (user.app_metadata?.provider === 'apple' || (Array.isArray(providers) && providers.includes('apple'))) {
      throw new Error('Identité Apple indisponible');
    }
    return null;
  }
  const subjects = identities.map(identity => identity.identity_data?.sub);
  if (subjects.some(sub => typeof sub !== 'string' || !sub) || new Set(subjects).size !== 1) throw new Error('Identité Apple indisponible');
  return subjects[0] as string;
}

export async function appleClientSecret(get: Env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const values = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_CLIENT_ID', 'APPLE_PRIVATE_KEY'].map(name => get(name)?.trim());
  if (values.some(value => !value)) throw new Error('Révocation Apple non configurée');
  const [team, keyId, clientId, pem] = values as string[];
  const privateKey = await crypto.subtle.importKey('pkcs8', decode(pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const payload = `${jsonPart({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${jsonPart({ iss: team, iat: nowSeconds, exp: nowSeconds + 300, aud: 'https://appleid.apple.com', sub: clientId })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(payload));
  return { clientId, secret: `${payload}.${encode(new Uint8Array(signature))}` };
}

export async function revokeAppleAuthorization(options: {
  expectedSubject: string; authorizationCode: string; get: Env; fetcher?: typeof fetch; nowSeconds?: number;
}) {
  const { expectedSubject, authorizationCode, get } = options;
  if (!expectedSubject || typeof authorizationCode !== 'string' || !authorizationCode.trim() || authorizationCode.length > 4096) throw new Error('Confirmation Apple requise');
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const { clientId, secret } = await appleClientSecret(get, now);
  const fetcher = options.fetcher || fetch;
  const post = async (path: string, fields: Record<string, string>) => {
    try {
      const response = await fetcher(`https://appleid.apple.com/auth/${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: secret, ...fields }),
      });
      if (!response.ok) throw new Error();
      return response;
    } catch { throw new Error('Apple n’a pas confirmé la révocation. Réessayez.'); }
  };
  const exchange = await post('token', { code: authorizationCode, grant_type: 'authorization_code' });
  let tokens;
  try { tokens = await exchange.json(); } catch { throw new Error('Réponse Apple invalide'); }
  // This token is received directly from Apple's authenticated HTTPS token
  // endpoint after exchanging the one-time code; no caller-supplied JWT is decoded.
  let claims;
  try {
    if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16384 || tokens.id_token.split('.').length !== 3) throw new Error();
    claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(tokens.id_token.split('.')[1])));
  } catch { throw new Error('Identité Apple non confirmée'); }
  if (claims.iss !== 'https://appleid.apple.com' || claims.aud !== clientId || claims.sub !== expectedSubject ||
      typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60) {
    throw new Error('Le compte Apple confirmé ne correspond pas au compte à supprimer');
  }
  if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) throw new Error('Jeton de révocation Apple indisponible');
  await post('revoke', { token: tokens.refresh_token, token_type_hint: 'refresh_token' });
  return { revoked: true as const };
}
