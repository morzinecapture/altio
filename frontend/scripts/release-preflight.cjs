const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.resolve(__dirname, '..');
const root = path.dirname(frontend);
const output = path.join(root, 'outputs/release-preflight/latest');
fs.mkdirSync(output, { recursive: true });
const pglite = process.env.PGLITE_MODULE || path.join(frontend, 'node_modules/@electric-sql/pglite');
const serverTests = fs.readdirSync(path.join(root, 'supabase/functions/tests'))
  .filter(f => f.endsWith('.test.cjs')).map(f => path.join(root, 'supabase/functions/tests', f));
const checks = [
  ['routes', process.execPath, ['-e', 'process.env.EXPO_ROUTER_APP_ROOT=require("node:path").resolve("app");require("expo-router/build/typed-routes").regenerateDeclarations(".expo/types")'], frontend],
  ['typescript', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], frontend],
  ['lint', process.execPath, ['node_modules/expo/bin/cli', 'lint'], frontend],
  ['application', process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand'], frontend],
  ['server', process.execPath, ['--test', ...serverTests], root],
  ['dependency-guards', process.execPath, ['--test', 'scripts/security-dependencies.test.cjs'], frontend],
  ['payment-guard', process.execPath, ['--test', 'scripts/check-production-payment.test.cjs'], frontend],
  ['app-store', process.execPath, ['scripts/check-app-store.cjs'], frontend],
];
const databaseTests = fs.readdirSync(path.join(root, 'supabase/tests'))
  .filter(f => f.endsWith('.cjs')).map(f => path.join(root, 'supabase/tests', f));
checks.splice(4, 0, ['database', process.execPath, ['--test', ...databaseTests], root]);
const results = [];
for (const [name, command, args, cwd] of checks) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, PGLITE_MODULE: pglite }, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, `${name}.log`), `${result.stdout || ''}${result.stderr || ''}${result.error ? String(result.error) : ''}`);
  const passed = result.status === 0;
  results.push({ name, passed, exitCode: result.status });
  console.log(`${passed ? 'OK' : 'BLOQUÉ'} — ${name}`);
}
const passed = results.every(r => r.passed);
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({checkedAt:new Date().toISOString(), passed, scope:'Local uniquement ; aucun déploiement ou envoi Apple.', results}, null, 2) + '\n');
console.log(`Résultats détaillés : ${output}`);
process.exitCode = passed ? 0 : 1;
