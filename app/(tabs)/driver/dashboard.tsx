import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Switch,
  TouchableOpacity,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, isRegistrationComplete } from '@/lib/supabase';
import CurrentLocationDisplay from '@/components/CurrentLocationDisplay';
import { useRouter, useFocusEffect } from 'expo-router';
import responsive, { createShadowStyle } from '@/utils/responsive';
import NotificationCard from '@/components/NotificationCard';
import { showSimpleAlert, showAlert } from '@/lib/alert';

export default function DriverDashboardScreen() {
  console.log('DriverDashboard: Component rendered');
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const router = useRouter();
  console.log('DriverDashboard: User from auth:', user?.id);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);
  
  // نبدأ بـ null بدلاً من false حتى يتم جلب القيمة من قاعدة البيانات
  // هذا يمنع إعادة تعيين الحالة إلى false عند إعادة تحميل الصفحة
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [driverProfile, setDriverProfile] = useState<{
    full_name?: string;
    phone?: string;
    id_card_image_url?: string;
    selfie_image_url?: string;
    approval_status?: 'pending' | 'approved' | 'rejected';
    status?: string;
    is_online?: boolean;
  } | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const isLoadingProfileRef = useRef(false);
  const [showApprovalAlert, setShowApprovalAlert] = useState(false);
  const previousApprovalStatusRef = useRef<'pending' | 'approved' | 'rejected' | undefined>(undefined);
  const hasShownApprovalAlertRef = useRef(false); // لمنع عرض رسالة التهنئة أكثر من مرة
  const lastKnownOnlineStatusRef = useRef<boolean | null>(null); // حفظ آخر حالة معروفة
  const hasLoadedInitialStatusRef = useRef(false); // للتأكد من أننا جلبنا الحالة الأولية من قاعدة البيانات
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    is_read: boolean;
    created_at: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [instapayNumber, setInstapayNumber] = useState<string>('');
  const [cashNumber, setCashNumber] = useState<string>('');
  const [editingPaymentLinks, setEditingPaymentLinks] = useState(false);

  // قراءة الحالة الأولية من localStorage عند تحميل المكون
  useEffect(() => {
    if (user && Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`driver_${user.id}_is_online`);
        if (saved !== null) {
          const savedStatus = saved === 'true';
          console.log('DriverDashboard: Initial load from localStorage:', savedStatus);
          setIsOnline(savedStatus);
          lastKnownOnlineStatusRef.current = savedStatus;
        }
      } catch (e) {
        console.error('DriverDashboard: Error reading from localStorage on initial load:', e);
      }
    }
  }, [user]);

  useEffect(() => {
    console.log('DriverDashboard: useEffect triggered, user:', user?.id);
    if (user) {
      // إعادة تعيين flag عند تغيير المستخدم
      hasShownApprovalAlertRef.current = false;
      previousApprovalStatusRef.current = undefined;
      loadDriverStatus();
      loadDriverProfile();
      loadWalletBalance();
      
      // الاشتراك في Realtime لتحديث بيانات السائق تلقائياً
      const profileChannel = supabase
        .channel(`driver_profile_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            console.log('DriverDashboard: Profile updated via Realtime:', payload);
            // إعادة تحميل بيانات السائق عند التحديث
            loadDriverProfile();
            loadDriverStatus();
          }
        )
        .subscribe();
      
      // الاشتراك في Realtime لتحديث رصيد المحفظة تلقائياً
      const walletChannel = supabase
        .channel(`driver_wallet_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'wallets',
            filter: `driver_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('DriverDashboard: New wallet entry via Realtime (INSERT):', payload);
            // إعادة تحميل رصيد المحفظة عند إضافة مبلغ جديد
            setTimeout(() => {
              loadWalletBalance();
            }, 500); // تأخير بسيط للتأكد من حفظ البيانات
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'wallets',
            filter: `driver_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('DriverDashboard: Wallet entry updated via Realtime (UPDATE):', payload);
            // إعادة تحميل رصيد المحفظة عند تحديث مبلغ
            setTimeout(() => {
              loadWalletBalance();
            }, 500);
          }
        )
        .subscribe((status) => {
          console.log('DriverDashboard: Wallet channel subscription status:', status);
          // حفظ حالة الاشتراك في ref للتحقق منها في polling
          (walletChannel as any).__subscriptionStatus = status;
        });
      
      // إضافة interval للتحقق من رصيد المحفظة كل 30 ثانية (كحل احتياطي) - تقليل من 5 ثوان
      // إذا كان Realtime subscription يعمل، لا نحتاج للـ polling
      const walletCheckInterval = setInterval(() => {
        // التحقق من أن Realtime subscription لا يزال نشطاً
        const walletStatus = (walletChannel as any)?.__subscriptionStatus;
        if (walletChannel && walletStatus === 'SUBSCRIBED') {
          // Realtime يعمل، لا حاجة للـ polling
          return;
        }
        loadWalletBalance();
      }, 30000); // تقليل من 5 ثوان إلى 30 ثانية

      return () => {
        // تنظيف عند unmount
        if (locationIntervalRef.current) {
          clearInterval(locationIntervalRef.current);
          locationIntervalRef.current = null;
        }
        clearInterval(walletCheckInterval);
        profileChannel.unsubscribe();
        walletChannel.unsubscribe();
      };
    }
  }, [user]);

  // إعادة تحميل البيانات عند العودة للصفحة (فقط إذا لم يتم تحميلها للتو)
  useFocusEffect(
    React.useCallback(() => {
      console.log('DriverDashboard: useFocusEffect triggered, user:', user?.id);
      if (user && !isLoadingProfileRef.current) {
        // إعادة تحميل فقط إذا لم يكن هناك تحميل جاري
        const timer = setTimeout(() => {
          loadDriverProfile();
          loadWalletBalance(); // تحديث رصيد المحفظة عند العودة للصفحة
        }, 100); // تأخير بسيط لتجنب الاستدعاءات المتكررة
        
        return () => clearTimeout(timer);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  // فحص دوري لحالة الموافقة (كل 5 ثواني) إذا كان في انتظار المراجعة
  useEffect(() => {
    if (!user || driverProfile?.approval_status !== 'pending') {
      // إذا لم يكن في انتظار المراجعة، لا نحتاج للفحص الدوري
      return;
    }

    console.log('DriverDashboard: Starting approval polling for pending status...');
    
    // تقليل تكرار التحقق من الموافقة من كل 5 ثوان إلى كل 30 ثانية
    const checkApprovalInterval = setInterval(async () => {
      try {
        console.log('DriverDashboard: Polling - Checking approval status...');
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('approval_status, registration_complete')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('DriverDashboard: Error checking approval:', error);
          return;
        }

        console.log('DriverDashboard: Polling - Current status:', profile?.approval_status, 'Previous ref:', previousApprovalStatusRef.current);

        // إذا تغيرت الحالة من pending إلى approved ولم يتم عرض الرسالة من قبل
        if (
          profile?.approval_status === 'approved' &&
          profile?.registration_complete &&
          !hasShownApprovalAlertRef.current
        ) {
          // تمت الموافقة!
          console.log('DriverDashboard: ✅ Approval detected in polling!');
          clearInterval(checkApprovalInterval);
          
          // إعادة تحميل البيانات (سيظهر الإشعار في loadDriverProfile)
          await loadDriverProfile();
        } else if (profile?.approval_status === 'rejected') {
          // تم الرفض
          console.log('DriverDashboard: ❌ Rejection detected in polling!');
          clearInterval(checkApprovalInterval);
          // إعادة تحميل البيانات (سيظهر الإشعار في loadDriverProfile)
          await loadDriverProfile();
        }
      } catch (error) {
        console.error('DriverDashboard: Error checking approval status:', error);
      }
    }, 30000); // تقليل من 5 ثوان إلى 30 ثانية لتقليل استدعاءات API

    return () => {
      console.log('DriverDashboard: Stopping approval polling');
      clearInterval(checkApprovalInterval);
    };
  }, [user, driverProfile?.approval_status, registrationComplete]);

  const loadDriverStatus = async () => {
    if (!user) {
      setLoading(false); // تأكد من تعيين loading إلى false
      return;
    }
    
    // قراءة الحالة من localStorage أولاً (إذا كانت متاحة)
    let localStorageStatus: boolean | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`driver_${user.id}_is_online`);
        if (saved !== null) {
          localStorageStatus = saved === 'true';
          console.log('DriverDashboard: loadDriverStatus - read from localStorage:', localStorageStatus);
        }
      } catch (e) {
        console.error('DriverDashboard: loadDriverStatus - error reading from localStorage:', e);
      }
    }
    
    // إذا تم تحميل البيانات بالفعل في loadDriverProfile، لا نحتاج لإعادة التحميل
    if (driverProfile && 'is_online' in driverProfile) {
      // تحديث is_online فقط إذا كان موجوداً وليس null
      if (driverProfile.is_online !== undefined && driverProfile.is_online !== null) {
        // إذا كانت القيمة في localStorage هي true لكن القيمة في DB هي false/null، نحافظ على true
        if (localStorageStatus === true && driverProfile.is_online === false) {
          console.log('DriverDashboard: loadDriverStatus - localStorage says true but DB says false, keeping true');
          setIsOnline(true);
          lastKnownOnlineStatusRef.current = true;
        } else {
          setIsOnline(driverProfile.is_online);
          lastKnownOnlineStatusRef.current = driverProfile.is_online;
        }
      } else if (localStorageStatus === true) {
        // إذا كانت القيمة في DB null لكن localStorage يقول true، نحافظ على true
        console.log('DriverDashboard: loadDriverStatus - DB is null but localStorage says true, keeping true');
        setIsOnline(true);
        lastKnownOnlineStatusRef.current = true;
      }
      hasLoadedInitialStatusRef.current = true;
      setLoading(false); // تأكد من تعيين loading إلى false قبل return
      return;
    }
    
    try {
      // إضافة timeout لتجنب التعليق
      const statusPromise = supabase
        .from('profiles')
        .select('is_online')
        .eq('id', user.id)
        .single();
      
      const timeoutPromise = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Status fetch timeout' } }), 5000)
      );
      
      const result = await Promise.race([statusPromise, timeoutPromise]);
      const { data, error } = result;

      if (error && error.code === 'TIMEOUT') {
        console.warn('DriverDashboard: Status fetch timeout, using localStorage or current state');
        // في حالة timeout، نستخدم localStorage أو الحالة الحالية
        if (localStorageStatus !== null) {
          setIsOnline(localStorageStatus);
          lastKnownOnlineStatusRef.current = localStorageStatus;
        }
        hasLoadedInitialStatusRef.current = true;
        setLoading(false); // تأكد من تعيين loading إلى false قبل return
        return;
      }

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading driver status:', error);
      } else if (data) {
        console.log('DriverDashboard: loadDriverStatus - is_online from DB:', data.is_online, 'localStorage:', localStorageStatus, 'current isOnline:', isOnline);
        
        // إذا كانت القيمة في localStorage هي true لكن القيمة في DB هي false/null، نحافظ على true
        if (localStorageStatus === true && (data.is_online === false || data.is_online === null)) {
          console.log('DriverDashboard: loadDriverStatus - localStorage says true but DB says false/null, keeping true and updating DB');
          setIsOnline(true);
          lastKnownOnlineStatusRef.current = true;
          
          // محاولة تحديث قاعدة البيانات لتطابق localStorage
          try {
            await supabase
              .from('profiles')
              .update({ is_online: true })
              .eq('id', user.id);
            console.log('DriverDashboard: loadDriverStatus - updated DB to match localStorage');
          } catch (updateError) {
            console.error('DriverDashboard: loadDriverStatus - error updating DB:', updateError);
          }
        } else if (data.is_online !== undefined && data.is_online !== null) {
          // تحديث is_online فقط إذا كان موجوداً وليس null
          console.log('DriverDashboard: loadDriverStatus - updating isOnline to:', data.is_online);
          setIsOnline(data.is_online);
          lastKnownOnlineStatusRef.current = data.is_online;
          
          // تحديث localStorage لتطابق قاعدة البيانات
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try {
              localStorage.setItem(`driver_${user.id}_is_online`, String(data.is_online));
            } catch (e) {
              console.error('DriverDashboard: loadDriverStatus - error saving to localStorage:', e);
            }
          }
        } else if (localStorageStatus !== null) {
          // إذا كانت القيمة في DB null لكن localStorage لديه قيمة، نستخدم localStorage
          console.log('DriverDashboard: loadDriverStatus - DB is null, using localStorage:', localStorageStatus);
          setIsOnline(localStorageStatus);
          lastKnownOnlineStatusRef.current = localStorageStatus;
        } else {
          console.log('DriverDashboard: loadDriverStatus - is_online is null/undefined in both DB and localStorage, keeping current state');
        }
      } else {
        // لا توجد بيانات، نستخدم localStorage إذا كان متاحاً
        if (localStorageStatus !== null) {
          console.log('DriverDashboard: loadDriverStatus - no DB data, using localStorage:', localStorageStatus);
          setIsOnline(localStorageStatus);
          lastKnownOnlineStatusRef.current = localStorageStatus;
        }
      }
      hasLoadedInitialStatusRef.current = true;
      // إذا كان is_online null أو undefined، نحافظ على القيمة الحالية
    } catch (error) {
      console.error('Error loading driver status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWalletBalance = async () => {
    if (!user) {
      console.log('DriverDashboard: loadWalletBalance - no user');
      return;
    }

    try {
      console.log('DriverDashboard: Loading wallet balance for driver:', user.id);
      
      // استخدام Edge Function لتجاوز RLS (لأن المستخدم قد لا يكون لديه session نشط)
      const { data: walletResponse, error: walletError } = await supabase.functions.invoke('get-driver-wallet', {
        body: { driverId: user.id },
      });

      if (walletError) {
        console.error('DriverDashboard: Error calling get-driver-wallet function:', walletError);
        // Fallback: محاولة الاستعلام المباشر (قد لا يعمل بسبب RLS)
        const { data: walletData, error: directError } = await supabase
          .from('wallets')
          .select('amount')
          .eq('driver_id', user.id)
          .eq('type', 'earning');

        if (!directError && walletData && walletData.length > 0) {
          const balance = walletData.reduce((sum, item) => {
            const amount = typeof item.amount === 'string' ? parseFloat(item.amount) : (item.amount || 0);
            return sum + amount;
          }, 0);
          console.log('DriverDashboard: Using direct query fallback:', {
            entries: walletData.length,
            balance,
          });
          setWalletBalance(balance);
        }
        return;
      }

      if (walletResponse?.success) {
        const balance = walletResponse.balance || 0;
        console.log('DriverDashboard: Wallet balance loaded from Edge Function:', {
          balance,
          totalEarnings: walletResponse.totalEarnings,
          totalCommission: walletResponse.totalCommission,
          totalDeductions: walletResponse.totalDeductions,
          transactionsCount: walletResponse.transactions?.length || 0,
          previousBalance: walletBalance,
        });
        setWalletBalance(balance);
      } else {
        console.error('DriverDashboard: Edge Function returned error:', walletResponse?.error);
      }
    } catch (walletErr) {
      console.error('DriverDashboard: Exception loading wallet balance:', walletErr);
    }
  };

  const loadDriverProfile = async () => {
    if (!user) {
      console.log('DriverDashboard: loadDriverProfile - no user');
      setCheckingRegistration(false); // تأكد من تعيين checkingRegistration إلى false
      return;
    }
    
    // منع الاستدعاءات المتكررة
    if (isLoadingProfileRef.current) {
      console.log('DriverDashboard: loadDriverProfile - already loading, skipping');
      // لا نعيد تعيين checkingRegistration هنا لأن التحميل جارٍ بالفعل
      return;
    }
    
    console.log('DriverDashboard: loadDriverProfile - starting for user:', user.id);
    isLoadingProfileRef.current = true;
    setCheckingRegistration(true);
    try {
      // محاولة تحميل بيانات السائق مع معالجة الأخطاء
      // إذا كانت الأعمدة غير موجودة، نحاول جلب البيانات الأساسية فقط
      let profile: any = null;
      let error: any = null;

      try {
        // محاولة جلب جميع البيانات بما فيها الصور وحالة الموافقة وحالة الحساب
        // تحديد الأعمدة المطلوبة فقط لتحسين الأداء
        // إضافة timeout لتجنب التعليق
        const profilePromise = supabase
          .from('profiles')
          .select('full_name, phone, id_card_image_url, selfie_image_url, approval_status, registration_complete, status, is_online, instapay_number, cash_number')
          .eq('id', user.id)
          .single();
        
        const timeoutPromise = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Profile fetch timeout after 5 seconds' } }), 5000)
        );
        
        const result = await Promise.race([profilePromise, timeoutPromise]);
        profile = result.data;
        error = result.error;
        
        if (error?.code === 'TIMEOUT') {
          console.warn('DriverDashboard: Profile fetch timeout, trying basic fields only');
          throw new Error('TIMEOUT');
        }
      } catch (columnError: any) {
        // إذا فشل بسبب timeout أو أعمدة مفقودة، نحاول جلب البيانات الأساسية فقط
        console.warn('DriverDashboard: Columns missing or timeout, trying basic fields only:', columnError);
        try {
          const basicPromise = supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single();
          
          const basicTimeoutPromise = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Basic profile fetch timeout' } }), 3000)
          );
          
          const basicResult = await Promise.race([basicPromise, basicTimeoutPromise]);
        profile = basicResult.data;
        error = basicResult.error;
          
        // إضافة حقول الصور كقيم null
        if (profile) {
          profile.id_card_image_url = null;
          profile.selfie_image_url = null;
          }
        } catch (basicError) {
          console.error('DriverDashboard: Basic profile fetch also failed:', basicError);
          error = { code: 'FETCH_ERROR', message: 'Failed to fetch profile data' };
        }
      }

      console.log('DriverDashboard: Profile query result:', { profile, error: error?.message });

      if (error) {
        if (error.code === 'PGRST116') {
          // لا يوجد ملف - هذا طبيعي للمستخدمين الجدد
          console.log('DriverDashboard: No profile found for driver');
          setDriverProfile(null);
        } else if (error.code === '42703') {
          // عمود غير موجود - نحتاج لتشغيل SQL script
          console.error('DriverDashboard: Database columns missing. Please run fix_driver_columns.sql in Supabase SQL Editor');
          // عرض ملف تعريف أساسي بدون الصور
          const basicResult = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', user.id)
            .single();
          if (basicResult.data) {
            setDriverProfile({
              ...basicResult.data,
              id_card_image_url: undefined,
              selfie_image_url: undefined,
            });
          } else {
            setDriverProfile(null);
          }
        } else {
          console.error('DriverDashboard: Error loading driver profile:', error);
          setDriverProfile(null);
        }
      } else if (profile) {
        console.log('DriverDashboard: Driver profile loaded:', {
          hasName: !!profile.full_name,
          hasPhone: !!profile.phone,
          hasIdCard: !!profile.id_card_image_url,
          hasSelfie: !!profile.selfie_image_url,
          approvalStatus: profile.approval_status,
          previousStatus: previousApprovalStatusRef.current,
          profile: profile,
        });
        
        // التحقق من تغيير الحالة من pending إلى approved
        const previousStatus = previousApprovalStatusRef.current;
        const currentStatus = profile.approval_status;
        
        // فقط إذا كانت الحالة السابقة pending والحالة الحالية approved ولم يتم عرض الرسالة من قبل
        if (
          previousStatus === 'pending' &&
          currentStatus === 'approved' &&
          profile.registration_complete &&
          !hasShownApprovalAlertRef.current
        ) {
          console.log('DriverDashboard: ✅ Approval detected in loadDriverProfile!');
          // تمت الموافقة! عرض الرسالة مرة واحدة فقط
          hasShownApprovalAlertRef.current = true;
          await showSimpleAlert(
            '🎉 تهانينا!',
            'تمت الموافقة على تسجيلك بنجاح!\n\nابدأ رحلاتك الآن واستقبل الطلبات.',
            'success'
          );
        } else if (previousStatus === 'pending' && currentStatus === 'rejected') {
          console.log('DriverDashboard: ❌ Rejection detected in loadDriverProfile!');
          await showSimpleAlert('تم رفض طلبك', 'يرجى التواصل مع الإدارة', 'warning');
        }
        
        // حفظ الحالة الحالية للمقارنة في المرة القادمة (فقط إذا كانت موجودة)
        if (currentStatus) {
          previousApprovalStatusRef.current = currentStatus;
        }
        setDriverProfile(profile);

        // جلب معلومات الدفع
        setInstapayNumber(profile.instapay_number || '');
        setCashNumber(profile.cash_number || '');

        // جلب رصيد المحفظة
        await loadWalletBalance();
        // تحديث is_online فقط إذا كان موجوداً وليس null
        // هذا يمنع إعادة تعيين الحالة إلى false/null عند تحميل الصفحة
        console.log('DriverDashboard: is_online from profile:', profile.is_online, 'current isOnline state:', isOnline, 'lastKnownOnlineStatusRef:', lastKnownOnlineStatusRef.current);
        
        // قراءة الحالة من localStorage أولاً (إذا كانت متاحة)
        let localStorageStatus: boolean | null = null;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try {
            const saved = localStorage.getItem(`driver_${user.id}_is_online`);
            if (saved !== null) {
              localStorageStatus = saved === 'true';
              console.log('DriverDashboard: loadDriverProfile - read from localStorage:', localStorageStatus);
            }
          } catch (e) {
            console.error('DriverDashboard: loadDriverProfile - error reading from localStorage:', e);
          }
        }
        
        if (profile.is_online !== undefined && profile.is_online !== null) {
          // إذا كانت القيمة في localStorage هي true لكن القيمة في DB هي false، نحافظ على true
          if (localStorageStatus === true && profile.is_online === false) {
            console.log('DriverDashboard: loadDriverProfile - localStorage says true but DB says false, keeping true');
            setIsOnline(true);
            lastKnownOnlineStatusRef.current = true;
            
            // محاولة تحديث قاعدة البيانات لتطابق localStorage
            try {
              await supabase
                .from('profiles')
                .update({ is_online: true })
                .eq('id', user.id);
              console.log('DriverDashboard: loadDriverProfile - updated DB to match localStorage');
            } catch (updateError) {
              console.error('DriverDashboard: loadDriverProfile - error updating DB:', updateError);
            }
          } else if (isOnline === true && profile.is_online === false && !hasLoadedInitialStatusRef.current) {
            // إذا كانت القيمة الحالية true والقيمة من قاعدة البيانات false ولم نكن قد جلبنا الحالة الأولية بعد،
            // قد يكون هناك تأخير في التحديث، لذلك نحافظ على القيمة الحالية
            console.log('DriverDashboard: isOnline is true but DB has false - possible sync delay, keeping current state');
            // لا نحدث isOnline، نحافظ على القيمة الحالية
          } else {
            console.log('DriverDashboard: Updating isOnline to:', profile.is_online);
            setIsOnline(profile.is_online);
            lastKnownOnlineStatusRef.current = profile.is_online;
            
            // تحديث localStorage لتطابق قاعدة البيانات
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              try {
                localStorage.setItem(`driver_${user.id}_is_online`, String(profile.is_online));
              } catch (e) {
                console.error('DriverDashboard: loadDriverProfile - error saving to localStorage:', e);
              }
            }
          }
        } else if (localStorageStatus === true) {
          // إذا كانت القيمة في DB null لكن localStorage يقول true، نحافظ على true
          console.log('DriverDashboard: loadDriverProfile - DB is null but localStorage says true, keeping true');
          setIsOnline(true);
          lastKnownOnlineStatusRef.current = true;
          
          // محاولة تحديث قاعدة البيانات لتطابق localStorage
          try {
            await supabase
              .from('profiles')
              .update({ is_online: true })
              .eq('id', user.id);
            console.log('DriverDashboard: loadDriverProfile - updated DB to match localStorage');
          } catch (updateError) {
            console.error('DriverDashboard: loadDriverProfile - error updating DB:', updateError);
          }
        } else if (localStorageStatus !== null) {
          // إذا كانت القيمة في DB null لكن localStorage لديه قيمة، نستخدم localStorage
          console.log('DriverDashboard: loadDriverProfile - DB is null, using localStorage:', localStorageStatus);
          setIsOnline(localStorageStatus);
          lastKnownOnlineStatusRef.current = localStorageStatus;
        } else {
          console.log('DriverDashboard: is_online is null/undefined, keeping current state:', isOnline);
        }
        // إذا كان is_online null أو undefined، نحافظ على القيمة الحالية
        
        // التحقق من الموافقة الجديدة
        if (profile.approval_status === 'approved' && !registrationComplete) {
          setShowApprovalAlert(true);
        }
      } else {
        console.log('DriverDashboard: No profile data returned');
        setDriverProfile(null);
      }

      // التحقق من إكمال التسجيل (مع timeout لتجنب التعليق)
      try {
        const registrationCheckPromise = isRegistrationComplete(user.id);
        const timeoutPromise = new Promise<boolean>((resolve) => 
          setTimeout(() => resolve(false), 5000) // timeout بعد 5 ثوان
        );
        const isComplete = await Promise.race([registrationCheckPromise, timeoutPromise]);
      console.log('DriverDashboard: Registration complete status:', isComplete);
      setRegistrationComplete(isComplete);
      } catch (regError) {
        console.error('DriverDashboard: Error checking registration completion:', regError);
        // في حالة الخطأ، نعتبر التسجيل غير مكتمل
        setRegistrationComplete(false);
      }
    } catch (error) {
      console.error('DriverDashboard: Error loading driver profile:', error);
      setDriverProfile(null);
    } finally {
      setCheckingRegistration(false);
      isLoadingProfileRef.current = false;
      console.log('DriverDashboard: loadDriverProfile - completed');
    }
  };

  const toggleOnlineStatus = async () => {
    if (!user) return;
    
    // التحقق من الموافقة قبل السماح بالتفعيل
    if (driverProfile?.approval_status !== 'approved') {
      await showSimpleAlert(
        '⏳ في انتظار الموافقة',
        'لا يمكنك تفعيل حالتك حتى يتم الموافقة على تسجيلك من قبل المدير.\n\nيرجى الانتظار حتى يتم مراجعة طلبك.',
        'warning'
      );
      return;
    }

    // التأكد من إكمال التسجيل
    if (!registrationComplete) {
      await showSimpleAlert(
        '⚠️ التسجيل غير مكتمل',
        'يرجى إكمال بياناتك الشخصية أولاً.',
        'warning'
      );
      return;
    }
    
    setToggling(true);
    try {
      const newStatus = !isOnline;
      console.log('DriverDashboard: toggleOnlineStatus - changing from', isOnline, 'to', newStatus);
      
      // استخدام Edge Function لتحديث is_online (لتجاوز RLS)
      console.log('DriverDashboard: toggleOnlineStatus - calling Edge Function update-driver-profile...');
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-driver-profile', {
        body: {
          userId: user.id,
          is_online: newStatus,
        },
      });

      console.log('DriverDashboard: toggleOnlineStatus - Edge Function response:', {
        hasData: !!edgeFunctionData,
        success: edgeFunctionData?.success,
        hasError: !!edgeFunctionError,
        errorMessage: edgeFunctionError?.message || edgeFunctionData?.error,
        profileIsOnline: edgeFunctionData?.profile?.is_online,
      });

      if (edgeFunctionError) {
        console.error('DriverDashboard: toggleOnlineStatus - Edge Function error:', edgeFunctionError);
        throw edgeFunctionError;
      }

      if (!edgeFunctionData || !edgeFunctionData.success) {
        console.error('DriverDashboard: toggleOnlineStatus - Edge Function returned error:', edgeFunctionData?.error);
        throw new Error(edgeFunctionData?.error || 'فشل تحديث الحالة');
      }

      // التأكد من أن القيمة تم حفظها في قاعدة البيانات
      const updatedIsOnline = edgeFunctionData.profile?.is_online;
      if (updatedIsOnline === newStatus) {
        console.log('DriverDashboard: toggleOnlineStatus - confirmed saved to DB:', updatedIsOnline);
        // حفظ الحالة محلياً
        setIsOnline(newStatus);
        lastKnownOnlineStatusRef.current = newStatus;
        
        // حفظ في localStorage للاستمرارية بعد إعادة التحميل
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try {
            localStorage.setItem(`driver_${user.id}_is_online`, String(newStatus));
            console.log('DriverDashboard: toggleOnlineStatus - saved to localStorage:', newStatus);
          } catch (e) {
            console.error('DriverDashboard: toggleOnlineStatus - error saving to localStorage:', e);
          }
        }
      } else {
        console.error('DriverDashboard: toggleOnlineStatus - value mismatch! Expected:', newStatus, 'Got:', updatedIsOnline);
        throw new Error('فشل التحقق من حفظ الحالة في قاعدة البيانات');
      }

      if (!newStatus) {
        // إذا تم الإيقاف، نتوقف عن تتبع الموقع
        setCurrentLocation(null);
        // حذف موقع السائق من قاعدة البيانات عند الإيقاف
        if (user) {
          await supabase
            .from('driver_locations')
            .delete()
            .eq('driver_id', user.id)
            .is('order_id', null);
        }
      }
    } catch (error: any) {
      console.error('Error toggling online status:', error);
      await showSimpleAlert('خطأ', 'فشل تحديث الحالة. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      setToggling(false);
    }
  };

  // استقبال الموقع من CurrentLocationDisplay
  const handleLocationUpdate = (location: { lat: number; lon: number; address: string } | null) => {
    if (!location || !user || !isOnline) return;

    setCurrentLocation(location);
    
    // تحديث الموقع في قاعدة البيانات (بدون order_id)
    updateDriverLocationInDB(location);
  };

  const updateDriverLocationInDB = async (location: { lat: number; lon: number; address: string }) => {
    if (!user || !isOnline) return;

    try {
      // استخدام Edge Function لتحديث الموقع (لتجاوز RLS)
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-driver-location', {
        body: {
          driverId: user.id,
          latitude: location.lat,
          longitude: location.lon,
          orderId: null, // بدون طلب نشط
        },
      });

      if (edgeFunctionError) {
        console.error('Error updating driver location via Edge Function:', edgeFunctionError);
        return;
      }

      if (!edgeFunctionData || !edgeFunctionData.success) {
        console.error('Edge Function returned error:', edgeFunctionData?.error);
        return;
      }

      console.log('✅ Driver location updated in DB:', { lat: location.lat, lon: location.lon, address: location.address });
    } catch (error: any) {
      console.error('Error updating driver location in DB:', error);
    }
  };

  const handleLogout = async () => {
    await showAlert('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', {
      type: 'question',
      confirmText: 'تسجيل الخروج',
      cancelText: 'إلغاء',
      onConfirm: () => {
        performLogout();
      },
    });
  };

  const performLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } catch (error: any) {
      console.error('Error during logout:', error);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } finally {
      setLoggingOut(false);
    }
  };

  console.log('DriverDashboard: Render - loading:', loading, 'checkingRegistration:', checkingRegistration, 'user:', user?.id, 'driverProfile:', !!driverProfile, 'registrationComplete:', registrationComplete);

  if (loading || checkingRegistration) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.dashboard')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* قسم طلب جديد */}
        <View style={styles.newOrderSection}>
          <TouchableOpacity
            style={styles.newOrderCard}
            onPress={() => setShowOrderTypeModal(true)}
          >
            <Ionicons name="add-circle" size={32} color="#007AFF" />
            <View style={styles.newOrderTextContainer}>
              <Text style={styles.newOrderTitle}>طلب جديد</Text>
              <Text style={styles.newOrderDescription}>إنشاء طلب توصيل جديد</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Modal لاختيار نوع الطلب */}
        <Modal
          visible={showOrderTypeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowOrderTypeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>اختر نوع الطلب</Text>
                <TouchableOpacity
                  onPress={() => setShowOrderTypeModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.orderTypeOption}
                onPress={() => {
                  setShowOrderTypeModal(false);
                  router.push('/orders/deliver-package');
                }}
              >
                <View style={[styles.orderTypeIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="cube" size={32} color="#007AFF" />
                </View>
                <View style={styles.orderTypeTextContainer}>
                  <Text style={styles.orderTypeOptionTitle}>{t('customer.deliverPackage')}</Text>
                  <Text style={styles.orderTypeOptionDescription}>
                    توصيل طرد من موقع إلى آخر
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.orderTypeOption}
                onPress={() => {
                  setShowOrderTypeModal(false);
                  router.push('/orders/outside-order');
                }}
              >
                <View style={[styles.orderTypeIcon, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="cart" size={32} color="#34C759" />
                </View>
                <View style={styles.orderTypeTextContainer}>
                  <Text style={styles.orderTypeOptionTitle}>{t('customer.outsideOrder')}</Text>
                  <Text style={styles.orderTypeOptionDescription}>
                    طلب شراء من متجر معين
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#999" />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* زر التحكم في الحالة */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusInfo}>
              <Ionicons 
                name={(isOnline ?? false) ? "radio-button-on" : "radio-button-off"} 
                size={24} 
                color={(isOnline ?? false) ? "#34C759" : "#999"} 
              />
              <Text style={styles.statusLabel}>
                {(isOnline ?? false) ? 'نشط الآن' : 'غير نشط'}
              </Text>
            </View>
            
            {toggling ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Switch
                value={isOnline ?? false}
                onValueChange={toggleOnlineStatus}
                trackColor={{ false: '#e0e0e0', true: '#34C759' }}
                thumbColor={(isOnline ?? false) ? '#fff' : '#f4f3f4'}
                ios_backgroundColor="#e0e0e0"
                disabled={toggling || driverProfile?.approval_status !== 'approved' || !registrationComplete || driverProfile?.status === 'suspended'}
              />
            )}
          </View>

          {/* رسالة تحذيرية إذا كان الحساب معلق */}
          {driverProfile?.status === 'suspended' && (
            <View style={[styles.statusMessage, styles.suspendedMessage]}>
              <Ionicons name="alert-circle" size={20} color="#FF3B30" />
              <Text style={[styles.statusMessageText, styles.suspendedMessageText]}>
                ⚠️ تم تعليق حسابك. يرجى التواصل مع الإدارة لمزيد من المعلومات.
              </Text>
            </View>
          )}

          {/* رسالة توضيحية إذا لم يتم الموافقة */}
          {driverProfile?.approval_status !== 'approved' && driverProfile?.status !== 'suspended' && (
            <View style={styles.statusMessage}>
              <Ionicons name="information-circle" size={16} color="#FF9500" />
              <Text style={styles.statusMessageText}>
                {driverProfile?.approval_status === 'pending' && registrationComplete
                  ? 'في انتظار الموافقة على تسجيلك لتفعيل حالتك'
                  : driverProfile?.approval_status === 'rejected' && registrationComplete
                  ? 'تم رفض طلبك. يرجى التواصل مع الإدارة'
                  : 'يرجى إكمال التسجيل أولاً'}
              </Text>
            </View>
          )}

          {isOnline && (
            <View style={styles.locationContainer}>
              <CurrentLocationDisplay
                onLocationUpdate={handleLocationUpdate}
              />
            </View>
          )}
        </View>

        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>مرحباً بك، السائق</Text>
          <Text style={styles.subText}>
            {driverProfile?.status === 'suspended'
              ? '⚠️ تم تعليق حسابك. يرجى التواصل مع الإدارة'
              : driverProfile?.approval_status === 'approved' && registrationComplete
              ? (isOnline 
                  ? 'أنت نشط الآن ويمكنك استقبال الطلبات' 
                  : 'قم بتفعيل حالتك لبدء استقبال الطلبات')
              : driverProfile?.approval_status === 'pending' && registrationComplete
              ? 'في انتظار الموافقة على تسجيلك من قبل المدير'
              : driverProfile?.approval_status === 'rejected' && registrationComplete
              ? 'تم رفض طلبك. يرجى التواصل مع الإدارة'
              : 'يرجى إكمال التسجيل أولاً'}
          </Text>
        </View>

        {/* قسم الإشعارات */}
        <NotificationCard />

        {/* قسم إكمال التسجيل - يظهر إذا لم يكمل التسجيل أو لا توجد بيانات */}
        {(!registrationComplete || !driverProfile) && (
          <TouchableOpacity
            style={styles.registrationCard}
            onPress={() => {
              const identifier = driverProfile?.phone || user?.phone || user?.email || '';
              const paramName = driverProfile?.phone || user?.phone ? 'phone' : 'email';
              router.push(`/(auth)/complete-registration/driver?${paramName}=${encodeURIComponent(identifier)}`);
            }}
          >
            <View style={styles.registrationHeader}>
              <Ionicons name="warning" size={24} color="#FF9500" />
              <Text style={styles.registrationTitle}>إكمال التسجيل</Text>
            </View>
            <Text style={styles.registrationText}>
              {!driverProfile 
                ? 'يرجى إكمال بياناتك الشخصية ورفع المستندات المطلوبة'
                : 'يرجى إكمال بياناتك الشخصية ورفع المستندات المطلوبة'}
            </Text>
          </TouchableOpacity>
        )}

        {/* قسم انتظار المراجعة - يظهر فقط بعد إكمال التسجيل */}
        {driverProfile?.approval_status === 'pending' && registrationComplete && (
          <View style={styles.pendingReviewCard}>
            <View style={styles.pendingReviewHeader}>
              <Ionicons name="time" size={24} color="#FF9500" />
              <Text style={styles.pendingReviewTitle}>في انتظار المراجعة</Text>
            </View>
            <Text style={styles.pendingReviewText}>
              تم إرسال طلبك للمراجعة! 🕐{'\n'}
              سيقوم المدير بمراجعة بياناتك والمستندات المرفوعة.{'\n'}
              ستتلقى إشعاراً عند الموافقة على طلبك.
            </Text>
          </View>
        )}

        {/* قسم الرفض - يظهر فقط بعد إكمال التسجيل */}
        {driverProfile?.approval_status === 'rejected' && registrationComplete && (
          <View style={styles.rejectedCard}>
            <View style={styles.rejectedHeader}>
              <Ionicons name="close-circle" size={24} color="#FF3B30" />
              <Text style={styles.rejectedTitle}>تم رفض طلبك</Text>
            </View>
            <Text style={styles.rejectedText}>
              للأسف، تم رفض طلب التسجيل الخاص بك.{'\n'}
              يرجى التواصل مع الإدارة لمزيد من المعلومات.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                const identifier = driverProfile?.phone || user?.phone || user?.email || '';
                const paramName = driverProfile?.phone || user?.phone ? 'phone' : 'email';
                router.push(`/(auth)/complete-registration/driver?${paramName}=${encodeURIComponent(identifier)}`);
              }}
            >
              <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* قسم بيانات السائق - يظهر دائماً إذا كان هناك بيانات */}
        {driverProfile && (
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <Ionicons name="person-circle" size={24} color="#007AFF" />
              <Text style={styles.profileTitle}>بياناتي الشخصية</Text>
              <TouchableOpacity
                onPress={() => {
                  const identifier = driverProfile?.phone || user?.phone || user?.email || '';
                  const paramName = driverProfile?.phone || user?.phone ? 'phone' : 'email';
                  router.push(`/(auth)/complete-registration/driver?${paramName}=${encodeURIComponent(identifier)}`);
                }}
                style={styles.editButton}
              >
                <Ionicons name="create-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.profileInfo}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>الاسم الكامل:</Text>
                <Text style={styles.profileValue}>{driverProfile.full_name || 'غير محدد'}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>رقم التليفون:</Text>
                <Text style={styles.profileValue}>{driverProfile.phone || 'غير محدد'}</Text>
              </View>
            </View>

            {/* عرض الصور المرفوعة */}
            <View style={styles.imagesSection}>
              <Text style={styles.imagesSectionTitle}>المستندات المرفوعة</Text>
              
              <View style={styles.imagesRow}>
                <View style={styles.imageItem}>
                  <Text style={styles.imageLabel}>صورة البطاقة</Text>
                  {driverProfile.id_card_image_url ? (
                    <Image
                      source={{ uri: driverProfile.id_card_image_url }}
                      style={styles.uploadedImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.noImagePlaceholder}>
                      <Ionicons name="document-outline" size={32} color="#999" />
                      <Text style={styles.noImageText}>لم يتم الرفع</Text>
                    </View>
                  )}
                </View>

                <View style={styles.imageItem}>
                  <Text style={styles.imageLabel}>صورة السيلفي</Text>
                  {driverProfile.selfie_image_url ? (
                    <Image
                      source={{ uri: driverProfile.selfie_image_url }}
                      style={styles.uploadedImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.noImagePlaceholder}>
                      <Ionicons name="person-outline" size={32} color="#999" />
                      <Text style={styles.noImageText}>لم يتم الرفع</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* قسم المحفظة وطرق الدفع */}
        {driverProfile && (
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <Ionicons name="wallet" size={24} color="#007AFF" />
              <Text style={styles.profileTitle}>المحفظة وطرق الدفع</Text>
              <TouchableOpacity
                onPress={() => setEditingPaymentLinks(!editingPaymentLinks)}
                style={styles.editButton}
              >
                <Ionicons 
                  name={editingPaymentLinks ? "checkmark" : "pencil"} 
                  size={20} 
                  color="#007AFF" 
                />
              </TouchableOpacity>
            </View>

            <View style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <Ionicons name="wallet" size={24} color="#34C759" />
                <Text style={styles.walletTitle}>رصيد المحفظة</Text>
              </View>
              <Text style={styles.walletBalance}>
                {walletBalance.toFixed(2)} جنيه
              </Text>
              <Text style={styles.walletSubtext}>
                الرصيد المستحق من الرحلات المكتملة
              </Text>
            </View>

            <View style={styles.socialLinksCard}>
              <View style={styles.socialLinkRow}>
                <View style={styles.socialLinkHeader}>
                  <Ionicons name="card" size={20} color="#007AFF" />
                  <Text style={styles.socialLinkLabel}>انستاباي</Text>
                </View>
                {editingPaymentLinks ? (
                  <TextInput
                    style={styles.socialLinkInput}
                    value={instapayNumber}
                    onChangeText={setInstapayNumber}
                    placeholder="رقم انستاباي"
                    placeholderTextColor="#999"
                    textAlign="right"
                    keyboardType="numeric"
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (instapayNumber && Platform.OS === 'web' && typeof window !== 'undefined') {
                        navigator.clipboard?.writeText(instapayNumber);
                        showSimpleAlert('نجح', 'تم نسخ رقم انستاباي', 'success');
                      }
                    }}
                    disabled={!instapayNumber}
                  >
                    <Text style={[
                      styles.socialLinkValue,
                      !instapayNumber && styles.socialLinkValueEmpty
                    ]}>
                      {instapayNumber || 'غير محدد'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.socialLinkRow}>
                <View style={styles.socialLinkHeader}>
                  <Ionicons name="cash" size={20} color="#FF9500" />
                  <Text style={styles.socialLinkLabel}>كاش</Text>
                </View>
                {editingPaymentLinks ? (
                  <TextInput
                    style={styles.socialLinkInput}
                    value={cashNumber}
                    onChangeText={setCashNumber}
                    placeholder="رقم كاش أو رابط"
                    placeholderTextColor="#999"
                    textAlign="right"
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (cashNumber) {
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          if (cashNumber.startsWith('http')) {
                            window.open(cashNumber, '_blank');
                          } else {
                            // نسخ الرقم
                            navigator.clipboard?.writeText(cashNumber);
                            showSimpleAlert('نجح', 'تم نسخ الرقم', 'success');
                          }
                        }
                      }
                    }}
                    disabled={!cashNumber}
                  >
                    <Text style={[
                      styles.socialLinkValue,
                      !cashNumber && styles.socialLinkValueEmpty
                    ]}>
                      {cashNumber || 'غير محدد'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {editingPaymentLinks && (
              <TouchableOpacity
                style={styles.saveSocialButton}
                onPress={async () => {
                  try {
                    const { error } = await supabase
                      .from('profiles')
                      .update({
                        instapay_number: instapayNumber || null,
                        cash_number: cashNumber || null,
                      })
                      .eq('id', user?.id);

                    if (error) throw error;
                    setEditingPaymentLinks(false);
                    showSimpleAlert('نجح', 'تم حفظ البيانات بنجاح', 'success');
                  } catch (error: any) {
                    showSimpleAlert('خطأ', error.message || 'فشل حفظ البيانات', 'error');
                  }
                }}
              >
                <Text style={styles.saveSocialButtonText}>حفظ</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={32} color="#34C759" />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>رحلات مكتملة</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash" size={32} color="#FF9500" />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>الرصيد المستحق</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
          disabled={loggingOut}
        >
          <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
          <Text style={styles.logoutText}>
            {t('auth.logout')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: tabBarBottomPadding,
  },
  header: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 255, 255, 0.95)' : '#fff',
    padding: responsive.getResponsiveHeaderPadding(),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  content: {
    padding: responsive.getResponsivePadding(),
    paddingBottom: responsive.getResponsivePadding() + 20,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  newOrderSection: {
    marginBottom: 20,
  },
  newOrderCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 6,
    }),
  },
  newOrderTextContainer: {
    flex: 1,
  },
  newOrderTitle: {
    fontSize: responsive.getResponsiveFontSize(19),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  newOrderDescription: {
    fontSize: responsive.getResponsiveFontSize(15),
    color: '#8E8E93',
    lineHeight: 22,
    fontWeight: '400',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  locationContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0,
  },
  statusMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFF4E6',
    borderRadius: 8,
  },
  statusMessageText: {
    fontSize: 12,
    color: '#FF9500',
    flex: 1,
    textAlign: 'right',
  },
  suspendedMessage: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  suspendedMessageText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  welcomeCard: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    padding: 28,
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#007AFF',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
    }),
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'right',
  },
  subText: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'right',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 6,
    }),
  },
  statNumber: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 12,
    letterSpacing: 0.3,
  },
  statLabel: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '400',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#FF3B30',
    gap: 8,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 18,
    fontWeight: '600',
  },
  registrationCard: {
    backgroundColor: '#FFF4E6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  registrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  registrationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9500',
  },
  registrationText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  profileTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
  },
  editButton: {
    padding: 4,
  },
  profileInfo: {
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  profileLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  profileValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  imagesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  imagesSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'right',
  },
  imagesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  imageItem: {
    flex: 1,
  },
  imageLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  uploadedImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  noImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  noImageText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  pendingReviewCard: {
    backgroundColor: '#FFF4E6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  pendingReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pendingReviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9500',
  },
  pendingReviewText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  rejectedCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  rejectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  rejectedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  rejectedText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalCloseButton: {
    padding: 4,
  },
  orderTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    marginBottom: 12,
    gap: 16,
  },
  orderTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderTypeTextContainer: {
    flex: 1,
  },
  orderTypeOptionTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  orderTypeOptionDescription: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  walletCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  walletTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  walletBalance: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    color: '#34C759',
    marginBottom: 4,
  },
  walletSubtext: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  socialLinksCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  socialLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  socialLinkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  socialLinkLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  socialLinkValue: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
    fontWeight: '500',
  },
  socialLinkValueEmpty: {
    color: '#999',
    fontStyle: 'italic',
  },
  socialLinkInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    fontSize: responsive.getResponsiveFontSize(14),
    textAlign: 'right',
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  saveSocialButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveSocialButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});

// This will be set in the component
