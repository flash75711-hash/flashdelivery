import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { notifyAllActiveDrivers, createNotification } from '@/lib/notifications';

export interface SearchSettings {
  initialRadius: number; // بالكيلومتر
  expandedRadius: number; // بالكيلومتر
  initialDuration: number; // بالثواني
  expandedDuration: number; // بالثواني
}

export interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
}

export type SearchStatus = 'searching' | 'expanded' | 'stopped' | 'found';

interface UseOrderSearchOptions {
  orderId: string;
  searchPoint: { lat: number; lon: number }; // نقطة البحث (أبعد مكان أو نقطة الاستلام)
  onDriverFound?: (driverId: string) => void;
  onSearchStopped?: () => void;
}

/**
 * Hook للبحث التلقائي عن السائقين مع توسيع النطاق تدريجياً
 */
export function useOrderSearch({
  orderId,
  searchPoint,
  onDriverFound,
  onSearchStopped,
}: UseOrderSearchOptions) {
  const [searchStatus, setSearchStatus] = useState<SearchStatus | null>(null);
  const [currentRadius, setCurrentRadius] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [foundDrivers, setFoundDrivers] = useState<DriverLocation[]>([]);
  const [settings, setSettings] = useState<SearchSettings>({
    initialRadius: 3,
    expandedRadius: 6,
    initialDuration: 10,
    expandedDuration: 10,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // جلب الإعدادات من قاعدة البيانات
  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('order_search_settings')
        .select('setting_key, setting_value');

      if (error) {
        console.error('Error loading search settings:', error);
        return;
      }

      const newSettings: SearchSettings = {
        initialRadius: 3,
        expandedRadius: 6,
        initialDuration: 10,
        expandedDuration: 10,
      };

      data?.forEach((setting) => {
        const value = parseFloat(setting.setting_value);
        switch (setting.setting_key) {
          case 'initial_search_radius_km':
            newSettings.initialRadius = value;
            break;
          case 'expanded_search_radius_km':
            newSettings.expandedRadius = value;
            break;
          case 'initial_search_duration_seconds':
            newSettings.initialDuration = value;
            break;
          case 'expanded_search_duration_seconds':
            newSettings.expandedDuration = value;
            break;
        }
      });

      setSettings(newSettings);
    } catch (error) {
      console.error('Error loading search settings:', error);
    }
  }, []);

  // حساب المسافة بين نقطتين
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // البحث عن السائقين في نطاق معين
  const findDriversInRadius = useCallback(async (radius: number): Promise<DriverLocation[]> => {
    try {
      // جلب جميع السائقين النشطين
      const { data: allDrivers, error: driversError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'driver')
        .eq('status', 'active')
        .eq('approval_status', 'approved');

      if (driversError || !allDrivers || allDrivers.length === 0) {
        return [];
      }

      const driverIds = allDrivers.map(d => d.id);

      // جلب مواقع السائقين
      const { data: locationsData, error: locationsError } = await supabase
        .from('driver_locations')
        .select('driver_id, latitude, longitude')
        .in('driver_id', driverIds)
        .order('updated_at', { ascending: false });

      if (locationsError || !locationsData) {
        return [];
      }

      // فلترة السائقين حسب المسافة
      const latestLocations = new Map<string, DriverLocation>();
      locationsData.forEach(loc => {
        if (loc.latitude && loc.longitude && !latestLocations.has(loc.driver_id)) {
          latestLocations.set(loc.driver_id, {
            driver_id: loc.driver_id,
            latitude: loc.latitude,
            longitude: loc.longitude,
          });
        }
      });

      const driversInRadius: DriverLocation[] = [];
      latestLocations.forEach((driver) => {
        const distance = calculateDistance(
          searchPoint.lat,
          searchPoint.lon,
          driver.latitude,
          driver.longitude
        );
        if (distance <= radius) {
          driversInRadius.push(driver);
        }
      });

      return driversInRadius;
    } catch (error) {
      console.error('Error finding drivers in radius:', error);
      return [];
    }
  }, [searchPoint]);

  // التحقق من قبول الطلب
  const checkOrderAccepted = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('status,driver_id')
        .eq('id', orderId)
        .single();

      if (error || !data) {
        return false;
      }

      // إذا تم قبول الطلب
      if (data.status === 'accepted' && data.driver_id) {
        stopSearch();
        if (onDriverFound) {
          onDriverFound(data.driver_id);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking order acceptance:', error);
      return false;
    }
  }, [orderId, onDriverFound]);

  // إرسال إشعارات للسائقين
  const notifyDrivers = useCallback(async (drivers: DriverLocation[], radius: number) => {
    if (drivers.length === 0) return;

    try {
      const title = 'طلب جديد متاح';
      const message = `يوجد طلب جديد متاح في نطاق ${radius} كم. تحقق من قائمة الطلبات.`;
      const type = 'info';

      for (const driver of drivers) {
        try {
          await supabase.rpc('insert_notification_for_driver', {
            p_user_id: driver.driver_id,
            p_title: title,
            p_message: message,
            p_type: type,
          });
        } catch (error) {
          console.error(`Error notifying driver ${driver.driver_id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error notifying drivers:', error);
    }
  }, []);

  // بدء البحث
  const startSearch = useCallback(async () => {
    await loadSettings();

    // تحديث حالة الطلب
    await supabase
      .from('orders')
      .update({
        search_status: 'searching',
        search_started_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    setSearchStatus('searching');
    setCurrentRadius(settings.initialRadius);
    setTimeRemaining(settings.initialDuration);

    // البحث الأولي
    const initialDrivers = await findDriversInRadius(settings.initialRadius);
    setFoundDrivers(initialDrivers);

    if (initialDrivers.length > 0) {
      await notifyDrivers(initialDrivers, settings.initialRadius);
    }

    // عداد الوقت
    let timeLeft = settings.initialDuration;
    intervalRef.current = setInterval(() => {
      timeLeft -= 1;
      setTimeRemaining(timeLeft);

      if (timeLeft <= 0) {
        // الانتقال للبحث الموسع
        expandSearch();
      }
    }, 1000);

    // التحقق من قبول الطلب كل ثانية
    checkIntervalRef.current = setInterval(async () => {
      const accepted = await checkOrderAccepted();
      if (accepted) {
        clearInterval(intervalRef.current!);
        clearInterval(checkIntervalRef.current!);
      }
    }, 1000);
  }, [orderId, searchPoint, settings, findDriversInRadius, notifyDrivers, checkOrderAccepted, loadSettings]);

  // توسيع البحث
  const expandSearch = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // تحديث حالة الطلب
    await supabase
      .from('orders')
      .update({
        search_status: 'expanded',
        search_expanded_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    setSearchStatus('expanded');
    setCurrentRadius(settings.expandedRadius);
    setTimeRemaining(settings.expandedDuration);

    // البحث الموسع
    const expandedDrivers = await findDriversInRadius(settings.expandedRadius);
    setFoundDrivers(expandedDrivers);

    // إرسال إشعارات للسائقين الجدد فقط
    const newDrivers = expandedDrivers.filter(
      driver => !foundDrivers.some(fd => fd.driver_id === driver.driver_id)
    );

    if (newDrivers.length > 0) {
      await notifyDrivers(newDrivers, settings.expandedRadius);
    }

    // عداد الوقت للبحث الموسع
    let timeLeft = settings.expandedDuration;
    intervalRef.current = setInterval(() => {
      timeLeft -= 1;
      setTimeRemaining(timeLeft);

      if (timeLeft <= 0) {
        stopSearch();
      }
    }, 1000);

    // التحقق من قبول الطلب
    checkIntervalRef.current = setInterval(async () => {
      const accepted = await checkOrderAccepted();
      if (accepted) {
        clearInterval(intervalRef.current!);
        clearInterval(checkIntervalRef.current!);
      }
    }, 1000);
  }, [orderId, settings, foundDrivers, findDriversInRadius, notifyDrivers, checkOrderAccepted]);

  // إيقاف البحث
  const stopSearch = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    // تحديث حالة الطلب
    await supabase
      .from('orders')
      .update({
        search_status: 'stopped',
      })
      .eq('id', orderId);

    setSearchStatus('stopped');
    setTimeRemaining(0);

    if (onSearchStopped) {
      onSearchStopped();
    }
  }, [orderId, onSearchStopped]);

  // إعادة البحث
  const restartSearch = useCallback(async () => {
    stopSearch();
    await new Promise(resolve => setTimeout(resolve, 500));
    startSearch();
  }, [stopSearch, startSearch]);

  // تنظيف عند unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  return {
    searchStatus,
    currentRadius,
    timeRemaining,
    foundDrivers,
    startSearch,
    stopSearch,
    restartSearch,
    settings,
  };
}



