const fs = require('node:fs');
const path = require('node:path');

// Offline checks only. Passing these is not a substitute for device review,
// App Store Connect declarations or the production payment guard.
function inspect(root = path.resolve(__dirname, '../..')) {
  const issues = [];
  const check = (condition, message) => { if (!condition) issues.push(message); };
  const frontend = path.join(root, 'frontend');
  const app = JSON.parse(fs.readFileSync(path.join(frontend, 'app.json'), 'utf8')).expo;
  const eas = JSON.parse(fs.readFileSync(path.join(frontend, 'eas.json'), 'utf8'));
  check(app.ios.bundleIdentifier === 'com.altio.app', 'Identifiant iOS inattendu.');
  check(eas.build.production.environment === 'production', 'Environnement EAS production non explicite.');
  check(eas.build.production.autoIncrement === true, 'Incrément du numéro de build non automatique.');
  const plugin = name => app.plugins.find(p => Array.isArray(p) && p[0] === name)?.[1];
  check(plugin('expo-image-picker')?.microphonePermission === false, 'Permission microphone inutile.');
  check(plugin('expo-location')?.locationAlwaysPermission === false && plugin('expo-location')?.locationAlwaysAndWhenInUsePermission === false, 'Permissions de localisation permanente inutiles.');
  check(plugin('expo-secure-store')?.faceIDPermission === false, 'Permission Face ID inutilisée.');
  const icon = fs.readFileSync(path.join(frontend, app.icon));
  check(icon.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && icon.readUInt32BE(16) === 1024 && icon.readUInt32BE(20) === 1024, 'Icône PNG 1024 × 1024 requise.');
  const metadata = path.join(root, 'marketing/app-store/fr-FR');
  for (const [name, limit] of Object.entries({'name.txt':30,'subtitle.txt':30,'description.txt':4000,'promotional-text.txt':170,'keywords.txt':100,'release-notes.txt':4000})) {
    const value = fs.readFileSync(path.join(metadata, name), 'utf8').trim();
    check(value.length > 0 && [...value].length <= limit, `${name} vide ou au-delà de ${limit} caractères.`);
  }
  const readiness = JSON.parse(fs.readFileSync(path.join(frontend, 'production-readiness.json'), 'utf8'));
  check(Array.isArray(readiness.blockingIssues), 'Registre de préparation invalide.');
  for (const issue of readiness.blockingIssues || []) issues.push(`${issue.id}: ${issue.reason}`);
  const legal = fs.readFileSync(path.join(frontend, 'app/legal.tsx'), 'utf8');
  check(!/À COMPLÉTER AVANT PUBLICATION|À VÉRIFIER AVANT PUBLICATION/.test(legal), 'Les textes juridiques contiennent encore des mentions de préparation.');
  const notes = fs.readFileSync(path.join(metadata, 'review-notes.txt'), 'utf8');
  check(!/DRAFT|not yet complete/.test(notes), 'Comptes et instructions App Review encore au stade brouillon.');
  return issues;
}

if (require.main === module) {
  const issues = inspect();
  if (issues.length) {
    console.error('SOUMISSION APP STORE BLOQUÉE');
    issues.forEach(issue => console.error(`- ${issue}`));
    process.exitCode = 1;
  } else console.log('Contrôles locaux App Store réussis. Recette et déclarations Apple à vérifier séparément.');
}
module.exports = { inspect };
