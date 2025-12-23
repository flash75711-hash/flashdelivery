import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import responsive from '@/utils/responsive';
import FloatingOrderNotification from '@/components/FloatingOrderNotification';
import { useFloatingOrderNotifications } from '@/hooks/useFloatingOrderNotifications';
import FloatingNotification from '@/components/FloatingNotification';
import { useFloatingNotifications } from '@/hooks/useFloatingNotifications';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  
  // إشعارات الطلبات العائمة للسائقين
  const floatingNotifications = useFloatingOrderNotifications();
  
  // إشعارات عائمة عامة لجميع المستخدمين
  const generalFloatingNotifications = useFloatingNotifications();

  // Responsive tab bar height
  const tabBarHeight = responsive.isTablet() ? 75 : 70;
  const tabBarIconSize = responsive.isTablet() ? 28 : 24;
  const tabBarFontSize = responsive.isTablet() ? 12 : responsive.isSmallScreen() ? 10 : 11;
  
  // Calculate responsive values for CSS - مسافات متساوية للتمركز
  const tabBarGap = responsive.isTablet() ? '24px' : '20px';
  const tabBarPadding = responsive.isTablet() ? '20px' : '16px';
  const tabPadding = responsive.isTablet() ? '12px' : '10px';
  const tabMargin = responsive.isTablet() ? '8px' : '6px';
  const maxContentWidth = responsive.getMaxContentWidth();

  // CSS بسيط للويب فقط
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'expo-tabs-bottom-navbar-style';
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) existingStyle.remove();
      
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        [role="tablist"] {
          position: fixed !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          background: #fff !important;
          border-top: 1px solid #e0e0e0 !important;
          height: ${tabBarHeight}px !important;
          z-index: 1000 !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          align-content: center !important;
          gap: ${tabBarGap} !important;
          padding: 0 ${tabBarPadding} !important;
          box-sizing: border-box !important;
        }
        
        /* إخفاء التبويبات المخفية - تحسين */
        [role="tablist"] [role="tab"][style*="display: none"],
        [role="tablist"] [role="tab"][aria-hidden="true"],
        [role="tablist"] button[style*="display: none"],
        [role="tablist"] button[aria-hidden="true"] {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          flex: 0 0 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        
        /* إخفاء الحاويات الفارغة */
        [role="tablist"] > div:empty,
        [role="tablist"] > div:has(button[style*="display: none"]),
        [role="tablist"] > div:has(button[aria-hidden="true"]) {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          flex: 0 0 0 !important;
        }
        
        /* التبويبات المرئية - مسافات متساوية */
        [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]) {
          min-width: 70px !important;
          max-width: 90px !important;
          flex: 0 0 auto !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 4px ${tabPadding} !important;
          margin: 0 ${tabMargin} !important;
          box-sizing: border-box !important;
        }
        
        /* ضمان التمركز الكامل */
        [role="tablist"] > div {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
        }
        
        /* للشاشات الكبيرة - التمركز في المنتصف */
        @media (min-width: 1024px) {
          [role="tablist"] {
            max-width: ${maxContentWidth}px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            margin: 0 auto !important;
          }
        }
        
        /* للشاشات الصغيرة - تقليل المسافات */
        @media (max-width: 360px) {
          [role="tablist"] {
            gap: 12px !important;
            padding: 0 12px !important;
          }
          [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]) {
            min-width: 60px !important;
            max-width: 75px !important;
            padding: 4px 6px !important;
            margin: 0 4px !important;
          }
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        const styleToRemove = document.getElementById(styleId);
        if (styleToRemove) styleToRemove.remove();
      };
    }
  }, [tabBarHeight, tabBarGap, tabBarPadding, tabPadding, tabMargin, maxContentWidth]);

  if (loading) {
    return null;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
      {/* إشعارات الطلبات العائمة للسائقين */}
      {user?.role === 'driver' && (
        <FloatingOrderNotification
          visible={floatingNotifications.visible}
          notification={floatingNotifications.notification}
          onAccept={floatingNotifications.handleAccept}
          onReject={floatingNotifications.handleReject}
          onDismiss={floatingNotifications.dismiss}
        />
      )}
      
      {/* إشعارات عائمة عامة لجميع المستخدمين */}
      <FloatingNotification
        visible={generalFloatingNotifications.visible}
        notification={generalFloatingNotifications.notification}
        onDismiss={generalFloatingNotifications.dismiss}
      />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: Platform.OS === 'web' ? {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: tabBarHeight,
          paddingBottom: responsive.isTablet() ? 8 : responsive.isSmallScreen() ? 4 : 6,
          paddingTop: responsive.isTablet() ? 8 : responsive.isSmallScreen() ? 4 : 6,
          paddingLeft: responsive.isTablet() ? 20 : 16,
          paddingRight: responsive.isTablet() ? 20 : 16,
          width: '100%',
          maxWidth: responsive.isLargeScreen() ? responsive.getMaxContentWidth() : '100%',
          marginLeft: responsive.isLargeScreen() ? 'auto' : 0,
          marginRight: responsive.isLargeScreen() ? 'auto' : 0,
          justifyContent: 'center',
          alignItems: 'center',
          gap: responsive.isTablet() ? 24 : 20,
        } as any : {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: tabBarHeight,
          paddingBottom: responsive.isTablet() ? 8 : responsive.isSmallScreen() ? 4 : 6,
          paddingTop: responsive.isTablet() ? 8 : responsive.isSmallScreen() ? 4 : 6,
          paddingLeft: responsive.isTablet() ? 20 : 16,
          paddingRight: responsive.isTablet() ? 20 : 16,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: tabBarFontSize,
          fontWeight: '600',
          marginTop: 2,
          textAlign: 'center',
          alignSelf: 'center',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarIconStyle: {
          marginTop: 2,
          alignSelf: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarShowLabel: true,
      }}
    >
      {/* Index Route - مخفي من الـ navbar */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />

      {/* Customer Tabs */}
      <Tabs.Screen
        name="customer/home"
        options={{
          title: t('customer.home'),
          tabBarLabel: t('customer.home'),
          tabBarIcon: ({ color }) => <Ionicons name="home" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'customer' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="customer/my-orders"
        options={{
          title: 'طلباتي',
          tabBarLabel: 'طلباتي',
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'customer' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="customer/profile"
        options={{
          title: t('customer.profile'),
          tabBarLabel: t('customer.profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'customer' ? undefined : () => null,
        }}
      />

      {/* Driver Tabs */}
      <Tabs.Screen
        name="driver/dashboard"
        options={{
          title: t('driver.dashboard'),
          tabBarLabel: t('driver.dashboard'),
          tabBarIcon: ({ color }) => <Ionicons name="home" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'driver' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="driver/trips"
        options={{
          title: t('driver.newTrips'),
          tabBarLabel: t('driver.newTrips'),
          tabBarIcon: ({ color }) => <Ionicons name="navigate" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'driver' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="driver/wallet"
        options={{
          title: t('driver.wallet'),
          tabBarLabel: t('driver.wallet'),
          tabBarIcon: ({ color }) => <Ionicons name="wallet" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'driver' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="driver/history"
        options={{
          title: t('driver.tripHistory'),
          tabBarLabel: t('driver.tripHistory'),
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'driver' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="driver/my-orders"
        options={{
          title: 'طلباتي',
          tabBarLabel: 'طلباتي',
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'driver' ? undefined : () => null,
        }}
      />

      {/* Vendor Tabs */}
      <Tabs.Screen
        name="vendor/store"
        options={{
          title: t('vendor.store'),
          tabBarLabel: t('vendor.store'),
          tabBarIcon: ({ color }) => <Ionicons name="storefront" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'vendor' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="vendor/profile"
        options={{
          title: t('vendor.profile'),
          tabBarLabel: t('vendor.profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'vendor' ? undefined : () => null,
        }}
      />

      {/* Admin Tabs */}
      <Tabs.Screen
        name="admin/dashboard"
        options={{
          title: t('admin.dashboard'),
          tabBarLabel: t('admin.dashboard'),
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'admin' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="admin/drivers"
        options={{
          title: t('admin.drivers'),
          tabBarLabel: t('admin.drivers'),
          tabBarIcon: ({ color }) => <Ionicons name="people" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'admin' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="admin/accounting"
        options={{
          title: t('admin.accounting'),
          tabBarLabel: t('admin.accounting'),
          tabBarIcon: ({ color }) => <Ionicons name="cash" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'admin' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="admin/orders"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />
      <Tabs.Screen
        name="admin/places"
        options={{
          title: t('admin.places'),
          tabBarLabel: t('admin.places'),
          tabBarIcon: ({ color }) => <Ionicons name="location" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'admin' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="admin/my-orders"
        options={{
          title: 'طلباتي',
          tabBarLabel: 'طلباتي',
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: user?.role === 'admin' ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="admin/search-settings"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />
    </Tabs>
    </>
  );
}
