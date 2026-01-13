import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import responsive from '@/utils/responsive';

interface OrderSearchCountdownProps {
  orderId: string;
  onRestartSearch?: () => void;
}

interface SearchSettings {
  searchRadius: number;
  searchDuration: number;
}

export default function OrderSearchCountdown({ orderId, onRestartSearch }: OrderSearchCountdownProps) {
  console.log(`[OrderSearchCountdown] Component mounted for order: ${orderId}`);
  
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<SearchSettings>({
    searchRadius: 10,
    searchDuration: 60,
  });

  const settingsRef = useRef<SearchSettings>(settings);
  const searchStatusRef = useRef<string | null>(null);
  const lastDbCheckRef = useRef<number>(0);
  const dbCheckThrottle = 5000; // 5 ثوان - throttle للـ database checks
  const orderStatusRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<any>(null);
  const expiredCheckRef = useRef<NodeJS.Timeout | null>(null); // للتحقق من انتهاء الوقت
  const statusUpdateInProgressRef = useRef<boolean>(false); // لمنع التحديث المتكرر
  const searchExpiresAtRef = useRef<string | null>(null); // حفظ search_expires_at للوصول السريع

  useEffect(() => {
    // جلب الإعدادات
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('order_search_settings')
          .select('setting_key, setting_value');

        if (!error && data) {
          const newSettings: SearchSettings = {
            searchRadius: 10,
            searchDuration: 60,
          };

          data.forEach((setting) => {
            const value = parseFloat(setting.setting_value);
            if (setting.setting_key === 'search_radius_km' || setting.setting_key === 'initial_search_radius_km') {
              newSettings.searchRadius = value;
            } else if (setting.setting_key === 'search_duration_seconds' || setting.setting_key === 'initial_search_duration_seconds') {
              newSettings.searchDuration = value;
            }
          });

          setSettings(newSettings);
          settingsRef.current = newSettings;
        }
      } catch (error) {
        console.error('Error loading search settings:', error);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    // جلب حالة البحث الحالية
    const loadSearchStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('search_status, search_expires_at, status')
          .eq('id', orderId)
          .maybeSingle();

        if (!error && data) {
          console.log(`[OrderSearchCountdown] Order ${orderId} status:`, {
            search_status: data.search_status,
            status: data.status,
            search_expires_at: data.search_expires_at,
          });
          
          if (data.status !== 'pending') {
            console.log(`[OrderSearchCountdown] Order ${orderId} is not pending (status: ${data.status}), not starting countdown`);
            orderStatusRef.current = data.status;
            return;
          }
          
          orderStatusRef.current = data.status;
          
          // حفظ search_expires_at في ref فوراً إذا كان موجوداً
          if (data.search_expires_at) {
            searchExpiresAtRef.current = data.search_expires_at;
          }
          
          // تحديث العداد
          updateTimeRemaining(data, settingsRef.current);
        } else if (error) {
          if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
            console.log(`[OrderSearchCountdown] Order ${orderId} not found or access denied, not starting countdown`);
            return;
          }
          console.error('[OrderSearchCountdown] Error loading search status:', error);
        }
      } catch (error) {
        console.error('[OrderSearchCountdown] Exception loading search status:', error);
      }
    };

    loadSearchStatus();

    // الاشتراك في تحديثات البحث
    subscriptionRef.current = supabase
      .channel(`order_search_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const order = payload.new as any;
          
          // التحقق من حالة الطلب أولاً
          if (order.status !== 'pending') {
            console.log(`[OrderSearchCountdown] Order ${orderId} status changed to ${order.status}, stopping countdown`);
            setTimeRemaining(null);
            setSearchStatus(null);
            searchStatusRef.current = null;
            searchExpiresAtRef.current = null;
            orderStatusRef.current = order.status;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return;
          }
          
          // التحقق من search_status فوراً - إذا كان 'found' أو 'stopped'، إيقاف العداد فوراً
          if (order.search_status === 'found' || order.search_status === 'stopped') {
            console.log(`[OrderSearchCountdown] Order ${orderId} search_status changed to ${order.search_status}, stopping countdown immediately`);
            setTimeRemaining(null);
            setSearchStatus(order.search_status);
            searchStatusRef.current = order.search_status;
            searchExpiresAtRef.current = null;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return;
          }
          
          // حفظ search_expires_at في ref فوراً إذا كان موجوداً
          if (order.search_expires_at) {
            searchExpiresAtRef.current = order.search_expires_at;
            
            // حساب الوقت المتبقي مباشرة لتحديث العداد فوراً
            const expiresAt = new Date(order.search_expires_at).getTime();
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
            setTimeRemaining(remaining);
          }
          
          orderStatusRef.current = order.status;
          updateTimeRemaining(order, settingsRef.current);
        }
      )
      .subscribe();

    // ============================================
    // تحديث العداد كل ثانية - الاعتماد على search_expires_at فقط
    // ============================================
    intervalRef.current = setInterval(() => {
      // التحقق من حالة الطلب
      if (orderStatusRef.current && orderStatusRef.current !== 'pending') {
        setTimeRemaining(null);
        setSearchStatus(null);
        searchStatusRef.current = null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // التحقق الفوري من search_status - إذا تغير إلى 'found' أو 'stopped'، إيقاف العداد فوراً
      if (searchStatusRef.current === 'found' || searchStatusRef.current === 'stopped') {
        setTimeRemaining(null);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // تحديث العداد مباشرة من search_expires_at (إذا كان موجوداً)
      // هذا يضمن تحديث سلس كل ثانية بدون الحاجة لاستدعاء قاعدة البيانات
      if (searchExpiresAtRef.current && searchStatusRef.current === 'searching') {
        const expiresAt = new Date(searchExpiresAtRef.current).getTime();
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
        setTimeRemaining(remaining);
        
        // إذا انتهى الوقت، نحدث الحالة
        if (remaining === 0 && !statusUpdateInProgressRef.current) {
          statusUpdateInProgressRef.current = true;
          supabase
            .rpc('check_and_update_expired_search', { p_order_id: orderId })
            .then(({ data: updated, error }) => {
              statusUpdateInProgressRef.current = false;
              if (error || updated) {
                setSearchStatus('stopped');
                searchStatusRef.current = 'stopped';
                setTimeRemaining(null);
                searchExpiresAtRef.current = null;
              }
            });
        }
      }

      // تحديد frequency الـ polling بناءً على الوقت المتبقي
      // تقليل throttle عند تغيير search_status (للتحقق الفوري من 'found')
      const currentTimeRemaining = timeRemaining;
      const shouldPollFaster = (currentTimeRemaining !== null && currentTimeRemaining <= 5) && searchStatusRef.current === 'searching';
      const currentThrottle = shouldPollFaster ? 1000 : 2000; // 1 ثانية عند اقتراب الانتهاء، 2 ثوان عادة (أسرع من 5 ثوان)
      
      // جلب البيانات من قاعدة البيانات (مع throttle) للتحقق من التزامن
      const now = Date.now();
      if (now - lastDbCheckRef.current > currentThrottle) {
        lastDbCheckRef.current = now;
        
        supabase
          .from('orders')
          .select('search_status, search_expires_at, status')
          .eq('id', orderId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
                // الطلب غير موجود أو لا يمكن الوصول إليه
                setTimeRemaining(null);
                setSearchStatus(null);
                searchStatusRef.current = null;
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
              }
              return;
            }

            if (!data) return;

            // التحقق من حالة الطلب
            if (data.status !== 'pending') {
              setTimeRemaining(null);
              setSearchStatus(null);
              searchStatusRef.current = null;
              orderStatusRef.current = data.status;
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              return;
            }

            // التحقق الفوري من search_status - إذا تغير إلى 'found' أو 'stopped'، إيقاف العداد فوراً
            if (data.search_status === 'found' || data.search_status === 'stopped') {
              console.log(`[OrderSearchCountdown] Order ${orderId} search_status is ${data.search_status}, stopping countdown immediately`);
              setTimeRemaining(null);
              setSearchStatus(data.search_status);
              searchStatusRef.current = data.search_status;
              searchExpiresAtRef.current = null;
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              return;
            }

            // حفظ search_expires_at في ref فوراً
            if (data.search_expires_at) {
              searchExpiresAtRef.current = data.search_expires_at;
              
              // حساب الوقت المتبقي مباشرة لتحديث العداد فوراً
              const expiresAt = new Date(data.search_expires_at).getTime();
              const now = Date.now();
              const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
              setTimeRemaining(remaining);
            }

            // تحديث العداد من search_expires_at (مصدر موحد للحقيقة)
            orderStatusRef.current = data.status;
            updateTimeRemaining(data, settingsRef.current);
          });
      }
    }, 1000);

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (expiredCheckRef.current) {
        clearTimeout(expiredCheckRef.current);
        expiredCheckRef.current = null;
      }
      statusUpdateInProgressRef.current = false;
    };
  }, [orderId]);

  const updateTimeRemaining = (order: any, currentSettings: SearchSettings) => {
    // التحقق من حالة الطلب
    if (order.status && order.status !== 'pending') {
      console.log(`[OrderSearchCountdown] Order ${orderId} status is ${order.status}, stopping countdown`);
      setTimeRemaining(null);
      setSearchStatus(null);
      searchStatusRef.current = null;
      orderStatusRef.current = order.status;
      return;
    }
    
    // تحديث حالة البحث
    const newSearchStatus = order.search_status || null;
    setSearchStatus(newSearchStatus);
    searchStatusRef.current = newSearchStatus;
    
    // إذا توقف البحث أو تم العثور على سائق، لا نعرض العداد
    if (!newSearchStatus || newSearchStatus === 'stopped' || newSearchStatus === 'found') {
      setTimeRemaining(null);
      return;
    }

    // ============================================
    // المصدر الأساسي: search_expires_at (موحد بين السائق والعميل)
    // ============================================
    if (order.search_expires_at) {
      // حفظ search_expires_at في ref للوصول السريع
      searchExpiresAtRef.current = order.search_expires_at;
      
      const expiresAt = new Date(order.search_expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      
      // إذا انتهى الوقت والبحث لا يزال جارياً، نحدث الحالة
      if (remaining === 0 && newSearchStatus === 'searching' && !statusUpdateInProgressRef.current) {
        statusUpdateInProgressRef.current = true;
        
        supabase
          .rpc('check_and_update_expired_search', { p_order_id: orderId })
          .then(({ data: updated, error }) => {
            statusUpdateInProgressRef.current = false;
            if (error) {
              // Fallback: تحديث مباشر
              supabase
                .from('orders')
                .update({ search_status: 'stopped' })
                .eq('id', orderId)
                .eq('status', 'pending')
                .then(() => {
                  setSearchStatus('stopped');
                  searchStatusRef.current = 'stopped';
                  setTimeRemaining(null);
                  searchExpiresAtRef.current = null;
                });
            } else if (updated) {
              setSearchStatus('stopped');
              searchStatusRef.current = 'stopped';
              setTimeRemaining(null);
              searchExpiresAtRef.current = null;
            }
          });
        
        setTimeRemaining(0);
        return;
      }
      
      setTimeRemaining(remaining);
      return;
    }
    
    // إذا لم يكن search_expires_at موجوداً، نمسح ref
    searchExpiresAtRef.current = null;

    // إذا لم يكن search_expires_at موجوداً، لا نعرض عداد
    // (يجب أن يتم تحديث search_expires_at من start-order-search Edge Function)
    setTimeRemaining(null);
  };

  const getStatusText = () => {
    if (searchStatus === 'searching') {
      return `البحث في نطاق ${settings.searchRadius} كم`;
    }
    return 'جاري البحث...';
  };

  const getStatusColor = () => {
    if (timeRemaining !== null && timeRemaining <= 5 && searchStatus === 'searching') {
      return '#FF3B30'; // أحمر للتحذير
    }
    if (searchStatus === 'searching') {
      return '#007AFF';
    }
    return '#666';
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgress = (): number => {
    if (!timeRemaining || !searchStatus || searchStatus !== 'searching') return 0;
    // حساب التقدم بناءً على الوقت المتبقي والوقت الكلي
    // نستخدم settings.searchDuration كالوقت الكلي للبحث
    if (settings.searchDuration > 0) {
      const elapsed = settings.searchDuration - timeRemaining;
      return Math.min(1, Math.max(0, elapsed / settings.searchDuration));
    }
    return 0;
  };

  // إذا توقف البحث، لا نعرض شيئاً
  if (searchStatus === 'stopped') {
    return null;
  }

  // إذا تم العثور على سائق، لا نعرض شيئاً
  if (searchStatus === 'found') {
    return null;
  }

  // إذا لم تكن هناك حالة بحث
  if (!searchStatus || searchStatus === null) {
    return (
      <View style={styles.container}>
        <View style={[styles.countdownBar, { borderLeftColor: '#FF9500' }]}>
          <Ionicons name="time-outline" size={20} color="#FF9500" />
          <View style={styles.content}>
            <Text style={styles.statusText}>في انتظار بدء البحث عن سائق</Text>
            <Text style={styles.hintText}>سيبدأ البحث تلقائياً قريباً</Text>
          </View>
        </View>
      </View>
    );
  }

  // إذا كان البحث جارياً
  if (searchStatus === 'searching') {
    if (timeRemaining === null) {
      return (
        <View style={styles.container}>
          <View style={[styles.countdownBar, { borderLeftColor: getStatusColor() }]}>
            <Ionicons name="search" size={20} color={getStatusColor()} />
            <View style={styles.content}>
              <Text style={styles.statusText}>{getStatusText()}</Text>
              <Text style={styles.hintText}>جاري حساب الوقت المتبقي...</Text>
            </View>
          </View>
        </View>
      );
    }

    const statusColor = getStatusColor();
    const isWarning = timeRemaining !== null && timeRemaining <= 5 && timeRemaining > 0;
    const isExpired = timeRemaining === 0 && searchStatus === 'searching';
    
    return (
      <View style={styles.container}>
        <View style={[styles.countdownBar, { borderLeftColor: isExpired ? '#FF9500' : statusColor }]}>
          <Ionicons 
            name={isWarning ? "warning" : isExpired ? "hourglass" : "search"} 
            size={20} 
            color={isExpired ? '#FF9500' : statusColor} 
          />
          <View style={styles.content}>
            <Text style={styles.statusText}>
              {isExpired ? 'جاري التحديث...' : getStatusText()}
            </Text>
            <View style={styles.timeContainer}>
              <Ionicons 
                name={isWarning ? "time" : isExpired ? "hourglass-outline" : "time-outline"} 
                size={16} 
                color={isExpired ? '#FF9500' : statusColor} 
              />
              {isExpired ? (
                <Text style={[styles.timeText, { color: '#FF9500' }]}>
                  جاري التحديث...
                </Text>
              ) : (
                <Text style={[styles.timeText, { color: statusColor }]}>
                  {formatTime(timeRemaining)}
                </Text>
              )}
              {isWarning && !isExpired && (
                <Text style={styles.warningText}>!</Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${getProgress() * 100}%`,
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  // Fallback
  return (
    <View style={styles.container}>
      <View style={[styles.countdownBar, { borderLeftColor: '#FF9500' }]}>
        <Ionicons name="time-outline" size={20} color="#FF9500" />
        <View style={styles.content}>
          <Text style={styles.statusText}>جاري تحميل حالة البحث...</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  countdownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    ...responsive.createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    }),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hintText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  warningText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '700',
    color: '#FF3B30',
    marginLeft: 2,
  },
});
