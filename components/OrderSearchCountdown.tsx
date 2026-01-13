import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import responsive from '@/utils/responsive';

interface OrderSearchCountdownProps {
  orderId: string;
  onRestartSearch?: () => void;
}

interface SearchSettings {
  searchRadius: number;
  searchDuration: number;
}

function OrderSearchCountdown({ orderId, onRestartSearch }: OrderSearchCountdownProps) {
  const { user } = useAuth();
  const mountTimeRef = useRef<number | null>(null);
  const renderCountRef = useRef<number>(0);
  
  // تتبع عدد المرات التي تم فيها render (للتشخيص)
  renderCountRef.current += 1;
  
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
  const driverIdRef = useRef<string | null>(null); // تتبع driver_id لاكتشاف قبول الطلب
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<any>(null);
  const expiredCheckRef = useRef<NodeJS.Timeout | null>(null); // للتحقق من انتهاء الوقت
  const statusUpdateInProgressRef = useRef<boolean>(false); // لمنع التحديث المتكرر
  const searchExpiresAtRef = useRef<string | null>(null); // حفظ search_expires_at للوصول السريع
  const subscriptionActiveRef = useRef<boolean>(false); // تتبع حالة الاشتراك
  const lastSubscriptionCheckRef = useRef<number>(0); // آخر مرة تم التحقق من الاشتراك

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
    // تسجيل التحميل الأولي فقط
    if (mountTimeRef.current === null) {
      mountTimeRef.current = Date.now();
      console.log(`[OrderSearchCountdown] 🆕🆕🆕 Component MOUNTED for order: ${orderId} at ${mountTimeRef.current} 🆕🆕🆕`);
      console.log(`[OrderSearchCountdown] 🆕 Render count: ${renderCountRef.current}`);
    } else {
      const timeSinceMount = Date.now() - mountTimeRef.current;
      console.log(`[OrderSearchCountdown] 🔄 useEffect RE-RUN for order ${orderId} (render #${renderCountRef.current}, mounted ${timeSinceMount}ms ago)`);
      if (timeSinceMount < 1000) {
        console.warn(`[OrderSearchCountdown] ⚠️⚠️⚠️ useEffect re-running very quickly (${timeSinceMount}ms after mount) - possible remount issue! ⚠️⚠️⚠️`);
      }
    }
    
    console.log(`[OrderSearchCountdown] ⚡⚡⚡ useEffect triggered for order ${orderId} ⚡⚡⚡`);
    console.log(`[OrderSearchCountdown] ⚡ Component mount timestamp: ${Date.now()}`);
    console.log(`[OrderSearchCountdown] ⚡ Component was originally mounted at: ${mountTimeRef.current}`);
    
    // جلب حالة البحث الحالية
    const loadSearchStatus = async () => {
      try {
        console.log(`[OrderSearchCountdown] 🔄 Executing initial load query for order ${orderId}...`);
        
        let data: any = null;
        let error: any = null;
        
        // إذا كان المستخدم عميل، نستخدم Edge Function لتجاوز RLS
        if (user?.role === 'customer' && user?.id) {
          console.log(`[OrderSearchCountdown] 🔄 Using Edge Function for initial load (customer: ${user.id})`);
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-customer', {
            body: {
              orderId,
              customerId: user.id,
            },
          });
          
          if (edgeError) {
            error = edgeError;
            console.error(`[OrderSearchCountdown] ❌ Edge Function initial load error for order ${orderId}:`, edgeError);
          } else if (edgeData?.success && edgeData?.order) {
            data = edgeData.order;
            console.log(`[OrderSearchCountdown] 🔄 Edge Function initial load completed for order ${orderId}, data:`, {
              status: data.status,
              search_status: data.search_status,
              driver_id: data.driver_id,
            });
          } else {
            console.warn(`[OrderSearchCountdown] ⚠️ Edge Function returned no data for order ${orderId}`);
          }
        } else {
          // استخدام query مباشر للسائقين والمديرين
          const result = await supabase
            .from('orders')
            .select('search_status, search_expires_at, status, driver_id')
            .eq('id', orderId)
            .maybeSingle();
          data = result.data;
          error = result.error;
        }

        console.log(`[OrderSearchCountdown] 🔄 Initial load query completed for order ${orderId}, error:`, error ? error.message : 'none', 'data:', data ? 'exists' : 'null');

        if (!error && data) {
          console.log(`[OrderSearchCountdown] Order ${orderId} initial load:`, {
            search_status: data.search_status,
            status: data.status,
            search_expires_at: data.search_expires_at,
            driver_id: data.driver_id,
          });
          
          // تحديث driverIdRef
          driverIdRef.current = data.driver_id || null;
          
          // التحقق الفوري من driver_id - إذا كان موجوداً، إيقاف العداد
          if (data.driver_id) {
            console.log(`[OrderSearchCountdown] 🛑🛑🛑 INITIAL LOAD DETECTED driver_id=${data.driver_id}, stopping countdown IMMEDIATELY 🛑🛑🛑`);
            setTimeRemaining(null);
            setSearchStatus(data.search_status || 'found');
            searchStatusRef.current = data.search_status || 'found';
            orderStatusRef.current = data.status;
            return;
          }
          
          // تحديث refs أولاً
          orderStatusRef.current = data.status;
          driverIdRef.current = data.driver_id || null;
          if (data.search_status) {
            searchStatusRef.current = data.search_status;
          }
          
          // التحقق من search_status أولاً - إذا كان 'found' أو 'stopped'، لا نبدأ العداد
          if (data.search_status === 'found' || data.search_status === 'stopped') {
            console.log(`[OrderSearchCountdown] Order ${orderId} search_status is ${data.search_status}, not starting countdown`);
            setTimeRemaining(null);
            setSearchStatus(data.search_status);
            return;
          }
          
          if (data.status !== 'pending') {
            console.log(`[OrderSearchCountdown] Order ${orderId} is not pending (status: ${data.status}), not starting countdown`);
            return;
          }
          
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
    console.log(`[OrderSearchCountdown] 📡📡📡 Setting up realtime subscription for order ${orderId} 📡📡📡`);
    console.log(`[OrderSearchCountdown] 📡 Subscription setup timestamp: ${Date.now()}`);
    let channel;
    try {
      channel = supabase
      .channel(`order_search_${orderId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          console.log(`[OrderSearchCountdown] 🔔🔔🔔 SUBSCRIPTION CALLBACK TRIGGERED for order ${orderId} 🔔🔔🔔`);
          console.log(`[OrderSearchCountdown] 🔔 Callback timestamp: ${Date.now()}`);
          console.log(`[OrderSearchCountdown] 🔔 Payload eventType: ${payload.eventType}`);
          console.log(`[OrderSearchCountdown] 🔔 Payload table: ${payload.table}`);
          console.log(`[OrderSearchCountdown] 🔔 Payload schema: ${payload.schema}`);
          
          const order = payload.new as any;
          const oldOrder = payload.old as any;
          
          console.log(`[OrderSearchCountdown] 🔔 Realtime update for order ${orderId}:`, {
            status: order?.status,
            search_status: order?.search_status,
            search_expires_at: order?.search_expires_at,
            driver_id: order?.driver_id,
            eventType: payload.eventType,
            table: payload.table,
            schema: payload.schema,
            old_status: oldOrder?.status,
            old_search_status: oldOrder?.search_status,
            old_driver_id: oldOrder?.driver_id,
          });
          
          // التحقق من أن order موجود
          if (!order) {
            console.warn(`[OrderSearchCountdown] Realtime update received but order is null/undefined`);
            return;
          }
          
          // التحقق من search_status أولاً - إذا كان 'found' أو 'stopped'، إيقاف العداد فوراً
          // هذا مهم لأنه قد يتغير search_status قبل status
          if (order.search_status === 'found' || order.search_status === 'stopped') {
            console.log(`[OrderSearchCountdown] 🛑 SUBSCRIPTION DETECTED STATUS CHANGE: search_status=${order.search_status}, stopping countdown IMMEDIATELY`);
            console.log(`[OrderSearchCountdown] Previous search_status was: ${searchStatusRef.current}`);
            console.log(`[OrderSearchCountdown] Order details:`, {
              status: order.status,
              driver_id: order.driver_id,
              search_expires_at: order.search_expires_at,
            });
            setTimeRemaining(null);
            setSearchStatus(order.search_status);
            searchStatusRef.current = order.search_status;
            searchExpiresAtRef.current = null;
            orderStatusRef.current = order.status;
            driverIdRef.current = order.driver_id || null;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            // إجبار polling فوري للتحقق من التزامن
            lastDbCheckRef.current = 0;
            return;
          }
          
          // التحقق من driver_id - إذا كان موجوداً، إيقاف العداد
          if (order.driver_id && !driverIdRef.current) {
            console.log(`[OrderSearchCountdown] 🛑🛑🛑 SUBSCRIPTION DETECTED DRIVER ACCEPTANCE: driver_id=${order.driver_id}, stopping countdown IMMEDIATELY 🛑🛑🛑`);
            setTimeRemaining(null);
            setSearchStatus('found');
            searchStatusRef.current = 'found';
            searchExpiresAtRef.current = null;
            orderStatusRef.current = order.status;
            driverIdRef.current = order.driver_id;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            // إجبار polling فوري للتحقق من التزامن
            lastDbCheckRef.current = 0;
            return;
          }
          
          // التحقق من حالة الطلب - إذا لم يعد pending، إيقاف العداد
          if (order.status !== 'pending') {
            console.log(`[OrderSearchCountdown] Order ${orderId} status changed to ${order.status}, stopping countdown`);
            setTimeRemaining(null);
            setSearchStatus(null);
            searchStatusRef.current = null;
            searchExpiresAtRef.current = null;
            orderStatusRef.current = order.status;
            driverIdRef.current = order.driver_id || null;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            // إجبار polling فوري للتحقق من التزامن
            lastDbCheckRef.current = 0;
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
          
          // تحديث refs
          orderStatusRef.current = order.status;
          driverIdRef.current = order.driver_id || null;
          if (order.search_status) {
            searchStatusRef.current = order.search_status;
          }
          
          updateTimeRemaining(order, settingsRef.current);
        }
      )
      .subscribe((status) => {
        console.log(`[OrderSearchCountdown] 📡 Subscription status for order ${orderId}:`, status);
        if (status === 'SUBSCRIBED') {
          subscriptionActiveRef.current = true;
          console.log(`[OrderSearchCountdown] ✅✅✅ Successfully subscribed to realtime updates for order ${orderId} ✅✅✅`);
        } else if (status === 'CHANNEL_ERROR') {
          subscriptionActiveRef.current = false;
          console.error(`[OrderSearchCountdown] ❌❌❌ Subscription error for order ${orderId} ❌❌❌`);
          // إجبار polling فوري كـ fallback
          lastDbCheckRef.current = 0;
        } else if (status === 'TIMED_OUT') {
          subscriptionActiveRef.current = false;
          console.warn(`[OrderSearchCountdown] ⚠️⚠️⚠️ Subscription timeout for order ${orderId} ⚠️⚠️⚠️`);
          // إجبار polling فوري كـ fallback
          lastDbCheckRef.current = 0;
        } else if (status === 'CLOSED') {
          subscriptionActiveRef.current = false;
          console.warn(`[OrderSearchCountdown] ⚠️⚠️⚠️ Subscription closed for order ${orderId} ⚠️⚠️⚠️`);
          // إجبار polling فوري كـ fallback
          lastDbCheckRef.current = 0;
        }
      });
      
      subscriptionRef.current = channel;
      console.log(`[OrderSearchCountdown] 📡 Channel created and stored in ref for order ${orderId}`);
    } catch (error) {
      console.error(`[OrderSearchCountdown] ❌❌❌ ERROR setting up subscription for order ${orderId}:`, error);
      subscriptionRef.current = null;
    }

    // ============================================
    // دالة معالجة بيانات polling (مشتركة بين Edge Function و query مباشر)
    // ============================================
    const processPollingData = (data: any, orderId: string) => {
      console.log(`[OrderSearchCountdown] 🔍 Polling update for order ${orderId}:`, {
        status: data.status,
        search_status: data.search_status,
        search_expires_at: data.search_expires_at,
        driver_id: data.driver_id,
        currentSearchStatusRef: searchStatusRef.current,
        currentOrderStatusRef: orderStatusRef.current,
        currentDriverIdRef: driverIdRef.current,
        timestamp: Date.now(),
      });
      
      // التحقق الفوري من driver_id - إذا كان موجوداً، إيقاف العداد
      const previousDriverId = driverIdRef.current;
      console.log(`[OrderSearchCountdown] 🔍 Driver ID check: current=${data.driver_id}, previous=${previousDriverId}`);
      if (data.driver_id && !previousDriverId) {
        console.log(`[OrderSearchCountdown] 🛑🛑🛑 POLLING DETECTED DRIVER ACCEPTANCE: driver_id=${data.driver_id}, stopping countdown IMMEDIATELY 🛑🛑🛑`);
        setTimeRemaining(null);
        setSearchStatus('found');
        searchStatusRef.current = 'found';
        searchExpiresAtRef.current = null;
        orderStatusRef.current = data.status;
        driverIdRef.current = data.driver_id;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // إيقاف الاشتراك أيضاً
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        }
        return;
      }
      
      // تحديث driverIdRef
      driverIdRef.current = data.driver_id || null;
      
      // سجل إضافي عند اكتشاف تغيير مهم
      if (data.search_status === 'found' || data.search_status === 'stopped' || data.status !== 'pending' || (data.driver_id && !previousDriverId)) {
        console.log(`[OrderSearchCountdown] 🚨🚨🚨 POLLING DETECTED IMPORTANT CHANGE for order ${orderId} 🚨🚨🚨`);
        console.log(`[OrderSearchCountdown] 🚨 Status: ${data.status}, Search Status: ${data.search_status}, Driver ID: ${data.driver_id}, Previous Driver ID: ${previousDriverId}`);
      }

      // تحديث refs أولاً
      orderStatusRef.current = data.status;
      if (data.search_status) {
        searchStatusRef.current = data.search_status;
      }
      
      // التحقق الفوري من search_status أولاً - إذا تغير إلى 'found' أو 'stopped'، إيقاف العداد فوراً
      // هذا مهم لأنه قد يتغير search_status قبل status
      if (data.search_status === 'found' || data.search_status === 'stopped') {
        console.log(`[OrderSearchCountdown] 🛑🛑🛑 POLLING DETECTED STATUS CHANGE: search_status=${data.search_status}, stopping countdown IMMEDIATELY 🛑🛑🛑`);
        console.log(`[OrderSearchCountdown] 🛑 Previous search_status was: ${searchStatusRef.current}`);
        console.log(`[OrderSearchCountdown] 🛑 Order details:`, {
          status: data.status,
          driver_id: data.driver_id,
          search_expires_at: data.search_expires_at,
        });
        setTimeRemaining(null);
        setSearchStatus(data.search_status);
        searchStatusRef.current = data.search_status;
        searchExpiresAtRef.current = null;
        orderStatusRef.current = data.status;
        driverIdRef.current = data.driver_id || null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // إيقاف الاشتراك أيضاً
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        }
        return;
      }

      // التحقق من حالة الطلب
      if (data.status !== 'pending') {
        console.log(`[OrderSearchCountdown] 🛑🛑🛑 POLLING DETECTED STATUS CHANGE: status=${data.status}, stopping countdown 🛑🛑🛑`);
        console.log(`[OrderSearchCountdown] 🛑 Previous status was: ${orderStatusRef.current}`);
        console.log(`[OrderSearchCountdown] 🛑 Order details:`, {
          search_status: data.search_status,
          driver_id: data.driver_id,
          search_expires_at: data.search_expires_at,
        });
        setTimeRemaining(null);
        setSearchStatus(null);
        searchStatusRef.current = null;
        orderStatusRef.current = data.status;
        driverIdRef.current = data.driver_id || null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // إيقاف الاشتراك أيضاً
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
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
      driverIdRef.current = data.driver_id || null;
      updateTimeRemaining(data, settingsRef.current);
    };

    // ============================================
    // تحديث العداد كل ثانية - الاعتماد على search_expires_at فقط
    // ============================================
    intervalRef.current = setInterval(() => {
      // التحقق الفوري من driver_id أولاً - إذا كان موجوداً، إيقاف العداد فوراً
      if (driverIdRef.current) {
        console.log(`[OrderSearchCountdown] 🛑🛑🛑 Interval detected driver_id=${driverIdRef.current}, stopping countdown IMMEDIATELY 🛑🛑🛑`);
        setTimeRemaining(null);
        setSearchStatus('found');
        searchStatusRef.current = 'found';
        searchExpiresAtRef.current = null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // إيقاف الاشتراك أيضاً
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        }
        return;
      }
      
      // التحقق الفوري من search_status أولاً - إذا تغير إلى 'found' أو 'stopped'، إيقاف العداد فوراً
      if (searchStatusRef.current === 'found' || searchStatusRef.current === 'stopped') {
        console.log(`[OrderSearchCountdown] 🛑 Interval detected search_status=${searchStatusRef.current}, stopping countdown immediately`);
        setTimeRemaining(null);
        setSearchStatus(searchStatusRef.current);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      
      // التحقق من حالة الطلب
      if (orderStatusRef.current && orderStatusRef.current !== 'pending') {
        console.log(`[OrderSearchCountdown] 🛑 Interval detected status=${orderStatusRef.current}, stopping countdown`);
        setTimeRemaining(null);
        setSearchStatus(null);
        searchStatusRef.current = null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // التحقق الفوري من driver_id في interval أيضاً
      if (driverIdRef.current) {
        console.log(`[OrderSearchCountdown] 🛑🛑🛑 Interval detected driver_id=${driverIdRef.current}, stopping countdown IMMEDIATELY 🛑🛑🛑`);
        setTimeRemaining(null);
        setSearchStatus('found');
        searchStatusRef.current = 'found';
        searchExpiresAtRef.current = null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // إيقاف الاشتراك أيضاً
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
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
      // تقليل throttle إلى 500ms للتحقق الفوري من التغييرات (أسرع من الاشتراك كـ fallback)
      const currentThrottle = 500; // 500ms للتحقق الفوري - أسرع من الاشتراك كـ fallback
      
      // جلب البيانات من قاعدة البيانات (مع throttle) للتحقق من التزامن
      // إذا كان الاشتراك غير نشط، نستخدم polling بشكل أكثر تكراراً
      const now = Date.now();
      const timeSinceLastCheck = now - lastDbCheckRef.current;
      const effectiveThrottle = subscriptionActiveRef.current ? currentThrottle : 500; // إذا كان الاشتراك غير نشط، polling كل 500ms
      if (timeSinceLastCheck > effectiveThrottle) {
        console.log(`[OrderSearchCountdown] 🔄 Interval polling check for order ${orderId} (${timeSinceLastCheck}ms since last check, subscription active: ${subscriptionActiveRef.current})`);
        console.log(`[OrderSearchCountdown] 🔄 Current refs: search_status=${searchStatusRef.current}, status=${orderStatusRef.current}, driver_id=${driverIdRef.current}`);
        lastDbCheckRef.current = now;
        
        // إجبار polling فوري عند كل interval للتحقق من التغييرات
        // استخدام Edge Function لتجاوز RLS إذا كان المستخدم عميل
        console.log(`[OrderSearchCountdown] 🔄 Executing polling query for order ${orderId}...`);
        
        // إذا كان المستخدم عميل، نستخدم Edge Function لتجاوز RLS
        if (user?.role === 'customer' && user?.id) {
          console.log(`[OrderSearchCountdown] 🔄 Using Edge Function for polling (customer: ${user.id})`);
          supabase.functions.invoke('get-order-by-id-for-customer', {
            body: {
              orderId,
              customerId: user.id,
            },
          })
          .then(({ data: edgeData, error: edgeError }) => {
            if (edgeError) {
              console.error(`[OrderSearchCountdown] ❌ Edge Function polling error for order ${orderId}:`, edgeError);
              return;
            }
            
            if (!edgeData?.success || !edgeData?.order) {
              console.warn(`[OrderSearchCountdown] ⚠️ Edge Function returned no data for order ${orderId}`);
              return;
            }
            
            const data = edgeData.order;
            console.log(`[OrderSearchCountdown] 🔄 Edge Function polling completed for order ${orderId}, data:`, {
              status: data.status,
              search_status: data.search_status,
              driver_id: data.driver_id,
            });
            
            // معالجة البيانات بنفس الطريقة
            processPollingData(data, orderId);
          });
        } else {
          // استخدام query مباشر للسائقين والمديرين
          supabase
            .from('orders')
            .select('search_status, search_expires_at, status, driver_id')
            .eq('id', orderId)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) {
                console.error(`[OrderSearchCountdown] ❌ Polling error for order ${orderId}:`, error);
                if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
                  console.log(`[OrderSearchCountdown] ⚠️ Order ${orderId} not found or access denied`);
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

              if (!data) {
                console.warn(`[OrderSearchCountdown] ⚠️ Polling returned no data for order ${orderId}`);
                return;
              }
              
              processPollingData(data, orderId);
            });
        }
      }
    }, 500); // تحديث كل 500ms بدلاً من 1000ms للاستجابة الأسرع

    // التحقق من حالة الاشتراك بعد 2 ثانية
    setTimeout(() => {
      if (subscriptionRef.current) {
        const channelState = (subscriptionRef.current as any).state || 'unknown';
        console.log(`[OrderSearchCountdown] 📡 Subscription state for order ${orderId} after 2s:`, channelState);
        if (channelState !== 'joined' && channelState !== 'SUBSCRIBED') {
          subscriptionActiveRef.current = false;
          console.warn(`[OrderSearchCountdown] ⚠️⚠️⚠️ Subscription may not be active for order ${orderId}, state: ${channelState} ⚠️⚠️⚠️`);
          console.warn(`[OrderSearchCountdown] ⚠️ Falling back to aggressive polling (every 500ms) for order ${orderId}`);
          // إجبار polling فوري كـ fallback
          lastDbCheckRef.current = 0;
        } else {
          subscriptionActiveRef.current = true;
          console.log(`[OrderSearchCountdown] ✅ Subscription is active for order ${orderId}`);
        }
      } else {
        subscriptionActiveRef.current = false;
        console.error(`[OrderSearchCountdown] ❌❌❌ Subscription ref is null for order ${orderId} ❌❌❌`);
        console.warn(`[OrderSearchCountdown] ⚠️ Falling back to aggressive polling (every 500ms) for order ${orderId}`);
        // إجبار polling فوري كـ fallback
        lastDbCheckRef.current = 0;
      }
    }, 2000);

    return () => {
      const componentLifetime = mountTimeRef.current ? Date.now() - mountTimeRef.current : 0;
      console.log(`[OrderSearchCountdown] 🧹🧹🧹 CLEANUP STARTING for order ${orderId} 🧹🧹🧹`);
      console.log(`[OrderSearchCountdown] 🧹 Cleanup timestamp: ${Date.now()}`);
      console.log(`[OrderSearchCountdown] 🧹 Component was mounted at: ${mountTimeRef.current}`);
      console.log(`[OrderSearchCountdown] 🧹 Component lifetime: ${componentLifetime}ms`);
      console.log(`[OrderSearchCountdown] 🧹 Total renders: ${renderCountRef.current}`);
      
      // تحذير إذا كان عمر المكون قصيراً جداً (أقل من 3 ثوان) - يشير إلى إعادة تحميل متكررة
      if (componentLifetime > 0 && componentLifetime < 3000) {
        console.error(`[OrderSearchCountdown] ❌❌❌ Component unmounted too quickly (${componentLifetime}ms) - this indicates excessive re-mounting! ❌❌❌`);
        console.error(`[OrderSearchCountdown] ❌ This is the root cause of the countdown not updating! ❌`);
      }
      
      if (subscriptionRef.current) {
        console.log(`[OrderSearchCountdown] 🧹 Unsubscribing from channel for order ${orderId}`);
        try {
          subscriptionRef.current.unsubscribe();
        } catch (error) {
          console.error(`[OrderSearchCountdown] Error unsubscribing:`, error);
        }
        subscriptionRef.current = null;
        subscriptionActiveRef.current = false;
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
      mountTimeRef.current = null; // Reset for next mount
      console.log(`[OrderSearchCountdown] 🧹🧹🧹 CLEANUP COMPLETE for order ${orderId} 🧹🧹🧹`);
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

// استخدام React.memo لمنع إعادة التحميل غير الضرورية
// إعادة التحميل فقط إذا تغير orderId
export default React.memo(OrderSearchCountdown, (prevProps, nextProps) => {
  const orderIdChanged = prevProps.orderId !== nextProps.orderId;
  const onRestartSearchChanged = prevProps.onRestartSearch !== nextProps.onRestartSearch;
  const shouldUpdate = orderIdChanged || onRestartSearchChanged;
  
  if (shouldUpdate) {
    if (orderIdChanged) {
      console.log(`[OrderSearchCountdown] 🔄 React.memo: orderId changed from ${prevProps.orderId} to ${nextProps.orderId}`);
    }
    if (onRestartSearchChanged) {
      console.log(`[OrderSearchCountdown] 🔄 React.memo: onRestartSearch callback changed`);
    }
  } else {
    // منع إعادة التحميل إذا لم يتغير شيء
    console.log(`[OrderSearchCountdown] ✅ React.memo: skipping re-render (orderId: ${nextProps.orderId})`);
  }
  
  return !shouldUpdate; // return true = skip re-render, return false = re-render
});
