import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import responsive from '@/utils/responsive';

interface OrderSearchCountdownProps {
  orderId: string;
  onRestartSearch?: () => void;
}

interface SearchSettings {
  initialDuration: number;
  expandedDuration: number;
}

export default function OrderSearchCountdown({ orderId, onRestartSearch }: OrderSearchCountdownProps) {
  console.log(`[OrderSearchCountdown] Component mounted for order: ${orderId}`);
  
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [currentRadius, setCurrentRadius] = useState<number>(5);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState<boolean>(false); // لتتبع حالة التوسيع
  const [settings, setSettings] = useState<SearchSettings>({
    initialDuration: 30,
    expandedDuration: 30,
  });

  const settingsRef = useRef<SearchSettings>(settings);
  const searchStatusRef = useRef<string | null>(null);
  const localStartTimeRef = useRef<number | null>(null);
  const fastPollingActiveRef = useRef<boolean>(false);
  const fastPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDbCheckRef = useRef<number>(0); // لتتبع آخر وقت fetch من قاعدة البيانات
  const dbCheckThrottle = 5000; // 5 ثوان - throttle للـ database checks
  const orderStatusRef = useRef<string | null>(null); // لتتبع حالة الطلب (pending, accepted, etc.)
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // لتخزين interval الرئيسي
  const subscriptionRef = useRef<any>(null); // لتخزين subscription

  useEffect(() => {
    // جلب الإعدادات
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('order_search_settings')
          .select('setting_key, setting_value');

        if (!error && data) {
          const newSettings: SearchSettings = {
            initialDuration: 30,
            expandedDuration: 30,
          };

          data.forEach((setting) => {
            const value = parseFloat(setting.setting_value);
            if (setting.setting_key === 'initial_search_duration_seconds') {
              newSettings.initialDuration = value;
            } else if (setting.setting_key === 'expanded_search_duration_seconds') {
              newSettings.expandedDuration = value;
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
          .select('search_status, search_started_at, search_expanded_at, search_expires_at, status')
          .eq('id', orderId)
          .maybeSingle();

        if (!error && data) {
          console.log(`[OrderSearchCountdown] Order ${orderId} status:`, {
            search_status: data.search_status,
            status: data.status,
            search_started_at: data.search_started_at,
            search_expanded_at: data.search_expanded_at,
          });
          // إذا كان status ليس pending، لا نبدأ العداد
          if (data.status !== 'pending') {
            console.log(`[OrderSearchCountdown] Order ${orderId} is not pending (status: ${data.status}), not starting countdown`);
            orderStatusRef.current = data.status;
            return;
          }
          orderStatusRef.current = data.status;
          updateTimeRemaining(data, settingsRef.current);
        } else if (error) {
          // إذا كان الخطأ بسبب عدم وجود الطلب أو RLS، نتوقف
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
          // إذا تغير status من pending إلى accepted أو أي حالة أخرى، نتوقف فوراً
          if (order.status !== 'pending') {
            console.log(`[OrderSearchCountdown] Order ${orderId} status changed to ${order.status}, stopping countdown`);
            setTimeRemaining(null);
            setSearchStatus(null);
            searchStatusRef.current = null;
            orderStatusRef.current = order.status;
            // إيقاف جميع الـ intervals
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            if (fastPollingIntervalRef.current) {
              clearInterval(fastPollingIntervalRef.current);
              fastPollingIntervalRef.current = null;
            }
            fastPollingActiveRef.current = false;
            return;
          }
          orderStatusRef.current = order.status;
          updateTimeRemaining(order, settingsRef.current);
        }
      )
      .subscribe();

    // تحديث العداد كل ثانية
    intervalRef.current = setInterval(() => {
      // التحقق من أن الطلب لا يزال pending قبل المتابعة
      if (orderStatusRef.current && orderStatusRef.current !== 'pending') {
        console.log(`[OrderSearchCountdown] Order ${orderId} is no longer pending, stopping countdown`);
        setTimeRemaining(null);
        setSearchStatus(null);
        searchStatusRef.current = null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (fastPollingIntervalRef.current) {
          clearInterval(fastPollingIntervalRef.current);
          fastPollingIntervalRef.current = null;
        }
        fastPollingActiveRef.current = false;
        return;
      }
      // تحديث محلي للعداد أولاً (للعداد التنازلي السلس)
      // ملاحظة: الحساب الفعلي يتم من search_expires_at في updateTimeRemaining
      // هذا التحديث المحلي فقط للعداد السلس
      setTimeRemaining(prev => {
        const currentStatus = searchStatusRef.current;
        // إذا وصل العداد إلى 0 في المرحلة الموسعة، نستدعي stop-order-search
        if (prev === 0 && currentStatus === 'expanded' && !fastPollingActiveRef.current) {
          fastPollingActiveRef.current = true;
          console.log(`[OrderSearchCountdown] Expanded countdown reached 0, calling stop-order-search for order ${orderId}`);
          
          // انتظار 2 ثانية ثم استدعاء stop-order-search إذا لم تتغير الحالة
          setTimeout(async () => {
            // التحقق من الحالة الحالية قبل الاستدعاء
            const { data: currentOrder } = await supabase
              .from('orders')
              .select('search_status')
              .eq('id', orderId)
              .maybeSingle();

            // إذا كانت الحالة لا تزال 'expanded'، نستدعي stop-order-search
            if (currentOrder?.search_status === 'expanded') {
              console.log(`[OrderSearchCountdown] Status still 'expanded' after 2s, calling stop-order-search`);
              try {
                const { data: session } = await supabase.auth.getSession();
                const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
                if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
                  console.error(`[OrderSearchCountdown] Invalid Supabase URL: ${supabaseUrl}`);
                  return;
                }
                
                const response = await fetch(`${supabaseUrl}/functions/v1/stop-order-search`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.session?.access_token || ''}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ order_id: orderId }),
                });

                const result = await response.json();
                if (response.ok && result.success) {
                  console.log(`[OrderSearchCountdown] Successfully stopped search for order ${orderId}`);
                  // تحديث الحالة فوراً بعد الاستدعاء
                  const { data: updatedOrder } = await supabase
                    .from('orders')
                    .select('search_status, search_started_at, search_expanded_at, search_expires_at')
                    .eq('id', orderId)
                    .maybeSingle();
                  
                  if (updatedOrder) {
                    updateTimeRemaining(updatedOrder, settingsRef.current);
                  }
                } else {
                  console.error(`[OrderSearchCountdown] Error stopping search:`, result.error);
                }
              } catch (stopErr) {
                console.error(`[OrderSearchCountdown] Exception calling stop-order-search:`, stopErr);
              }
            } else {
              console.log(`[OrderSearchCountdown] Status changed to '${currentOrder?.search_status}', skipping stop call`);
            }
            fastPollingActiveRef.current = false;
          }, 2000);
        }
        
        // إذا وصل العداد إلى 0 ولم يتم تحديث الحالة، نفعّل الـ polling السريع ونستدعي expand-order-search
        if (prev === 0 && currentStatus === 'searching' && !fastPollingActiveRef.current) {
          fastPollingActiveRef.current = true;
          setIsExpanding(true); // تحديث state لإظهار الرسالة
          console.log(`[OrderSearchCountdown] ⏰ Countdown reached 0 for order ${orderId}, triggering search expansion from 5km to 10km`);
          
          // استدعاء expand-order-search فوراً (بدون انتظار)
          const expandSearch = async () => {
            try {
              // التحقق من الحالة الحالية قبل الاستدعاء
              const { data: currentOrder } = await supabase
                .from('orders')
                .select('search_status, status, driver_id')
                .eq('id', orderId)
                .maybeSingle();

              // إذا تم قبول الطلب أو إلغاؤه، لا نوسع البحث
              if (currentOrder?.status === 'accepted' || currentOrder?.status === 'cancelled' || currentOrder?.driver_id) {
                console.log(`[OrderSearchCountdown] ⚠️ Order ${orderId} already accepted/cancelled, skipping expansion`);
                fastPollingActiveRef.current = false;
                return;
              }

              // إذا كانت الحالة لا تزال 'searching'، نستدعي expand-order-search
              if (currentOrder?.search_status === 'searching') {
                console.log(`[OrderSearchCountdown] 🔄 Calling expand-order-search for order ${orderId}`);
                const { data: session } = await supabase.auth.getSession();
                const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
                
                if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
                  console.error(`[OrderSearchCountdown] ❌ Invalid Supabase URL: ${supabaseUrl}`);
                  fastPollingActiveRef.current = false;
                  return;
                }
                
                const response = await fetch(`${supabaseUrl}/functions/v1/expand-order-search`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.session?.access_token || ''}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ order_id: orderId }),
                });

                const result = await response.json();
                if (response.ok && result.success) {
                  console.log(`[OrderSearchCountdown] ✅ Successfully expanded search for order ${orderId} - ${result.drivers_found || 0} drivers found`);
                  // تحديث الحالة فوراً بعد الاستدعاء
                  const { data: updatedOrder } = await supabase
                    .from('orders')
                    .select('search_status, search_started_at, search_expanded_at, search_expires_at')
                    .eq('id', orderId)
                    .maybeSingle();
                  
                  if (updatedOrder) {
                    updateTimeRemaining(updatedOrder, settingsRef.current);
                  }
                  fastPollingActiveRef.current = false;
                  setIsExpanding(false); // إخفاء رسالة التوسيع
                } else {
                  console.error(`[OrderSearchCountdown] ❌ Error expanding search:`, result.error || result);
                  // Retry بعد ثانية واحدة
                  setTimeout(() => {
                    if (fastPollingActiveRef.current) {
                      console.log(`[OrderSearchCountdown] 🔄 Retrying expand-order-search for order ${orderId}`);
                      expandSearch();
                    }
                  }, 1000);
                }
              } else {
                console.log(`[OrderSearchCountdown] ✅ Status already changed to '${currentOrder?.search_status}', skipping expand call`);
                fastPollingActiveRef.current = false;
                setIsExpanding(false); // إخفاء رسالة التوسيع
              }
            } catch (expandErr) {
              console.error(`[OrderSearchCountdown] ❌ Exception calling expand-order-search:`, expandErr);
              // Retry بعد ثانية واحدة
              setTimeout(() => {
                if (fastPollingActiveRef.current) {
                  console.log(`[OrderSearchCountdown] 🔄 Retrying expand-order-search after error for order ${orderId}`);
                  expandSearch();
                }
              }, 1000);
            }
          };
          
          // استدعاء فوري (بدون انتظار)
          expandSearch();
          
          // بدء الـ polling السريع كل 500ms (لمدة أقصاها 10 ثوان)
          let pollingAttempts = 0;
          const maxPollingAttempts = 20; // 20 * 500ms = 10 seconds
          
          fastPollingIntervalRef.current = setInterval(() => {
            pollingAttempts++;
            
            // إيقاف الـ polling بعد 10 ثوان
            if (pollingAttempts > maxPollingAttempts) {
              console.log(`[OrderSearchCountdown] ⚠️ Fast polling timeout after 10 seconds, stopping`);
              if (fastPollingIntervalRef.current) {
                clearInterval(fastPollingIntervalRef.current);
                fastPollingIntervalRef.current = null;
              }
              fastPollingActiveRef.current = false;
              setIsExpanding(false); // إخفاء رسالة التوسيع
              return;
            }
            
            supabase
              .from('orders')
              .select('search_status, search_started_at, search_expanded_at, search_expires_at')
              .eq('id', orderId)
              .maybeSingle()
              .then(({ data, error }) => {
                if (!error && data) {
                  console.log(`[OrderSearchCountdown] 🔄 Fast polling (${pollingAttempts}/${maxPollingAttempts}) - order status: ${data.search_status}`);
                  if (data.search_status === 'expanded') {
                    // تم التحديث إلى expanded، نوقف الـ polling السريع
                    if (fastPollingIntervalRef.current) {
                      clearInterval(fastPollingIntervalRef.current);
                      fastPollingIntervalRef.current = null;
                    }
                    fastPollingActiveRef.current = false;
                    setIsExpanding(false); // إخفاء رسالة التوسيع
                    console.log(`[OrderSearchCountdown] ✅ Status updated to expanded, stopping fast polling`);
                    updateTimeRemaining(data, settingsRef.current);
                    updateTimeRemaining(data, settingsRef.current);
                  } else if (data.search_status === 'stopped' || data.search_status === 'found') {
                    // إذا توقف البحث أو تم العثور على سائق، نوقف الـ polling
                    if (fastPollingIntervalRef.current) {
                      clearInterval(fastPollingIntervalRef.current);
                      fastPollingIntervalRef.current = null;
                    }
                    fastPollingActiveRef.current = false;
                    updateTimeRemaining(data, settingsRef.current);
                  }
                } else {
                  console.error(`[OrderSearchCountdown] Fast polling error:`, error);
                }
              });
          }, 500);
          
          // إيقاف الـ polling السريع بعد 10 ثوانٍ كحد أقصى
          setTimeout(() => {
            if (fastPollingIntervalRef.current) {
              console.log(`[OrderSearchCountdown] Fast polling timeout after 10 seconds - status may not have updated`);
              clearInterval(fastPollingIntervalRef.current);
              fastPollingIntervalRef.current = null;
            }
            fastPollingActiveRef.current = false;
          }, 10000);
        }
        
        if (prev !== null && prev > 0 && currentStatus && (currentStatus === 'searching' || currentStatus === 'expanded')) {
          return Math.max(0, prev - 1);
        }
        return prev;
      });
      
      // جلب البيانات من قاعدة البيانات للتأكد من التزامن (مع throttle لتجنب الاستدعاءات المفرطة)
      const now = Date.now();
      if (now - lastDbCheckRef.current > dbCheckThrottle) {
        lastDbCheckRef.current = now;
        supabase
          .from('orders')
          .select('search_status, search_started_at, search_expanded_at, search_expires_at, status')
          .eq('id', orderId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (!error && data) {
              // إذا تغير status من pending، نتوقف فوراً
              if (data.status !== 'pending') {
                console.log(`[OrderSearchCountdown] Order ${orderId} status changed to ${data.status}, stopping countdown`);
                setTimeRemaining(null);
                setSearchStatus(null);
                searchStatusRef.current = null;
                orderStatusRef.current = data.status;
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                if (fastPollingIntervalRef.current) {
                  clearInterval(fastPollingIntervalRef.current);
                  fastPollingIntervalRef.current = null;
                }
                fastPollingActiveRef.current = false;
                return;
              }
              orderStatusRef.current = data.status;
              updateTimeRemaining(data, settingsRef.current);
            } else if (error) {
              // إذا كان الخطأ بسبب عدم وجود الطلب أو RLS، نتوقف
              if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
                console.log(`[OrderSearchCountdown] Order ${orderId} not found or access denied, stopping countdown`);
                setTimeRemaining(null);
                setSearchStatus(null);
                searchStatusRef.current = null;
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                if (fastPollingIntervalRef.current) {
                  clearInterval(fastPollingIntervalRef.current);
                  fastPollingIntervalRef.current = null;
                }
                fastPollingActiveRef.current = false;
              } else {
                console.error(`[OrderSearchCountdown] Error fetching order status:`, error);
              }
            }
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
      if (fastPollingIntervalRef.current) {
        clearInterval(fastPollingIntervalRef.current);
        fastPollingIntervalRef.current = null;
      }
      fastPollingActiveRef.current = false;
    };
  }, [orderId]);

  const updateTimeRemaining = (order: any, currentSettings: SearchSettings) => {
    // إذا تغير status من pending، نتوقف فوراً
    if (order.status && order.status !== 'pending') {
      console.log(`[OrderSearchCountdown] Order ${orderId} status is ${order.status}, stopping countdown`);
      setTimeRemaining(null);
      setSearchStatus(null);
      searchStatusRef.current = null;
      orderStatusRef.current = order.status;
      localStartTimeRef.current = null;
      return;
    }
    
    // تحديث searchStatus دائماً
    const newSearchStatus = order.search_status || null;
    setSearchStatus(newSearchStatus);
    searchStatusRef.current = newSearchStatus;
    
    console.log(`[OrderSearchCountdown] updateTimeRemaining for order ${orderId}:`, {
      search_status: newSearchStatus,
      status: order.status,
      search_started_at: order.search_started_at,
      search_expanded_at: order.search_expanded_at,
      search_expires_at: order.search_expires_at,
    });

    if (!order.search_status || order.search_status === 'stopped' || order.search_status === 'found') {
      setTimeRemaining(null);
      localStartTimeRef.current = null;
      return;
    }

    // استخدام search_expires_at مباشرة من السيرفر (الأفضل لتجنب التأخير)
    if (order.search_expires_at) {
      const expiresAt = new Date(order.search_expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      
      setTimeRemaining(remaining);
      
      // تحديد النطاق بناءً على search_status
      if (order.search_status === 'searching') {
        setCurrentRadius(5);
      } else if (order.search_status === 'expanded') {
        setCurrentRadius(10);
        // إيقاف الـ polling السريع إذا كان نشطاً
        if (fastPollingIntervalRef.current) {
          clearInterval(fastPollingIntervalRef.current);
          fastPollingIntervalRef.current = null;
        }
        fastPollingActiveRef.current = false;
      }
      
      console.log(`[OrderSearchCountdown] Using search_expires_at - remaining: ${remaining}s`);
      return;
    }

    // Fallback: إذا لم يكن search_expires_at موجوداً، نستخدم الطريقة القديمة
    if (order.search_status === 'searching' && order.search_started_at) {
      // استخدام timestamp من قاعدة البيانات
      const startedAt = new Date(order.search_started_at).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - startedAt) / 1000);
      const remaining = Math.max(0, currentSettings.initialDuration - elapsed);
      
      setTimeRemaining(remaining);
      setCurrentRadius(5);
      localStartTimeRef.current = startedAt;
    } else if (order.search_status === 'expanded' && order.search_expanded_at) {
      // استخدام timestamp من قاعدة البيانات
      const expandedAt = new Date(order.search_expanded_at).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - expandedAt) / 1000);
      const remaining = Math.max(0, currentSettings.expandedDuration - elapsed);
      setTimeRemaining(remaining);
      setCurrentRadius(10);
      localStartTimeRef.current = expandedAt;
      
      // إيقاف الـ polling السريع إذا كان نشطاً
      if (fastPollingIntervalRef.current) {
        clearInterval(fastPollingIntervalRef.current);
        fastPollingIntervalRef.current = null;
      }
      fastPollingActiveRef.current = false;
      
      console.log(`[OrderSearchCountdown] Transitioned to expanded - remaining: ${remaining}s`);
    } else if (order.search_status === 'searching' || order.search_status === 'expanded') {
      // إذا كانت الحالة searching أو expanded لكن لا توجد timestamps
      // نبدأ العد التنازلي من الآن
      const defaultDuration = order.search_status === 'searching' 
        ? currentSettings.initialDuration 
        : currentSettings.expandedDuration;
      
      // إذا لم يكن هناك وقت بدء محلي محفوظ، نبدأ من الآن
      if (localStartTimeRef.current === null || searchStatusRef.current !== newSearchStatus) {
        localStartTimeRef.current = Date.now();
        setTimeRemaining(defaultDuration);
      }
      // إذا كان هناك وقت بدء محلي، نحسب الوقت المتبقي
      else {
        const now = Date.now();
        const elapsed = Math.floor((now - localStartTimeRef.current) / 1000);
        const remaining = Math.max(0, defaultDuration - elapsed);
        setTimeRemaining(remaining);
      }
      
      setCurrentRadius(order.search_status === 'searching' ? 5 : 10);
    } else {
      // إذا كانت الحالة null أو undefined، نعرض null
      setTimeRemaining(null);
      localStartTimeRef.current = null;
    }
  };

  const getStatusText = () => {
    if (searchStatus === 'searching') {
      return `البحث في نطاق ${currentRadius} كم`;
    } else if (searchStatus === 'expanded') {
      return `البحث الموسع في نطاق ${currentRadius} كم`;
    }
    return 'جاري البحث...';
  };

  const getStatusColor = () => {
    // تحذير بصري عند 5 ثوانٍ متبقية أو أقل
    if (timeRemaining !== null && timeRemaining <= 5 && (searchStatus === 'searching' || searchStatus === 'expanded')) {
      return '#FF3B30'; // أحمر للتحذير
    }
    
    if (searchStatus === 'searching') {
      return '#007AFF';
    } else if (searchStatus === 'expanded') {
      return '#FF9500';
    }
    return '#666';
  };

  // اكتشاف الانتقال من searching إلى expanded
  useEffect(() => {
    if (previousStatus === 'searching' && searchStatus === 'expanded') {
      console.log('[OrderSearchCountdown] البحث توسع - تم الانتقال إلى expanded');
    }
    setPreviousStatus(searchStatus);
  }, [searchStatus, previousStatus]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgress = (): number => {
    if (!timeRemaining || !searchStatus) return 0;
    if (searchStatus === 'searching') {
      return (settings.initialDuration - timeRemaining) / settings.initialDuration;
    } else if (searchStatus === 'expanded') {
      return (settings.expandedDuration - timeRemaining) / settings.expandedDuration;
    }
    return 0;
  };

  // Debug: Log current state
  useEffect(() => {
    console.log(`[OrderSearchCountdown] Order ${orderId} render:`, {
      searchStatus,
      timeRemaining,
      currentRadius,
    });
  }, [orderId, searchStatus, timeRemaining, currentRadius]);

  // إذا توقف البحث، لا نعرض شيئاً (تم حذف البطاقة لأن الوظيفة متكررة)
  if (searchStatus === 'stopped') {
    return null;
  }

  // إذا تم العثور على سائق، لا نعرض شيئاً
  if (searchStatus === 'found') {
    return null;
  }

  // إذا لم تكن هناك حالة بحث (null أو undefined)، قد يكون البحث لم يبدأ بعد
  // نعرض رسالة "في انتظار بدء البحث"
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

  // إذا كان البحث جارياً (searching أو expanded)
  if (searchStatus === 'searching' || searchStatus === 'expanded') {
    // إذا كان timeRemaining لم يُحسب بعد، نعرض "جاري البحث..."
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

    // عرض العداد التنازلي
    const statusColor = getStatusColor();
    const isWarning = timeRemaining !== null && timeRemaining <= 5 && timeRemaining > 0;
    const isZero = timeRemaining === 0 && searchStatus === 'searching';
    const isJustExpanded = previousStatus === 'searching' && searchStatus === 'expanded';
    const isCurrentlyExpanding = isExpanding || (isZero && searchStatus === 'searching');
    
    return (
      <View style={styles.container}>
        {isJustExpanded && (
          <View style={styles.expansionNotice}>
            <Ionicons name="expand" size={16} color="#FF9500" />
            <Text style={styles.expansionNoticeText}>
              تم توسيع البحث إلى نطاق أوسع (10 كم)
            </Text>
          </View>
        )}
        <View style={[styles.countdownBar, { borderLeftColor: isCurrentlyExpanding ? '#FF9500' : statusColor }]}>
          <Ionicons 
            name={isWarning ? "warning" : isCurrentlyExpanding ? "hourglass" : "search"} 
            size={20} 
            color={isCurrentlyExpanding ? '#FF9500' : statusColor} 
          />
          <View style={styles.content}>
            <Text style={styles.statusText}>
              {isCurrentlyExpanding ? 'جاري توسيع البحث من 5 كم إلى 10 كم...' : getStatusText()}
            </Text>
            <View style={styles.timeContainer}>
              <Ionicons 
                name={isWarning ? "time" : isZero ? "hourglass-outline" : "time-outline"} 
                size={16} 
                color={isZero ? '#FF9500' : statusColor} 
              />
              <Text style={[styles.timeText, { color: isZero ? '#FF9500' : statusColor }]}>
                {formatTime(timeRemaining)}
              </Text>
              {isWarning && (
                <Text style={styles.warningText}>!</Text>
              )}
              {isZero && (
                <Text style={styles.expandingText}>⏳</Text>
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

  // Fallback: إذا لم نتمكن من تحديد الحالة، نعرض رسالة افتراضية
  // هذا يحدث فقط في حالات نادرة جداً
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
  expansionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF5E6',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
  },
  expansionNoticeText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#FF9500',
    fontWeight: '500',
  },
  warningText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '700',
    color: '#FF3B30',
    marginLeft: 2,
  },
  expandingText: {
    fontSize: responsive.getResponsiveFontSize(14),
    marginLeft: 4,
  },
});
