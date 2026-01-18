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
          /* M3 Material Design 3 - Global Styles for Mobile WebView */
          
          /* Base Typography - Minimum 14px to prevent iOS auto-zoom */
          body {
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            overflow-x: hidden; /* Prevent horizontal scroll */
          }
          
          /* Mobile-first: 16px horizontal padding globally */
          body > * {
            box-sizing: border-box;
          }
          
          /* Responsive container for large screens */
          @media (min-width: 1024px) {
            body {
              max-width: ${responsive.getMaxContentWidth()}px;
              margin: 0 auto;
              font-size: 16px;
            }
          }
          
          /* Input fields: 16px minimum to prevent iOS auto-zoom */
          input, textarea, select {
            font-size: 16px !important;
          }
          
          /* Disable text selection on buttons (WebView optimization) */
          button, [role="button"], .touchable, [data-touchable="true"] {
            user-select: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            cursor: pointer;
          }
          
          /* Remove hover states for touch devices (WebView optimization) */
          @media (hover: none) {
            button:hover, [role="button"]:hover, .touchable:hover {
              opacity: 1 !important;
              transform: none !important;
            }
          }
          
          /* Ensure minimum touch target: 44x44px */
          button, [role="button"], .touchable {
            min-height: 44px;
            min-width: 44px;
          }
          
          /* M3 Elevated Cards shadow */
          .m3-card, [class*="card"] {
            border-radius: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          }
          
          /* M3 Typography hierarchy */
          h1, h2, h3, h4, h5, h6 {
            font-weight: 600; /* Semi-bold for headings */
          }
          
          /* Prevent horizontal scroll globally */
          * {
            max-width: 100%;
          }
          
          /* تحسين الـ Headers - M3 style */
          [style*="borderBottomWidth"],
          [style*="border-bottom"] {
            padding-top: ${responsive.getResponsiveHeaderPadding()}px !important;
            padding-bottom: ${responsive.getResponsiveHeaderPadding()}px !important;
          }
          
          /* M3 Surface background */
          [style*="backgroundColor: rgb(255, 255, 255)"],
          [style*="backgroundColor: #fff"] {
            background-color: #FFFBFE !important; /* M3 Surface */
          }
          
          /* M3 Outline color for borders */
          [style*="borderBottomWidth"][style*="backgroundColor"],
          [style*="border-bottom"][style*="backgroundColor"] {
            border-bottom-color: #CAC4D0 !important; /* M3 Outline Variant */
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
