import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/contexts/AuthContext';
import '@/i18n';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import responsive from '@/utils/responsive';

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
  // إضافة CSS عام للتصميم المتجاوب على الويب
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'responsive-global-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          /* Responsive container for large screens */
          @media (min-width: 1024px) {
            body {
              max-width: ${responsive.getMaxContentWidth()}px;
              margin: 0 auto;
            }
          }
          
          /* Responsive text */
          @media (max-width: 480px) {
            body {
              font-size: 14px;
            }
          }
          
          @media (min-width: 1024px) {
            body {
              font-size: 16px;
            }
          }
          
          /* تحسين الـ Headers - تقليل الارتفاع وجعله شفاف جزئيًا */
          /* تطبيق على جميع الـ headers التي تحتوي على borderBottom */
          [style*="borderBottomWidth"],
          [style*="border-bottom"] {
            padding-top: ${responsive.getResponsiveHeaderPadding()}px !important;
            padding-bottom: ${responsive.getResponsiveHeaderPadding()}px !important;
          }
          
          /* تطبيق gradient overlay على الـ headers البيضاء */
          [style*="backgroundColor: rgb(255, 255, 255)"],
          [style*="backgroundColor: #fff"] {
            background: linear-gradient(to bottom, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
          }
          
          /* تطبيق خاص على الـ headers التي تحتوي على borderBottom */
          [style*="borderBottomWidth"][style*="backgroundColor: rgb(255, 255, 255)"],
          [style*="borderBottomWidth"][style*="backgroundColor: #fff"],
          [style*="border-bottom"][style*="backgroundColor: rgb(255, 255, 255)"],
          [style*="border-bottom"][style*="backgroundColor: #fff"] {
            border-bottom-color: rgba(0, 0, 0, 0.08) !important;
            border-bottom-width: 1px !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <DeepLinkHandler />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
        </Stack>
      </AuthProvider>
    </I18nextProvider>
  );
}
