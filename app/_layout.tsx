import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/contexts/AuthContext';
import '@/i18n';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { I18nManager, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

// تفعيل RTL
if (Platform.OS !== 'web') {
  I18nManager.forceRTL(true);
  I18nManager.allowRTL(true);
}

function DeepLinkHandler() {
  useEffect(() => {
    // معالجة deep links لـ OAuth
    const handleDeepLink = async (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    };

    // الاستماع للروابط الواردة
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // التحقق من الروابط عند فتح التطبيق
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <DeepLinkHandler />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
          <Stack.Screen name="customer/outside-order" />
        </Stack>
      </AuthProvider>
    </I18nextProvider>
  );
}
