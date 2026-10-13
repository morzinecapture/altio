const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../../frontend/node_modules/typescript');
const source = fs.readFileSync('supabase/functions/_shared/auth.ts', 'utf8').replace(/^import .*$/gm, '');
function auth(env = {}, validUser = false) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, requireActiveSession: async () => {}, console: { log() {}, error() {} },
    Deno: { env: { get: name => env[name] } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: validUser ? { id: 'owner' } : null }, error: null }) } }),
  });
  return headers => exports.requireAuthOrServiceKey(new Request('https://local.invalid', { headers }));
}
test('server invoke with a configured secret apikey and no Authorization is accepted', async () => {
  const result = await auth({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_server' })({ apikey: 'sb_secret_server' });
  assert.equal(result.isServiceCall, true);
});
test('named project secret keys are accepted', async () => {
  const result = await auth({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_named' }) })({ apikey: 'sb_secret_named' });
  assert.equal(result.isServiceCall, true);
});
for (const key of ['sb_secret_forged', 'sb_publishable_public', '']) {
  test(`untrusted apikey is rejected: ${key || 'empty'}`, async () => {
    await assert.rejects(auth({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_server' })({ apikey: key }));
  });
}
test('malformed secret dictionary does not grant access', async () => {
  await assert.rejects(auth({ SUPABASE_SECRET_KEYS: 'broken' })({ apikey: 'sb_secret_forged' }));
});
test('legacy bearer service key remains accepted', async () => {
  const result = await auth({ SUPABASE_SERVICE_ROLE_KEY: 'legacy-jwt' })({ Authorization: 'Bearer legacy-jwt' });
  assert.equal(result.isServiceCall, true);
});
test('valid user with public apikey is never upgraded to service access', async () => {
  const result = await auth({}, true)({ apikey: 'sb_publishable_public', Authorization: 'Bearer user-jwt' });
  assert.equal(result.isServiceCall, false);
  assert.equal(result.user.id, 'owner');
});
test('user-only endpoints still reject an apikey without a user token', async () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  await assert.rejects(exports.requireAuth(new Request('https://local.invalid', { headers: { apikey: 'sb_secret_server' } })));
});
