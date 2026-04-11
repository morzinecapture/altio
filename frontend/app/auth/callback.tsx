import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
const { useURL } = Linking;
import { supabase } from '../../src/lib/supabase';
import { COLORS } from '../../src/theme';

export default function AuthCallback() {
  const router = useRouter();
  const url = useURL(); // réactif : met à jour quand le deep link arrive

  useEffect(() => {
    if (url) {
      handleCallback(url);
    }
  }, [url]);

  const handleCallback = async (rawUrl: string) => {
    try {
      const parsed = Linking.parse(rawUrl);
      const code = parsed.queryParams?.code as string | undefined;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return;
      }

      const hash = rawUrl.includes('#') ? rawUrl.split('#')[1] : '';
      const hashParams = new URLSearchParams(hash);
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
      }
    } catch (_) {
      router.replace('/');
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.brandPrimary} />
    </View>
  );
}
