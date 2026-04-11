export const compressImage = async (uri: string, maxWidth = 1200): Promise<string> => {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    // Fallback : module natif non disponible (Expo Go), retourner l'image originale
    console.warn('[compressImage] expo-image-manipulator non disponible, upload sans compression');
    return uri;
  }
};
