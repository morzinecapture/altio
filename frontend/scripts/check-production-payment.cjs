const fs = require('node:fs');
const path = require('node:path');
const production = process.env.EAS_BUILD_PROFILE === 'production' || process.env.EXPO_PUBLIC_APP_ENV === 'production' || process.argv.includes('--production');
if (!production && process.env.EAS_BUILD_PROFILE === 'testflight') {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  if (process.env.EXPO_PUBLIC_APP_ENV !== 'test' || !key.startsWith('pk_test_')) {
    console.error('TestFlight de test bloqué : environnement test et clé publique Stripe de test explicite requis.');
    process.exit(1);
  }
  console.log('TestFlight de test : encaissements simulés. Non validé pour publication publique.');
}
if (production) {
  const envPath = path.join(__dirname, '../.env.production');
  const file = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const match = file.match(/^EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY\s*=\s*["']?([^\s"']+)/m);
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || match?.[1] || '';
  if (!key.startsWith('pk_live_')) {
    console.error('Build App Store bloqué : configurez une clé publique Stripe LIVE dans l’environnement EAS production. Aucune clé ne sera affichée.');
    process.exit(1);
  }
  const readiness = JSON.parse(fs.readFileSync(path.join(__dirname, '../production-readiness.json'), 'utf8'));
  if (!Array.isArray(readiness.blockingIssues)) throw new Error('Registre de préparation à la production invalide');
  if (readiness.blockingIssues.length) {
    console.error('Production bloquée : les points suivants ne sont pas validés. Ne retirer un point qu’après correction et vérification documentée.');
    for (const issue of readiness.blockingIssues) console.error(`- ${issue.id}: ${issue.reason}`);
    process.exit(1);
  }
  const appStoreIssues = require('./check-app-store.cjs').inspect();
  if (appStoreIssues.length) {
    console.error('Build App Store bloqué par les contrôles de soumission :');
    for (const issue of appStoreIssues) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.log('Contrôle local terminé. Ce contrôle ne constitue pas une certification juridique ni une validation du serveur déployé.');
}
