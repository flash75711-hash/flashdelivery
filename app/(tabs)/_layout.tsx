import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useEffect } from 'react';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  // إضافة CSS مخصص للويب لجعل الـ tab bar مثل الموبايل
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && user) {
      const styleId = 'expo-tabs-bottom-navbar-style';
      // إزالة الـ style القديم إذا كان موجوداً
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
      
      const currentRole = user.role;
      
      // تحديد الـ tabs المرغوبة حسب الدور
      const allowedTabs: Record<string, string[]> = {
        customer: ['/customer/home', '/customer/orders', '/customer/profile'],
        driver: ['/driver/dashboard', '/driver/trips', '/driver/wallet', '/driver/history'],
        vendor: ['/vendor/store', '/vendor/profile'],
        admin: ['/admin/dashboard', '/admin/drivers', '/admin/accounting', '/admin/orders', '/admin/places'],
      };
      
      const allowedPaths = allowedTabs[currentRole] || [];
      
      // Flag لمنع الاستدعاءات المتكررة
      let isProcessing = false;
      let lastProcessedTime = 0;
      const PROCESSING_COOLDOWN = 500; // 500ms بين كل استدعاء
      
      // إخفاء الـ tabs باستخدام JavaScript
      const hideTabsWithJS = () => {
        const now = Date.now();
        // منع الاستدعاءات المتكررة جداً
        if (isProcessing || (now - lastProcessedTime) < PROCESSING_COOLDOWN) {
          return;
        }
        
        isProcessing = true;
        lastProcessedTime = now;
        
        const tabList = document.querySelector('[role="tablist"]');
        if (!tabList) {
          isProcessing = false;
          return;
        }
        
        // إخفاء/إظهار الـ tabs
        const tabs = tabList.querySelectorAll('a[role="tab"]');
        tabs.forEach((tab) => {
          const href = tab.getAttribute('href') || '';
          // إخفاء tab "index" إذا لم يكن مطلوباً
          const isIndex = href === '/' || href === '';
          // التحقق إذا كان الـ tab مسموحاً
          const isAllowed = allowedPaths.some(path => href.includes(path));
          const shouldHide = !isAllowed || (isIndex && !allowedPaths.includes('/'));
          
          const parent = tab.closest('div');
          
          if (shouldHide) {
            // إخفاء الـ tab غير المرغوب
            if (parent) {
              (parent as HTMLElement).style.display = 'none';
              (parent as HTMLElement).style.visibility = 'hidden';
            }
            (tab as HTMLElement).style.display = 'none';
            (tab as HTMLElement).style.visibility = 'hidden';
          } else {
            // إظهار الـ tab المرغوب
            if (parent) {
              (parent as HTMLElement).style.display = 'flex';
              (parent as HTMLElement).style.visibility = 'visible';
            }
            (tab as HTMLElement).style.display = 'flex';
            (tab as HTMLElement).style.visibility = 'visible';
            
            // إصلاح الأيقونات والنصوص
            // إزالة أي أيقونات إيموجي مضافة يدوياً (لأننا نستخدم SVG من Ionicons)
            const allDivs = tab.querySelectorAll('div[dir="auto"]');
            const emojiIcons = ['📊', '👥', '💰', '📄', '📍', '🏠', '🧭', '💳', '⏰', '🏪', '👤'];
            allDivs.forEach((div) => {
              const text = div.textContent || '';
              const normalizedText = text.trim();
              // إزالة أي عنصر يحتوي على إيموجي أيقونة (تم إضافتها يدوياً)
              if (emojiIcons.some(emoji => normalizedText === emoji || normalizedText.includes(emoji))) {
                // التحقق إذا كان هذا العنصر داخل SVG container - إذا كان كذلك، احذفه
                const parent = div.parentElement;
                if (parent && (parent.tagName === 'DIV' || parent.classList.toString().includes('icon'))) {
                  (div as HTMLElement).remove();
                }
              }
              // إخفاء العناصر التي تحتوي على "⏷" فقط
              if (text === '⏷' || normalizedText === '⏷' || (text.length === 1 && text === '⏷')) {
                (div as HTMLElement).style.display = 'none';
                (div as HTMLElement).style.visibility = 'hidden';
              }
            });
            
            // إخفاء النصوص التي تحتوي على paths
            const textDivs = tab.querySelectorAll('div[dir="auto"]') as NodeListOf<HTMLElement>;
            
            // إزالة النصوص المكررة أولاً
            const seenTexts = new Set<string>();
            textDivs.forEach((div) => {
              const text = div.textContent || '';
              const normalizedText = text.trim();
              
              // تخطي الإيموجي أيقونات
              if (emojiIcons.some(emoji => normalizedText === emoji || normalizedText.includes(emoji))) {
                return;
              }
              
              // إزالة النصوص المكررة (نفس النص المترجم)
              if (normalizedText && !normalizedText.includes('/') && normalizedText !== '⏷') {
                if (seenTexts.has(normalizedText)) {
                  // هذا نص مكرر، احذفه
                  div.remove();
                  return;
                }
                seenTexts.add(normalizedText);
              }
              
              if (text.includes('/') && (text.includes('admin/') || text.includes('customer/') || text.includes('driver/') || text.includes('vendor/'))) {
                div.style.display = 'none';
              } else if (text !== '⏷' && normalizedText !== '⏷' && !text.includes('/') && normalizedText.length > 0) {
                // إظهار النص إذا كان الاسم المترجم
                div.style.display = 'block';
                div.style.visibility = 'visible';
              }
            });
            
            // إظهار الأيقونات (SVG) فقط - إزالة أي تكرار
            const svgElements = tab.querySelectorAll('svg, SVG') as NodeListOf<SVGElement>;
            let firstSvgFound = false;
            svgElements.forEach((svgEl, index) => {
              if (index === 0) {
                // إظهار أول SVG فقط
                svgEl.style.display = 'inline-block';
                svgEl.style.visibility = 'visible';
                svgEl.style.width = '24px';
                svgEl.style.height = '24px';
                firstSvgFound = true;
              } else {
                // إخفاء أي SVG إضافي (تكرار)
                svgEl.style.display = 'none';
                svgEl.style.visibility = 'hidden';
              }
            });
            
            // إصلاح النصوص المترجمة
            const pathToLabel: Record<string, string> = {
              '/admin/dashboard': t('admin.dashboard'),
              '/admin/drivers': t('admin.drivers'),
              '/admin/accounting': t('admin.accounting'),
              '/admin/orders': t('admin.allOrders'),
              '/admin/places': t('admin.places'),
              '/customer/home': t('customer.home'),
              '/customer/orders': t('customer.orderHistory'),
              '/customer/profile': t('customer.profile'),
              '/driver/dashboard': t('driver.dashboard'),
              '/driver/trips': t('driver.newTrips'),
              '/driver/wallet': t('driver.wallet'),
              '/driver/history': t('driver.tripHistory'),
              '/vendor/store': t('vendor.store'),
              '/vendor/profile': t('vendor.profile'),
            };
            
            const label = pathToLabel[href];
            
            if (label) {
              // البحث عن النص الذي يحتوي على path أو النص المترجم الموجود بالفعل
              const existingTextDivs = tab.querySelectorAll('div[dir="auto"]') as NodeListOf<HTMLElement>;
              let pathTextDiv: HTMLElement | null = null;
              let existingLabelDiv: HTMLElement | null = null;
              
              for (let i = 0; i < existingTextDivs.length; i++) {
                const div = existingTextDivs[i];
                const text = div.textContent || '';
                const normalizedText = text.trim();
                // تخطي الإيموجي أيقونات
                if (emojiIcons.some(emoji => normalizedText === emoji || normalizedText.includes(emoji))) {
                  continue;
                }
                if (text.includes('/') && (text.includes('admin/') || text.includes('customer/') || text.includes('driver/') || text.includes('vendor/'))) {
                  pathTextDiv = div;
                } else if (normalizedText === label) {
                  existingLabelDiv = div;
                }
              }
              
              if (pathTextDiv) {
                // استبدال النص بالاسم المترجم
                pathTextDiv.textContent = label;
                pathTextDiv.style.display = 'block';
                pathTextDiv.style.visibility = 'visible';
                pathTextDiv.style.whiteSpace = 'nowrap';
                pathTextDiv.style.overflow = 'visible';
                pathTextDiv.style.textOverflow = 'clip';
              } else if (existingLabelDiv) {
                // النص المترجم موجود بالفعل، تأكد من إظهاره فقط
                existingLabelDiv.style.display = 'block';
                existingLabelDiv.style.visibility = 'visible';
                existingLabelDiv.style.whiteSpace = 'nowrap';
                existingLabelDiv.style.overflow = 'visible';
                existingLabelDiv.style.textOverflow = 'clip';
              } else {
                // إنشاء نص جديد فقط إذا لم يكن موجوداً
                const newTextDiv = document.createElement('div');
                newTextDiv.setAttribute('dir', 'auto');
                newTextDiv.textContent = label;
                newTextDiv.style.cssText = 'color: rgb(153, 153, 153); font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; margin-top: 2px; display: block; visibility: visible; white-space: nowrap; overflow: visible; text-overflow: clip;';
                tab.appendChild(newTextDiv);
              }
            }
          }
        });
        
        // إعادة تعيين flag بعد انتهاء المعالجة
        setTimeout(() => {
          isProcessing = false;
        }, 100);
      };
      
      // تشغيل فوراً مرة واحدة فقط
      hideTabsWithJS();
      
      // تحديد الـ tabs التي يجب إخفاؤها بناءً على الدور
      const hideTabsForRole = (role: string) => {
        const hidePatterns: Record<string, string[]> = {
          customer: ['/admin/', '/driver/', '/vendor/'],
          driver: ['/admin/', '/customer/', '/vendor/'],
          vendor: ['/admin/', '/customer/', '/driver/'],
          admin: ['/customer/', '/driver/', '/vendor/'],
        };
        return hidePatterns[role] || [];
      };
      
      const hidePatterns = hideTabsForRole(currentRole);
      const hideSelectors = hidePatterns.map(pattern => 
        `[role="tablist"] a[href^="${pattern}"], [role="tablist"] a[href*="${pattern}"]`
      ).join(',\n        ');
      
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* إجبار الـ tab bar على الظهور كـ bottom navbar */
        nav[role="tablist"],
        [role="tablist"],
        .bottom-tab-bar,
        [class*="BottomTabBar"] {
          display: flex !important;
          flex-direction: row !important;
          justify-content: space-around !important;
          align-items: center !important;
          position: fixed !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          background-color: #fff !important;
          border-top: 1px solid #e0e0e0 !important;
          height: 65px !important;
          z-index: 1000 !important;
          padding: 6px 0 !important;
          box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1) !important;
          overflow: visible !important;
          margin: 0 !important;
        }
        
        /* إخفاء الـ tabs التي لا تنتمي للدور الحالي */
        ${hideSelectors} {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
        
        /* إخفاء الـ parent container للـ tabs المخفية */
        ${hidePatterns.map(pattern => 
          `[role="tablist"] > div:has(a[href^="${pattern}"]),
          [role="tablist"] > div:has(a[href*="${pattern}"]),
          [role="tablist"] > [role="generic"]:has(a[href^="${pattern}"]),
          [role="tablist"] > [role="generic"]:has(a[href*="${pattern}"])`
        ).join(',\n        ')} {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
        
        /* إخفاء الـ tabs المخفية */
        [role="tablist"] > [role="generic"]:has(button[style*="display: none"]),
        [role="tablist"] > [role="generic"]:has(button[style*="display:none"]),
        [role="tablist"] > [role="generic"]:has(a[style*="display: none"]),
        [role="tablist"] > [role="generic"]:has(a[style*="display:none"]),
        [role="tablist"] > [role="generic"]:empty,
        [role="tablist"] > *:empty {
          display: none !important;
        }
        
        /* توزيع الـ tabs بشكل متساوٍ */
        [role="tablist"] > *,
        [role="tablist"] > [role="generic"],
        [role="tablist"] > div {
          flex: 1 !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          max-width: none !important;
          min-width: 0 !important;
        }
        
        /* إظهار الـ tabs المرغوبة فقط */
        [role="tablist"] > div:not([style*="display: none"]):not([style*="display:none"]) {
          display: flex !important;
        }
        
        /* منع القائمة المنبثقة */
        [role="tablist"] button[aria-expanded],
        [role="tablist"] button[aria-haspopup],
        [role="tablist"] button[aria-controls] {
          display: none !important;
        }
        
        /* إخفاء أي قوائم منبثقة */
        [role="tablist"] ~ [role="menu"],
        [role="tablist"] + [role="menu"],
        [role="menu"] {
          display: none !important;
        }
        
        /* تحسين مظهر الـ tabs */
        [role="tab"],
        [role="tablist"] button,
        [role="tablist"] a {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 2px 4px !important;
          min-width: 60px !important;
          width: 100% !important;
          border: none !important;
          background: transparent !important;
          text-decoration: none !important;
          gap: 2px !important;
        }
        
        /* تحسين حجم النص في الـ tabs */
        [role="tab"] div[dir="auto"],
        [role="tablist"] a div[dir="auto"],
        [role="tablist"] a > div:last-child {
          font-size: 11px !important;
          font-weight: 600 !important;
          margin-top: 2px !important;
          white-space: nowrap !important;
          overflow: visible !important;
          text-overflow: clip !important;
          max-width: none !important;
        }
        
        /* إخفاء أي عناصر إضافية */
        [role="tablist"] > [role="generic"]:not(:has([role="tab"])):not(:has(button)):not(:has(a)) {
          display: none !important;
        }
        
        /* إصلاح عرض الأيقونات - إظهار SVG فقط */
        [role="tablist"] svg:first-of-type,
        [role="tablist"] [class*="icon"] svg:first-of-type,
        [role="tablist"] [class*="Icon"] svg:first-of-type {
          display: inline-block !important;
          width: 24px !important;
          height: 24px !important;
          visibility: visible !important;
          flex-shrink: 0 !important;
        }
        
        /* إخفاء أي SVG مكرر */
        [role="tablist"] svg:not(:first-of-type),
        [role="tablist"] [class*="icon"] svg:not(:first-of-type),
        [role="tablist"] [class*="Icon"] svg:not(:first-of-type) {
          display: none !important;
        }
        
        /* إخفاء العناصر التي تحتوي على "⏷" أو إيموجي أيقونات */
        [role="tablist"] div[dir="auto"]:has-text("⏷"),
        [role="tablist"] div:has-text("⏷") {
          display: none !important;
          visibility: hidden !important;
        }
        
        /* إخفاء أي عناصر إيموجي أيقونات مضافة يدوياً */
        [role="tablist"] div[dir="auto"]:has-text("📊"),
        [role="tablist"] div[dir="auto"]:has-text("👥"),
        [role="tablist"] div[dir="auto"]:has-text("💰"),
        [role="tablist"] div[dir="auto"]:has-text("📄"),
        [role="tablist"] div[dir="auto"]:has-text("📍"),
        [role="tablist"] div[dir="auto"]:has-text("🏠"),
        [role="tablist"] div[dir="auto"]:has-text("🧭"),
        [role="tablist"] div[dir="auto"]:has-text("💳"),
        [role="tablist"] div[dir="auto"]:has-text("⏰"),
        [role="tablist"] div[dir="auto"]:has-text("🏪"),
        [role="tablist"] div[dir="auto"]:has-text("👤") {
          display: none !important;
          visibility: hidden !important;
        }
      `;
      document.head.appendChild(style);
      
      // إضافة MutationObserver لمراقبة التغييرات في DOM (مع debounce قوي لتجنب infinite loops)
      let observerTimeout: NodeJS.Timeout | null = null;
      const DEBOUNCE_DELAY = 1000; // 1 ثانية debounce
      
      const observer = new MutationObserver((mutations) => {
        // تجاهل التغييرات التي نسببها نحن (تغييرات style فقط)
        const hasNonStyleChanges = mutations.some(mutation => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            return false; // تجاهل تغييرات style
          }
          return mutation.type !== 'attributes'; // نستجيب فقط للتغييرات الهيكلية
        });
        
        if (!hasNonStyleChanges) {
          return; // تجاهل إذا كانت التغييرات style فقط
        }
        
        if (observerTimeout) {
          clearTimeout(observerTimeout);
        }
        observerTimeout = setTimeout(() => {
          hideTabsWithJS();
        }, DEBOUNCE_DELAY);
      });
      
      const tabList = document.querySelector('[role="tablist"]');
      if (tabList) {
        // مراقبة التغييرات الهيكلية فقط (إضافة/حذف nodes)
        observer.observe(tabList, { 
          childList: true, 
          subtree: false, // لا نراقب subtree لتقليل الاستدعاءات
          attributes: false, // لا نراقب تغييرات attributes
          attributeOldValue: false
        });
      }
      
      return () => {
        const styleToRemove = document.getElementById(styleId);
        if (styleToRemove) {
          styleToRemove.remove();
        }
        if (observerTimeout) {
          clearTimeout(observerTimeout);
        }
        observer.disconnect();
        isProcessing = false;
      };
    }
  }, [user, t]);

  if (loading) {
    return null; // يمكن إضافة شاشة تحميل هنا
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }


  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: (Platform.OS === 'web' ? {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 65,
          paddingBottom: 6,
          paddingTop: 6,
          elevation: 8,
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          width: '100%',
          maxWidth: '100%',
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
        } : {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 65,
          paddingBottom: 6,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        }) as any,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: false,
      }}
    >
      <Tabs.Screen
        name="customer/home"
        options={{
          title: t('customer.home'),
          tabBarLabel: t('customer.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'customer' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/orders"
        options={{
          title: t('customer.orderHistory'),
          tabBarLabel: t('customer.orderHistory'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'customer' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="customer/profile"
        options={{
          title: t('customer.profile'),
          tabBarLabel: t('customer.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'customer' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/dashboard"
        options={{
          title: t('driver.dashboard'),
          tabBarLabel: t('driver.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/trips"
        options={{
          title: t('driver.newTrips'),
          tabBarLabel: t('driver.newTrips'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/wallet"
        options={{
          title: t('driver.wallet'),
          tabBarLabel: t('driver.wallet'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="driver/history"
        options={{
          title: t('driver.tripHistory'),
          tabBarLabel: t('driver.tripHistory'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'driver' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="vendor/store"
        options={{
          title: t('vendor.store'),
          tabBarLabel: t('vendor.store'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'vendor' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="vendor/profile"
        options={{
          title: t('vendor.profile'),
          tabBarLabel: t('vendor.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'vendor' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/dashboard"
        options={{
          title: t('admin.dashboard'),
          tabBarLabel: t('admin.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/drivers"
        options={{
          title: t('admin.drivers'),
          tabBarLabel: t('admin.drivers'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/accounting"
        options={{
          title: t('admin.accounting'),
          tabBarLabel: t('admin.accounting'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/orders"
        options={{
          title: t('admin.allOrders'),
          tabBarLabel: t('admin.allOrders'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="admin/places"
        options={{
          title: t('admin.places'),
          tabBarLabel: t('admin.places'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="location" size={size} color={color} />
          ),
          headerShown: false,
          tabBarButton: user.role !== 'admin' ? () => null : undefined,
        }}
      />
    </Tabs>
  );
}

