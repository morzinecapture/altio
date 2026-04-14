import { Alert, NativeModules } from 'react-native';
import { router } from 'expo-router';

/** Vérifie si expo-print est dispo (true en EAS Build, false en Expo Go). */
export const isPrintAvailable = (): boolean => {
  return !!NativeModules.ExpoPrint;
};

/** Ouvre un document HTML : en PDF via expo-print (production) ou en WebView (dev). */
export const viewOrShareDocument = async (params: {
  url: string;
  title: string;
}): Promise<void> => {
  const { url, title } = params;

  if (!url) {
    Alert.alert('Information', 'Le document n\'est pas encore disponible.');
    return;
  }

  // Production (EAS Build) : conversion HTML → PDF + partage natif
  if (isPrintAvailable()) {
    try {
      const Print = require('expo-print');
      const Sharing = require('expo-sharing');
      const FileSystem = require('expo-file-system');

      const response = await fetch(url);
      if (!response.ok) throw new Error('Impossible de charger le document.');
      const html = await response.text();

      const { uri: tempUri } = await Print.printToFileAsync({ html, base64: false });

      // iOS "Enregistrer dans Fichiers" n'apparaît que si le PDF vit dans
      // documentDirectory avec une extension + nom lisible. Le fichier
      // retourné par printToFileAsync est dans le cache avec un nom
      // aléatoire, d'où l'absence de l'option dans la Share Sheet.
      const safeName = title.replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 60) || 'document';
      const finalUri = `${FileSystem.documentDirectory}${safeName}.pdf`;
      try { await FileSystem.deleteAsync(finalUri, { idempotent: true }); } catch {}
      await FileSystem.copyAsync({ from: tempUri, to: finalUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(finalUri, {
          mimeType: 'application/pdf',
          dialogTitle: title,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Succès', 'PDF généré avec succès.');
      }
      return;
    } catch (e) {
      console.warn('[pdf-helper] expo-print failed, fallback WebView:', e);
    }
  }

  // Dev (Expo Go) : ouvrir dans le viewer WebView existant
  router.push({ pathname: '/invoice-viewer', params: { url, title } });
};
