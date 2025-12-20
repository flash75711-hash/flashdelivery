import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import responsive from '@/utils/responsive';
import FloatingOrderNotification from '@/components/FloatingOrderNotification';
import { useFloatingOrderNotifications } from '@/hooks/useFloatingOrderNotifications';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  
  // إشعارات الطلبات العائمة للسائقين
  const floatingNotifications = useFloatingOrderNotifications();

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  // Responsive tab bar height
  const tabBarHeight = responsive.isTablet() ? 75 : 70;
  const tabBarIconSize = responsive.isTablet() ? 28 : 24;
  const tabBarFontSize = responsive.isTablet() ? 12 : responsive.isSmallScreen() ? 10 : 11;
  
  // Calculate responsive values for CSS
  const tabBarGap = responsive.isTablet() ? '32px' : '28px';
  const tabBarPadding = responsive.isTablet() ? '32px' : '28px';
  const tabPadding = responsive.isTablet() ? '16px' : '12px';
  const tabMargin = responsive.isTablet() ? '8px' : '4px';
  const maxContentWidth = responsive.getMaxContentWidth();

  // تبسيط: إضافة CSS بسيط للويب فقط
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'expo-tabs-bottom-navbar-style';
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
      
      // Function to hide filtered tabs and center visible ones
      const updateTabVisibility = () => {
        const tabList = document.querySelector('[role="tablist"]') as HTMLElement;
        if (!tabList) {
          // Retry if tablist not found yet
          setTimeout(updateTabVisibility, 200);
          return;
        }
        
        // Hide all empty divs (spacers) that don't contain tabs
        const allChildren = Array.from(tabList.children) as HTMLElement[];
        allChildren.forEach((child) => {
          const hasTab = child.querySelector('[role="tab"]');
          if (!hasTab) {
            // This is an empty spacer div, hide it
            child.style.display = 'none';
            child.style.width = '0';
            child.style.height = '0';
            child.style.flex = '0 0 0';
            child.style.margin = '0';
            child.style.padding = '0';
            child.setAttribute('data-hidden', 'true');
        }
        });
        
        const tabs = Array.from(tabList.querySelectorAll('[role="tab"]')) as HTMLElement[];
        const visibleTabs: HTMLElement[] = [];
        
        tabs.forEach((tab) => {
          // Check multiple ways the tab might be hidden
          const button = tab.querySelector('button') as HTMLElement;
          const tabStyle = window.getComputedStyle(tab);
          const buttonStyle = button ? window.getComputedStyle(button) : null;
          
          // Check if tab or button is hidden
          const isHidden = 
            tabStyle.display === 'none' ||
            tabStyle.visibility === 'hidden' ||
            tab.getAttribute('aria-hidden') === 'true' ||
            tab.style.display === 'none' ||
            tabStyle.width === '0px' ||
            tabStyle.opacity === '0' ||
            (buttonStyle && (
              buttonStyle.display === 'none' ||
              buttonStyle.visibility === 'hidden' ||
              button.getAttribute('aria-hidden') === 'true' ||
              button.style.display === 'none' ||
              buttonStyle.width === '0px'
            )) ||
            // Check if parent has display none
            (tab.parentElement && window.getComputedStyle(tab.parentElement).display === 'none');
          
          if (isHidden) {
            // Completely hide the tab
            tab.style.display = 'none';
            tab.style.width = '0';
            tab.style.height = '0';
            tab.style.padding = '0';
            tab.style.margin = '0';
            tab.style.flex = '0 0 0';
            tab.style.minWidth = '0';
            tab.style.maxWidth = '0';
            tab.style.overflow = 'hidden';
            tab.style.visibility = 'hidden';
            tab.style.opacity = '0';
            tab.setAttribute('data-hidden', 'true');
            
            // Hide all icons inside the hidden tab
            const icons = tab.querySelectorAll('svg, [class*="icon"], i, [dir="auto"]');
            icons.forEach((icon) => {
              (icon as HTMLElement).style.display = 'none';
              (icon as HTMLElement).style.visibility = 'hidden';
              (icon as HTMLElement).style.opacity = '0';
            });
            
            // Also hide the parent container if it exists
            const parent = tab.parentElement as HTMLElement;
            if (parent && parent !== tabList) {
              parent.style.display = 'none';
              parent.style.width = '0';
              parent.style.height = '0';
              parent.style.flex = '0 0 0';
              parent.style.margin = '0';
              parent.style.padding = '0';
              parent.style.opacity = '0';
              parent.setAttribute('data-hidden', 'true');
            }
          } else {
            // Show the tab
            tab.style.display = 'flex';
            tab.style.width = '';
            tab.style.height = '';
            tab.style.flex = '0 1 auto';
            tab.style.minWidth = '60px';
            tab.style.maxWidth = '';
            tab.style.overflow = 'visible';
            tab.style.visibility = 'visible';
            tab.style.opacity = '';
            tab.removeAttribute('data-hidden');
            
            // Show icons inside the visible tab
            const icons = tab.querySelectorAll('svg, [class*="icon"], i, [dir="auto"]');
            icons.forEach((icon) => {
              (icon as HTMLElement).style.display = '';
              (icon as HTMLElement).style.visibility = '';
              (icon as HTMLElement).style.opacity = '';
            });
            
            // Show the parent container if it exists
            const parent = tab.parentElement as HTMLElement;
            if (parent && parent !== tabList) {
              parent.style.display = 'flex';
              parent.style.width = '';
              parent.style.height = '';
              parent.style.flex = '0 1 auto';
              parent.style.opacity = '';
              parent.removeAttribute('data-hidden');
              }
              
            visibleTabs.push(tab);
          }
        });
        
        // Force reflow and ensure centering
        if (visibleTabs.length > 0) {
          tabList.style.display = 'flex';
          tabList.style.justifyContent = 'center';
          // Force browser to recalculate layout
          void tabList.offsetHeight;
          console.log(`[TabBar] Visible tabs: ${visibleTabs.length}, Hidden tabs: ${tabs.length - visibleTabs.length}, Empty divs: ${allChildren.filter(c => !c.querySelector('[role="tab"]')).length}`);
              }
      };
            
      // Run immediately and on mutations
      const runUpdate = () => {
        setTimeout(updateTabVisibility, 100);
        setTimeout(updateTabVisibility, 500);
        setTimeout(updateTabVisibility, 1000);
      };
      
      runUpdate();
      
      const observer = new MutationObserver(() => {
        setTimeout(updateTabVisibility, 50);
      });
      
      // Also observe for route changes to update icons
      const routeObserver = new MutationObserver(() => {
        setTimeout(() => {
          const tabList = document.querySelector('[role="tablist"]') as HTMLElement;
          if (tabList) {
            // Force update of all tabs to ensure correct icons
            const tabs = Array.from(tabList.querySelectorAll('[role="tab"]')) as HTMLElement[];
            tabs.forEach((tab) => {
              // Check if tab should be visible based on href
              const href = tab.getAttribute('href');
              if (href) {
                // Ensure only visible tabs show their icons
                const isVisible = !tab.hasAttribute('data-hidden') && 
                                window.getComputedStyle(tab).display !== 'none';
                if (!isVisible) {
                  const icons = tab.querySelectorAll('svg, [class*="icon"], i');
                  icons.forEach((icon) => {
                    (icon as HTMLElement).style.display = 'none';
                  });
            }
          }
        });
            updateTabVisibility();
          }
        }, 100);
      });
      
      // Observe document for tablist creation
      const observeDocument = () => {
        const tabList = document.querySelector('[role="tablist"]');
        if (tabList) {
          observer.observe(tabList, { 
            childList: true, 
            subtree: true, 
            attributes: true,
            attributeFilter: ['style', 'aria-hidden', 'aria-selected', 'href']
          });
          
          // Also observe the document for route changes
          routeObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-selected', 'href']
          });
          
          updateTabVisibility();
        } else {
          setTimeout(observeDocument, 100);
        }
      };
      
      observeDocument();
      
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
          max-width: 100vw !important;
          gap: ${tabBarGap} !important;
          padding-left: ${tabBarPadding} !important;
          padding-right: ${tabBarPadding} !important;
        }
        
        /* Hide empty spacer divs that don't contain tabs */
        [role="tablist"] > div[data-hidden="true"] {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          flex: 0 0 0 !important;
          overflow: hidden !important;
          visibility: hidden !important;
        }
        
        /* Ensure only visible tabs participate in flex layout */
        [role="tablist"] [role="tab"][data-hidden="true"],
        [role="tablist"] > div[data-hidden="true"] {
          order: 9999 !important;
        }
        
        /* Hide tabs that are set to null (filtered by role) - target all possible hidden states */
        [role="tablist"] [role="tab"][style*="display: none"],
        [role="tablist"] [role="tab"][aria-hidden="true"],
        [role="tablist"] [role="tab"][data-hidden="true"],
        [role="tablist"] button[style*="display: none"],
        [role="tablist"] button[aria-hidden="true"] {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          visibility: hidden !important;
          flex: 0 0 0 !important;
          opacity: 0 !important;
        }
        
        /* Ensure tab labels are visible and not truncated - only for visible tabs */
        [role="tablist"] [role="tab"]:not([style*="display: none"]):not([aria-hidden="true"]):not([data-hidden="true"]) {
          min-width: 60px !important;
          flex: 0 1 auto !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          align-content: center !important;
          justify-content: center !important;
          justify-items: center !important;
          padding: 4px ${tabPadding} !important;
          margin: 0 ${tabMargin} !important;
          overflow: visible !important;
          height: 100% !important;
        }
        
        /* Center icon container */
        [role="tablist"] [role="tab"] > div:first-child {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          align-content: center !important;
          width: 100% !important;
          overflow: visible !important;
          max-width: none !important;
          margin: 0 auto !important;
        }
        
        /* Center icon itself - only for visible tabs */
        [role="tablist"] [role="tab"]:not([data-hidden="true"]) svg,
        [role="tablist"] [role="tab"]:not([data-hidden="true"]) [class*="icon"],
        [role="tablist"] [role="tab"]:not([data-hidden="true"]) i {
          display: block !important;
          margin: 0 auto !important;
          align-self: center !important;
        }
        
        /* Hide icons in hidden tabs */
        [role="tablist"] [role="tab"][data-hidden="true"] svg,
        [role="tablist"] [role="tab"][data-hidden="true"] [class*="icon"],
        [role="tablist"] [role="tab"][data-hidden="true"] i,
        [role="tablist"] [role="tab"][data-hidden="true"] [dir="auto"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
        
        /* Fix text truncation in tab labels - target all possible text containers */
        [role="tablist"] [role="tab"] > div[dir="auto"],
        [role="tablist"] [role="tab"] div[dir="auto"],
        [role="tablist"] [role="tab"] span,
        [role="tablist"] [role="tab"] .r-maxWidth-dnmrzs,
        [role="tablist"] [role="tab"] .r-overflow-1udh08x,
        [role="tablist"] [role="tab"] .r-textOverflow-1udbk01,
        [role="tablist"] [role="tab"] .r-whiteSpace-3s2u2q {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          max-width: none !important;
          width: auto !important;
          min-width: 0 !important;
          text-align: center !important;
          line-height: 1.2 !important;
          display: block !important;
          margin: 0 auto !important;
        }
        
        /* Ensure text is fully visible */
        [role="tablist"] [role="tab"] {
          overflow: visible !important;
        }
        
        /* Make sure parent containers don't clip text */
        [role="tablist"] [role="tab"] > div {
          overflow: visible !important;
          max-width: none !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        /* Responsive for large screens */
        @media (min-width: 1024px) {
          [role="tablist"] {
            max-width: ${maxContentWidth}px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            margin: 0 auto !important;
          }
        }
        
        /* For very small screens, reduce padding */
        @media (max-width: 360px) {
          [role="tablist"] [role="tab"] {
            min-width: 50px !important;
            padding: 2px 4px !important;
          }
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        const styleToRemove = document.getElementById(styleId);
        if (styleToRemove) {
          styleToRemove.remove();
        }
        if (observer) {
          observer.disconnect();
        }
        if (routeObserver) {
          routeObserver.disconnect();
        }
      };
    }
  }, [tabBarHeight, tabBarGap, tabBarPadding, tabPadding, tabMargin, maxContentWidth, user]);

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
          paddingLeft: responsive.isTablet() ? 32 : 28,
          paddingRight: responsive.isTablet() ? 32 : 28,
          width: '100%',
          maxWidth: responsive.isLargeScreen() ? responsive.getMaxContentWidth() : '100%',
          marginLeft: responsive.isLargeScreen() ? 'auto' : 0,
          marginRight: responsive.isLargeScreen() ? 'auto' : 0,
          gap: responsive.isTablet() ? 32 : 28,
        } as any : {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: tabBarHeight,
          paddingBottom: responsive.isTablet() ? 8 : responsive.isSmallScreen() ? 4 : 6,
          paddingTop: responsive.isTablet() ? 8 : responsive.isSmallScreen() ? 4 : 6,
          paddingLeft: responsive.isTablet() ? 32 : 28,
          paddingRight: responsive.isTablet() ? 32 : 28,
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
          tabBarButton: user.role !== 'customer' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/orders"
        options={{
          title: t('customer.orderHistory'),
          tabBarLabel: t('customer.orderHistory'),
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'customer' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/profile"
        options={{
          title: t('customer.profile'),
          tabBarLabel: t('customer.profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'customer' ? () => null : undefined,
        }}
      />

      {/* Driver Tabs */}
      <Tabs.Screen
        name="driver/dashboard"
        options={{
          title: t('driver.dashboard'),
          tabBarLabel: t('driver.dashboard'),
          tabBarIcon: ({ color }) => <Ionicons name="home" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/trips"
        options={{
          title: t('driver.newTrips'),
          tabBarLabel: t('driver.newTrips'),
          tabBarIcon: ({ color }) => <Ionicons name="navigate" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/wallet"
        options={{
          title: t('driver.wallet'),
          tabBarLabel: t('driver.wallet'),
          tabBarIcon: ({ color }) => <Ionicons name="wallet" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/history"
        options={{
          title: t('driver.tripHistory'),
          tabBarLabel: t('driver.tripHistory'),
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />

      {/* Vendor Tabs */}
      <Tabs.Screen
        name="vendor/store"
        options={{
          title: t('vendor.store'),
          tabBarLabel: t('vendor.store'),
          tabBarIcon: ({ color }) => <Ionicons name="storefront" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'vendor' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="vendor/profile"
        options={{
          title: t('vendor.profile'),
          tabBarLabel: t('vendor.profile'),
          tabBarIcon: ({ color }) => <Ionicons name="person" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'vendor' ? () => null : undefined,
        }}
      />

      {/* Admin Tabs */}
      <Tabs.Screen
        name="admin/dashboard"
        options={{
          title: t('admin.dashboard'),
          tabBarLabel: t('admin.dashboard'),
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/drivers"
        options={{
          title: t('admin.drivers'),
          tabBarLabel: t('admin.drivers'),
          tabBarIcon: ({ color }) => <Ionicons name="people" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/accounting"
        options={{
          title: t('admin.accounting'),
          tabBarLabel: t('admin.accounting'),
          tabBarIcon: ({ color }) => <Ionicons name="cash" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/orders"
        options={{
          title: t('admin.allOrders'),
          tabBarLabel: t('admin.allOrders'),
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/places"
        options={{
          title: t('admin.places'),
          tabBarLabel: t('admin.places'),
          tabBarIcon: ({ color }) => <Ionicons name="location" size={tabBarIconSize} color={color} />,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
    </Tabs>
    </>
  );
}
