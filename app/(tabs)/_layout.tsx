import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useEffect, useMemo } from 'react';
import responsive, { createShadowStyle } from '@/utils/responsive';
import FloatingNotification from '@/components/FloatingNotification';
import { useFloatingNotifications } from '@/hooks/useFloatingNotifications';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { UserRole } from '@/lib/supabase';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  
  // دالة لإخفاء التبويبات بناءً على الدور - مع useMemo لضمان التحديث عند تغيير الدور
  const shouldHideTab = useMemo(() => {
    return (allowedRoles: UserRole[]) => {
      // إذا لم يكن هناك user أو role، نخفي التبويب
      if (!user || !user.role) {
        return true;
      }
      // إخفاء التبويب إذا كان الدور غير مسموح
      return !allowedRoles.includes(user.role);
    };
  }, [user?.role]); // يعتمد على user.role فقط
  
  // إشعارات عائمة عامة لجميع المستخدمين
  const generalFloatingNotifications = useFloatingNotifications();

  // إشعارات الطلبات (إنشاء طلب جديد / تغيير حالة الطلب) - Web فقط
  const orderNotifications = useOrderNotifications();

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
        
        /* إخفاء الحاويات الفارغة - استخدام :has() فقط إذا كان مدعوماً */
        @supports selector(:has(*)) {
          [role="tablist"] > div:empty,
          [role="tablist"] > div:has(button[style*="display: none"]),
          [role="tablist"] > div:has(button[aria-hidden="true"]),
          [role="tablist"] > div:has([role="tab"][style*="display: none"]),
          [role="tablist"] > div:has([role="tab"][aria-hidden="true"]) {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            flex: 0 0 0 !important;
          }
        }
        
        /* إخفاء التبويبات التي تحتوي على نص admin أو setting باستخدام JavaScript */
        [role="tablist"] [role="tab"],
        [role="tablist"] button {
          position: relative;
        }
        
        /* التبويبات المرئية - توزيع متساوي */
        [role="tablist"] {
          display: flex !important;
          justify-content: space-around !important;
          align-items: center !important;
          width: 100% !important;
        }
        
        /* التبويبات المرئية - مسافات متساوية */
        [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]),
        [role="tablist"] a[role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]) {
          flex: 1 1 0% !important;
          min-width: 0 !important;
          max-width: none !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 4px ${tabPadding} !important;
          margin: 0 2px !important;
          box-sizing: border-box !important;
        }
        
        /* ضمان التمركز الكامل للحاويات */
        [role="tablist"] > div {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          flex: 1 1 0% !important;
          min-width: 0 !important;
        }
        
        /* إخفاء الحاويات الفارغة */
        [role="tablist"] > div:empty {
          display: none !important;
        }
        
        /* للشاشات الكبيرة - تحسين المسافات */
        @media (min-width: 1024px) {
          [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]),
          [role="tablist"] a[role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]) {
            padding: 6px ${tabPadding} !important;
            margin: 0 4px !important;
          }
        }
        
        /* للشاشات الصغيرة - تقليل المسافات */
        @media (max-width: 360px) {
          [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]),
          [role="tablist"] a[role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]) {
            padding: 2px 4px !important;
            margin: 0 1px !important;
          }
          
          /* تقليل حجم النص والأيقونات في الشاشات الصغيرة */
          [role="tablist"] [role="tab"] .css-text-146c3p1,
          [role="tablist"] a[role="tab"] .css-text-146c3p1 {
            font-size: 10px !important;
          }
        }
        
        /* للشاشات المتوسطة */
        @media (min-width: 361px) and (max-width: 768px) {
          [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]),
          [role="tablist"] a[role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]) {
            padding: 4px 6px !important;
            margin: 0 2px !important;
          }
        }
      `;
      document.head.appendChild(style);
      
      // إخفاء التبويبات غير المرغوبة (لكن نسمح بظهور admin/settings للمستخدمين الذين لديهم دور admin)
      const hideUnwantedTabs = () => {
        const tabList = document.querySelector('[role="tablist"]');
        if (!tabList) return;
        
        // التحقق من دور المستخدم
        const userRole = user?.role || '';
        const isAdmin = userRole === 'admin';
        
        // البحث عن جميع التبويبات
        const tabs = tabList.querySelectorAll('[role="tab"], button');
        tabs.forEach((tab) => {
          const text = (tab.textContent || '').toLowerCase();
          const html = (tab.innerHTML || '').toLowerCase();
          const href = (tab as HTMLElement).getAttribute('href') || '';
          
          // السماح بظهور admin/settings للمستخدمين الذين لديهم دور admin
          const isAdminSettingsTab = href.includes('admin/settings') || href.includes('admin%2Fsettings');
          if (isAdminSettingsTab && isAdmin) {
            // السماح بظهور التبويب
            return;
          }
          
          // إخفاء التبويبات التي تحتوي على admin أو setting أو idmin (لكن نستثني admin/settings للمستخدمين الذين لديهم دور admin)
          if ((text.includes('admin') && !isAdminSettingsTab) || 
              (text.includes('setting') && !isAdminSettingsTab && !href.includes('admin/settings')) ||
              text.includes('idmin') ||
              (html.includes('admin') && !isAdminSettingsTab) ||
              (html.includes('setting') && !isAdminSettingsTab && !href.includes('admin/settings')) ||
              html.includes('idmin')) {
            const element = tab as HTMLElement;
            element.style.display = 'none';
            element.style.width = '0';
            element.style.height = '0';
            element.style.margin = '0';
            element.style.padding = '0';
            element.style.opacity = '0';
            element.style.visibility = 'hidden';
            element.style.pointerEvents = 'none';
            element.setAttribute('aria-hidden', 'true');
            
            // إخفاء الحاوية الأب أيضاً
            const parent = element.parentElement;
            if (parent && parent !== tabList) {
              parent.style.display = 'none';
              parent.style.width = '0';
              parent.style.height = '0';
              parent.style.margin = '0';
              parent.style.padding = '0';
            }
          }
        });
        
        // البحث عن الحاويات التي تحتوي على تبويبات مخفية
        const containers = tabList.querySelectorAll('div');
        containers.forEach((container) => {
          const text = (container.textContent || '').toLowerCase();
          const href = (container.querySelector('[role="tab"], button, a') as HTMLElement)?.getAttribute('href') || '';
          const isAdminSettingsContainer = href.includes('admin/settings') || href.includes('admin%2Fsettings');
          
          if ((text.includes('admin') && !isAdminSettingsContainer) || 
              (text.includes('setting') && !isAdminSettingsContainer && !href.includes('admin/settings')) || 
              text.includes('idmin')) {
            const tabsInContainer = container.querySelectorAll('[role="tab"], button');
            if (tabsInContainer.length > 0) {
              const hasHiddenTab = Array.from(tabsInContainer).some(tab => {
                const tabText = (tab.textContent || '').toLowerCase();
                const tabHref = (tab as HTMLElement).getAttribute('href') || '';
                const isAdminSettings = tabHref.includes('admin/settings') || tabHref.includes('admin%2Fsettings');
                return (tabText.includes('admin') && !isAdminSettings) || 
                       (tabText.includes('setting') && !isAdminSettings && !tabHref.includes('admin/settings')) || 
                       tabText.includes('idmin');
              });
              if (hasHiddenTab) {
                (container as HTMLElement).style.display = 'none';
              }
            }
          }
        });
      };
      
      // تشغيل فوراً وبعد تحميل الصفحة
      hideUnwantedTabs();
      const intervals = [100, 300, 500, 1000, 2000];
      intervals.forEach(delay => {
        setTimeout(hideUnwantedTabs, delay);
      });
      
      // مراقبة التغييرات في DOM
      const observer = new MutationObserver(() => {
        hideUnwantedTabs();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      
      return () => {
        const styleToRemove = document.getElementById(styleId);
        if (styleToRemove) styleToRemove.remove();
        observer.disconnect();
      };
    }
  }, [tabBarHeight, tabBarGap, tabBarPadding, tabPadding, tabMargin, maxContentWidth, user?.role]);
  
  // إعادة تقييم التبويبات عند تغيير user.role
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && user?.role) {
      // إجبار إعادة render للتبويبات عند تغيير الدور
      // هذا يضمن أن التبويبات الصحيحة تظهر فوراً
      const tabList = document.querySelector('[role="tablist"]');
      if (tabList) {
        // إعادة تقييم التبويبات
        const event = new Event('roleChanged');
        window.dispatchEvent(event);
      }
    }
  }, [user?.role]);

  if (loading) {
    return null;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  
  // التأكد من أن user.role موجود قبل عرض التبويبات
  // هذا يمنع عرض التبويبات الخاطئة أثناء تحميل الدور
  if (!user.role) {
    return null; // انتظار تحميل الدور
  }

  return (
    <>
      {/* إشعارات عائمة عامة لجميع المستخدمين */}
      <FloatingNotification
        visible={generalFloatingNotifications.visible}
        notification={generalFloatingNotifications.notification}
        onDismiss={generalFloatingNotifications.dismiss}
      />
      
      {/* إشعارات الطلبات (إنشاء / تغيير حالة) - Web فقط */}
      <FloatingNotification
        visible={orderNotifications.visible}
        notification={orderNotifications.notification}
        onDismiss={orderNotifications.dismiss}
      />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: Platform.OS === 'web' ? {
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          height: tabBarHeight,
          paddingBottom: responsive.isTablet() ? 10 : responsive.isSmallScreen() ? 6 : 8,
          paddingTop: responsive.isTablet() ? 10 : responsive.isSmallScreen() ? 6 : 8,
          paddingLeft: responsive.isTablet() ? 24 : 20,
          paddingRight: responsive.isTablet() ? 24 : 20,
          justifyContent: 'center',
          alignItems: 'center',
          gap: responsive.isTablet() ? 24 : 20,
          borderRadius: responsive.isTablet() ? 28 : 24,
          display: 'flex',
          position: 'fixed',
          bottom: responsive.isTablet() ? 24 : 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: responsive.isLargeScreen() ? responsive.getMaxContentWidth() : 'calc(100% - 32px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 16px rgba(0, 0, 0, 0.04)',
          borderWidth: 0,
        } as any : {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          height: tabBarHeight,
          paddingBottom: responsive.isTablet() ? 10 : responsive.isSmallScreen() ? 6 : 8,
          paddingTop: responsive.isTablet() ? 10 : responsive.isSmallScreen() ? 6 : 8,
          paddingLeft: responsive.isTablet() ? 24 : 20,
          paddingRight: responsive.isTablet() ? 24 : 20,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: responsive.isTablet() ? 28 : 24,
          marginBottom: responsive.isTablet() ? 24 : 20,
          marginHorizontal: 16,
          ...createShadowStyle({
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 12,
          }),
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
          tabBarButton: shouldHideTab(['customer']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/my-orders"
        options={{
          title: 'طلباتي',
          tabBarLabel: 'طلباتي',
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['customer']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/history"
        options={{
          title: 'السجل',
          tabBarLabel: 'السجل',
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['customer']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/profile"
        options={{
          title: t('customer.profile'),
          tabBarLabel: t('customer.profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['customer']) ? () => null : undefined,
        }}
      />

      {/* Driver Tabs */}
      <Tabs.Screen
        name="driver/dashboard"
        options={{
          title: 'الرئيسية',
          tabBarLabel: 'الرئيسية',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['driver']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/trips"
        options={{
          title: 'الرحلات',
          tabBarLabel: 'الرحلات',
          tabBarIcon: ({ color }) => <Ionicons name="navigate" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['driver']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/wallet"
        options={{
          title: 'المحفظة',
          tabBarLabel: 'المحفظة',
          tabBarIcon: ({ color }) => <Ionicons name="wallet" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['driver']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/history"
        options={{
          title: 'السجل',
          tabBarLabel: 'السجل',
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['driver']) ? () => null : undefined,
        }}
      />
      {/* driver/my-orders مخفي من شريط التنقل - الطلبات موجودة في trips و history */}
      <Tabs.Screen
        name="driver/my-orders"
        options={{
          tabBarButton: () => null, // إخفاء من شريط التنقل
        }}
      />

      {/* Vendor Tabs */}
      <Tabs.Screen
        name="vendor/store"
        options={{
          title: t('vendor.store'),
          tabBarLabel: t('vendor.store'),
          tabBarIcon: ({ color }) => <Ionicons name="storefront" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['vendor']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="vendor/history"
        options={{
          title: 'السجل',
          tabBarLabel: 'السجل',
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['vendor']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="vendor/profile"
        options={{
          title: t('vendor.profile'),
          tabBarLabel: t('vendor.profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['vendor']) ? () => null : undefined,
        }}
      />

      {/* Admin Tabs */}
      <Tabs.Screen
        name="admin/dashboard"
        options={{
          title: t('admin.dashboard'),
          tabBarLabel: t('admin.dashboard'),
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['admin']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/drivers"
        options={{
          title: t('admin.drivers'),
          tabBarLabel: t('admin.drivers'),
          tabBarIcon: ({ color }) => <Ionicons name="people" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['admin']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/accounting"
        options={{
          title: t('admin.accounting'),
          tabBarLabel: t('admin.accounting'),
          tabBarIcon: ({ color }) => <Ionicons name="cash" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['admin']) ? () => null : undefined,
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
          tabBarButton: shouldHideTab(['admin']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/my-orders"
        options={{
          title: 'طلباتي',
          tabBarLabel: 'طلباتي',
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['admin']) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/search-settings"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />
      <Tabs.Screen
        name="admin/settings"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />
      <Tabs.Screen
        name="admin/places-sync-settings"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />
      <Tabs.Screen
        name="admin/settlement-requests"
        options={{
          tabBarButton: () => null, // إخفاء من الـ navbar
        }}
      />
      <Tabs.Screen
        name="admin/users"
        options={{
          title: 'المستخدمين',
          tabBarLabel: 'المستخدمين',
          tabBarIcon: ({ color }) => <Ionicons name="people" size={tabBarIconSize} color={color} />,
          tabBarButton: shouldHideTab(['admin']) ? () => null : undefined,
        }}
      />
    </Tabs>
    </>
  );
}
