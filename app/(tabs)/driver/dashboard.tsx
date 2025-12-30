import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
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
  
  const [isOnline, setIsOnline] = useState(false);
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
  } | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [showApprovalAlert, setShowApprovalAlert] = useState(false);
  const previousApprovalStatusRef = useRef<'pending' | 'approved' | 'rejected' | undefined>(undefined);
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

  useEffect(() => {
    console.log('DriverDashboard: useEffect triggered, user:', user?.id);
    if (user) {
      loadDriverStatus();
      loadDriverProfile();
      
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
      
      return () => {
        // تنظيف عند unmount
        if (locationIntervalRef.current) {
          clearInterval(locationIntervalRef.current);
          locationIntervalRef.current = null;
        }
        profileChannel.unsubscribe();
      };
    }
  }, [user]);

  // إعادة تحميل البيانات عند العودة للصفحة
  useFocusEffect(
    React.useCallback(() => {
      console.log('DriverDashboard: useFocusEffect triggered, user:', user?.id);
      if (user) {
        loadDriverProfile();
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

        // إذا تغيرت الحالة من pending إلى approved
        if (
          profile?.approval_status === 'approved' &&
          profile?.registration_complete
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
    }, 5000); // كل 5 ثواني (أسرع)

    return () => {
      console.log('DriverDashboard: Stopping approval polling');
      clearInterval(checkApprovalInterval);
    };
  }, [user, driverProfile?.approval_status, registrationComplete]);

  const loadDriverStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_online')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading driver status:', error);
      } else if (data) {
        setIsOnline(data.is_online || false);
      }
    } catch (error) {
      console.error('Error loading driver status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDriverProfile = async () => {
    if (!user) {
      console.log('DriverDashboard: loadDriverProfile - no user');
      return;
    }
    
    console.log('DriverDashboard: loadDriverProfile - starting for user:', user.id);
    setCheckingRegistration(true);
    try {
      // محاولة تحميل بيانات السائق مع معالجة الأخطاء
      // إذا كانت الأعمدة غير موجودة، نحاول جلب البيانات الأساسية فقط
      let profile: any = null;
      let error: any = null;

      try {
        // محاولة جلب جميع البيانات بما فيها الصور وحالة الموافقة وحالة الحساب
        const result = await supabase
          .from('profiles')
          .select('full_name, phone, id_card_image_url, selfie_image_url, approval_status, registration_complete, status')
          .eq('id', user.id)
          .single();
        profile = result.data;
        error = result.error;
      } catch (columnError: any) {
        // إذا فشل بسبب أعمدة مفقودة، نحاول جلب البيانات الأساسية فقط
        console.warn('DriverDashboard: Columns missing, trying basic fields only:', columnError);
        const basicResult = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single();
        profile = basicResult.data;
        error = basicResult.error;
        // إضافة حقول الصور كقيم null
        if (profile) {
          profile.id_card_image_url = null;
          profile.selfie_image_url = null;
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
        
        // فقط إذا كانت الحالة السابقة pending والحالة الحالية مختلفة
        if (
          previousStatus === 'pending' &&
          currentStatus === 'approved' &&
          profile.registration_complete
        ) {
          console.log('DriverDashboard: ✅ Approval detected in loadDriverProfile!');
          // تمت الموافقة!
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
        
        // التحقق من الموافقة الجديدة
        if (profile.approval_status === 'approved' && !registrationComplete) {
          setShowApprovalAlert(true);
        }
      } else {
        console.log('DriverDashboard: No profile data returned');
        setDriverProfile(null);
      }

      // التحقق من إكمال التسجيل
      const isComplete = await isRegistrationComplete(user.id);
      console.log('DriverDashboard: Registration complete status:', isComplete);
      setRegistrationComplete(isComplete);
      
      // إذا تمت الموافقة، عرض رسالة التهنئة
      if (profile?.approval_status === 'approved' && isComplete && !registrationComplete) {
        setTimeout(async () => {
          await showSimpleAlert(
            '🎉 تهانينا!',
            'تمت الموافقة على تسجيلك بنجاح!\n\nابدأ رحلاتك الآن واستقبل الطلبات.',
            'success'
          );
          setShowApprovalAlert(false);
        }, 500);
      }
    } catch (error) {
      console.error('DriverDashboard: Error loading driver profile:', error);
      setDriverProfile(null);
    } finally {
      setCheckingRegistration(false);
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
      
      // تحديث حالة السائق في قاعدة البيانات
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_online: newStatus })
        .eq('id', user.id);

      if (updateError) {
        // إذا لم يكن الحقل موجوداً، نحاول إضافته أولاً
        if (updateError.code === '42703') {
          console.log('⚠️ is_online field does not exist, attempting to add it...');
          setToggling(false);
          return;
        }
        throw updateError;
      }

      setIsOnline(newStatus);

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
      // البحث عن سجل موجود بدون order_id
      const { data: existingLocation, error: findError } = await supabase
        .from('driver_locations')
        .select('id')
        .eq('driver_id', user.id)
        .is('order_id', null)
        .maybeSingle();
      
      if (findError && findError.code !== 'PGRST116') {
        // PGRST116 = no rows returned (هذا طبيعي)
        console.error('Error finding existing location:', findError);
      }

      if (existingLocation) {
        // تحديث السجل الموجود
        const { error: locationError } = await supabase
          .from('driver_locations')
          .update({
            latitude: location.lat,
            longitude: location.lon,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingLocation.id);

        if (locationError) {
          console.error('Error updating driver location:', locationError);
          return;
        }
      } else {
        // إضافة سجل جديد
        const { error: locationError } = await supabase
          .from('driver_locations')
          .insert({
            driver_id: user.id,
            order_id: null, // بدون طلب نشط
            latitude: location.lat,
            longitude: location.lon,
            updated_at: new Date().toISOString(),
          });

        if (locationError) {
          console.error('Error inserting driver location:', locationError);
          return;
        }
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
                name={isOnline ? "radio-button-on" : "radio-button-off"} 
                size={24} 
                color={isOnline ? "#34C759" : "#999"} 
              />
              <Text style={styles.statusLabel}>
                {isOnline ? 'نشط الآن' : 'غير نشط'}
              </Text>
            </View>
            
            {toggling ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={toggleOnlineStatus}
                trackColor={{ false: '#e0e0e0', true: '#34C759' }}
                thumbColor={isOnline ? '#fff' : '#f4f3f4'}
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
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  newOrderTextContainer: {
    flex: 1,
  },
  newOrderTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  newOrderDescription: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
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
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
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
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
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
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 12,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
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
});

// This will be set in the component
