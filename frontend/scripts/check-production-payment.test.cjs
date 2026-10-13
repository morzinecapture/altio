const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const script = path.join(__dirname, 'check-production-payment.cjs');
function run(env, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_APP_ENV: 'development', ...env }, encoding: 'utf8',
  });
}
test('development build remains available', () => assert.equal(run({}).status, 0));
test('production refuses a test key', () => {
  const result = run({ EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture' }, ['--production']);
  assert.equal(result.status, 1); assert.match(result.stderr, /Stripe LIVE/);
  assert.doesNotMatch(result.stderr, /pk_test_fixture/);
});
for (const env of [{ EAS_BUILD_PROFILE: 'production' }, { EXPO_PUBLIC_APP_ENV: 'production' }]) {
  test(`release blocks unresolved readiness issues ${JSON.stringify(env)}`, () => {
    const result = run({ ...env, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture' });
    assert.equal(result.status, 1); assert.match(result.stderr, /invoice-emergency-phases/);
    assert.doesNotMatch(result.stderr, /pk_live_fixture/);
  });
}
test('TestFlight accepts explicit test configuration only', () => {
  const env = { EAS_BUILD_PROFILE: 'testflight', EXPO_PUBLIC_APP_ENV: 'test', EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture' };
  assert.equal(run(env).status, 0);
  assert.equal(run({ ...env, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture' }).status, 1);
  assert.equal(run({ ...env, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: '' }).status, 1);
  assert.equal(run({ ...env, EXPO_PUBLIC_APP_ENV: 'development' }).status, 1);
  assert.equal(run(env, ['--production']).status, 1);
  assert.equal(run({ ...env, EXPO_PUBLIC_APP_ENV: 'production' }).status, 1);
});
