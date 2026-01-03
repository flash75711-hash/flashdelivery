import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { createNotification, notifyAllAdmins } from '@/lib/notifications';
import { showToast, showSimpleAlert, showConfirm } from '@/lib/alert';

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  id_card_image_url?: string;
  selfie_image_url?: string;
  created_at?: string;
}

export default function AdminDriversScreen() {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [showDriverDetailsModal, setShowDriverDetailsModal] = useState(false);
  const [processingDriverId, setProcessingDriverId] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    console.log('AdminDrivers: useEffect triggered');
    loadDrivers();
    // التحقق من أن المستخدم الحالي هو admin
    checkAdminStatus();
  }, []);

  useEffect(() => {
    // إعادة تحميل السائقين عند تغيير الفلتر
    console.log('AdminDrivers: filterActive changed to:', filterActive);
    loadDrivers();
  }, [filterActive]);

  useEffect(() => {
    console.log('AdminDrivers: drivers state changed, count:', drivers.length);
  }, [drivers]);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        console.log('AdminDrivers: Current user role:', profile?.role);
        if (profile?.role !== 'admin') {
          console.warn('AdminDrivers: ⚠️ Current user is not an admin!');
        }
      }
    } catch (error) {
      console.error('AdminDrivers: Error checking admin status:', error);
    }
  };

  const loadDrivers = async () => {
    setLoading(true);
    try {
      console.log('AdminDrivers: Loading drivers...', filterActive ? '(active only)' : '(all)');
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver');
      
      // فلترة السائقين النشطين فقط إذا كان filterActive = true
      if (filterActive) {
        query = query.eq('status', 'active');
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('AdminDrivers: Error loading drivers:', error);
        throw error;
      }
      
      console.log('AdminDrivers: Loaded drivers:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('AdminDrivers: Drivers data:', data.map(d => ({
          id: d.id,
          name: d.full_name,
          status: d.status,
          approval_status: d.approval_status,
          canSuspend: d.status === 'active' && d.approval_status === 'approved'
        })));
      }
      setDrivers(data || []);
      console.log('AdminDrivers: setDrivers called with', data?.length || 0, 'drivers');
    } catch (error: any) {
      console.error('AdminDrivers: Error loading drivers:', error);
      showToast(`فشل تحميل السائقين: ${error.message || error.code || 'خطأ غير معروف'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const approveDriver = async (driverId: string) => {
    console.log('AdminDrivers: approveDriver called for:', driverId);
    
    const performApproval = async () => {
      console.log('AdminDrivers: Approving driver:', driverId);
      setProcessingDriverId(driverId);
      try {
        // استخدام Edge Function لتجاوز RLS
        console.log('🌐 [AdminDrivers] Calling Edge Function update-driver-profile to approve driver...', {
          driverId,
          approval_status: 'approved',
          registration_complete: true,
          status: 'active',
        });

        const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-driver-profile', {
          body: {
            userId: driverId,
            approval_status: 'approved',
            registration_complete: true,
            status: 'active',
          },
        });

        console.log('📥 [AdminDrivers] Edge Function response received:', {
          hasData: !!edgeFunctionData,
          success: edgeFunctionData?.success,
          hasError: !!edgeFunctionError,
          errorMessage: edgeFunctionError?.message || edgeFunctionData?.error,
          profileId: edgeFunctionData?.profile?.id,
        });

        if (edgeFunctionError) {
          console.error('❌ [AdminDrivers] Edge Function error:', edgeFunctionError);
          throw edgeFunctionError;
        }

        if (!edgeFunctionData || !edgeFunctionData.success) {
          console.error('❌ [AdminDrivers] Edge Function returned error:', edgeFunctionData?.error);
          throw new Error(edgeFunctionData?.error || 'فشل الموافقة على السائق');
        }

        console.log('AdminDrivers: Driver approved successfully via Edge Function');
        
        // إرسال إشعار للإدارة عن الموافقة على السائق
        const driverName = edgeFunctionData.profile?.full_name || 'سائق';
        await notifyAllAdmins(
          'تم الموافقة على سائق',
          `تم الموافقة على السائق ${driverName} بنجاح.`,
          'success'
        );
        
        // إرسال إشعار للسائق
        await createNotification({
          user_id: driverId,
          title: 'تمت الموافقة على تسجيلك',
          message: 'تمت الموافقة على تسجيلك بنجاح! يمكنك الآن البدء في العمل.',
          type: 'success'
        });
        
        showToast('تم الموافقة على تسجيل السائق بنجاح! سيتم إشعار السائق بالموافقة.', 'success');
        
        await loadDrivers();
      } catch (error: any) {
        console.error('AdminDrivers: Error approving driver:', error);
        const errorMessage = error.message || error.code || 'فشل الموافقة على التسجيل';
        showToast(errorMessage, 'error');
      } finally {
        setProcessingDriverId(null);
      }
    };

    // استخدام SweetAlert2 للتأكيد
    const confirmed = await showConfirm(
      'موافقة على التسجيل',
      'هل أنت متأكد من الموافقة على تسجيل هذا السائق؟',
      {
        confirmText: 'نعم',
        cancelText: 'إلغاء',
      }
    );
    
    if (confirmed) {
      performApproval();
    }
  };

  const rejectDriver = async (driverId: string) => {
    console.log('AdminDrivers: rejectDriver called for:', driverId);
    
    const performRejection = async () => {
      console.log('AdminDrivers: Rejecting driver:', driverId);
      setProcessingDriverId(driverId);
      try {
        // استخدام Edge Function لتجاوز RLS
        console.log('🌐 [AdminDrivers] Calling Edge Function update-driver-profile to reject driver...', {
          driverId,
          approval_status: 'rejected',
          registration_complete: false,
        });

        const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-driver-profile', {
          body: {
            userId: driverId,
            approval_status: 'rejected',
            registration_complete: false,
          },
        });

        console.log('📥 [AdminDrivers] Edge Function response received:', {
          hasData: !!edgeFunctionData,
          success: edgeFunctionData?.success,
          hasError: !!edgeFunctionError,
          errorMessage: edgeFunctionError?.message || edgeFunctionData?.error,
          profileId: edgeFunctionData?.profile?.id,
        });

        if (edgeFunctionError) {
          console.error('❌ [AdminDrivers] Edge Function error:', edgeFunctionError);
          throw edgeFunctionError;
        }

        if (!edgeFunctionData || !edgeFunctionData.success) {
          console.error('❌ [AdminDrivers] Edge Function returned error:', edgeFunctionData?.error);
          throw new Error(edgeFunctionData?.error || 'فشل رفض السائق');
        }

        console.log('AdminDrivers: Driver rejected successfully via Edge Function');
        
        showToast('تم رفض تسجيل السائق', 'success');
        
        await loadDrivers();
      } catch (error: any) {
        console.error('AdminDrivers: Error rejecting driver:', error);
        const errorMessage = error.message || error.code || 'فشل رفض التسجيل';
        showToast(errorMessage, 'error');
      } finally {
        setProcessingDriverId(null);
      }
    };

    const confirmed = await showConfirm(
      'رفض التسجيل',
      'هل أنت متأكد من رفض تسجيل هذا السائق؟',
      {
        confirmText: 'رفض',
        cancelText: 'إلغاء',
        type: 'warning',
      }
    );
    
    if (confirmed) {
      performRejection();
    }
  };

  const suspendDriver = async (driverId: string) => {
    console.log('AdminDrivers: suspendDriver called for:', driverId);
    
    const performSuspension = async () => {
      console.log('AdminDrivers: Suspending driver:', driverId);
      setProcessingDriverId(driverId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        console.log('AdminDrivers: Current user:', user?.id);
        
        // جلب بيانات السائق لإرسال إشعار
        const { data: driverData } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', driverId)
          .single();
        
        const { data, error } = await supabase
          .from('profiles')
          .update({ status: 'suspended' })
          .eq('id', driverId)
          .select();

        console.log('AdminDrivers: Suspend result:', { data, error, driverId });

        if (error) {
          console.error('AdminDrivers: Suspend error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          });
          throw error;
        }
        
        if (!data || data.length === 0) {
          console.warn('AdminDrivers: No rows updated - check RLS policies');
          throw new Error('لم يتم تحديث أي صفوف. يرجى التحقق من الصلاحيات.');
        }
        
        console.log('AdminDrivers: Driver suspended successfully, updated rows:', data.length);
        
        // إرسال إشعار للإدارة عن تعليق السائق
        const driverName = driverData?.full_name || 'سائق';
        await notifyAllAdmins(
          'تم تعليق حساب سائق',
          `تم تعليق حساب السائق ${driverName}.`,
          'warning'
        );
        
        // إنشاء إشعار داخل التطبيق للسائق
        await createNotification({
          user_id: driverId,
          title: 'تم تعليق حسابك',
          message: 'تم تعليق حسابك في Flash Delivery. يرجى التواصل مع الإدارة لمزيد من المعلومات.',
          type: 'error'
        });
        
        // إرسال إشعار SMS للسائق
        if (driverData?.phone) {
          try {
            const { error: smsError } = await supabase.functions.invoke('send-sms', {
              body: {
                to: driverData.phone,
                message: `عزيزي ${driverData.full_name || 'السائق'}، تم تعليق حسابك في Flash Delivery. يرجى التواصل مع الإدارة لمزيد من المعلومات.`
              }
            });
            if (smsError) {
              console.error('AdminDrivers: Error sending SMS notification:', smsError);
            } else {
              console.log('AdminDrivers: SMS notification sent successfully');
            }
          } catch (smsErr) {
            console.error('AdminDrivers: Error invoking send-sms function:', smsErr);
          }
        }
        
        showToast('تم تعليق حساب السائق بنجاح. تم إرسال إشعار للسائق', 'success');
        
        await loadDrivers();
      } catch (error: any) {
        console.error('AdminDrivers: Error suspending driver:', error);
        const errorMessage = error.message || error.code || 'فشل تعليق الحساب';
        showToast(errorMessage, 'error');
      } finally {
        setProcessingDriverId(null);
      }
    };

    const confirmed = await showConfirm(
      'تعليق الحساب',
      'هل أنت متأكد من تعليق حساب هذا السائق؟',
      {
        confirmText: 'تعليق',
        cancelText: 'إلغاء',
        type: 'warning',
      }
    );
    
    if (confirmed) {
      performSuspension();
    }
  };

  const reactivateDriver = async (driverId: string) => {
    console.log('AdminDrivers: reactivateDriver called for:', driverId);
    
    const performReactivation = async () => {
      console.log('AdminDrivers: Reactivating driver:', driverId);
      setProcessingDriverId(driverId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        console.log('AdminDrivers: Current user:', user?.id);
        
        // جلب بيانات السائق لإرسال إشعار
        const { data: driverData } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', driverId)
          .single();
        
        const { data, error } = await supabase
          .from('profiles')
          .update({ status: 'active' })
          .eq('id', driverId)
          .select();

        console.log('AdminDrivers: Reactivate result:', { data, error, driverId });

        if (error) {
          console.error('AdminDrivers: Reactivate error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          });
          throw error;
        }
        
        if (!data || data.length === 0) {
          console.warn('AdminDrivers: No rows updated - check RLS policies');
          throw new Error('لم يتم تحديث أي صفوف. يرجى التحقق من الصلاحيات.');
        }
        
        console.log('AdminDrivers: Driver reactivated successfully, updated rows:', data.length);
        
        // إرسال إشعار للإدارة عن إعادة تنشيط السائق
        const driverName = driverData?.full_name || 'سائق';
        await notifyAllAdmins(
          'تم إعادة تنشيط حساب سائق',
          `تم إعادة تنشيط حساب السائق ${driverName}.`,
          'success'
        );
        
        // إنشاء إشعار داخل التطبيق للسائق
        await createNotification({
          user_id: driverId,
          title: 'تم إعادة تنشيط حسابك',
          message: 'تم إعادة تنشيط حسابك في Flash Delivery. يمكنك الآن البدء في العمل.',
          type: 'success'
        });
        
        // إرسال إشعار SMS للسائق
        if (driverData?.phone) {
          try {
            const { error: smsError } = await supabase.functions.invoke('send-sms', {
              body: {
                to: driverData.phone,
                message: `عزيزي ${driverData.full_name || 'السائق'}، تم إعادة تنشيط حسابك في Flash Delivery. يمكنك الآن البدء في العمل.`
              }
            });
            if (smsError) {
              console.error('AdminDrivers: Error sending SMS notification:', smsError);
            } else {
              console.log('AdminDrivers: SMS notification sent successfully');
            }
          } catch (smsErr) {
            console.error('AdminDrivers: Error invoking send-sms function:', smsErr);
          }
        }
        
        showToast('تم إعادة تنشيط حساب السائق بنجاح. تم إرسال إشعار للسائق', 'success');
        
        await loadDrivers();
      } catch (error: any) {
        console.error('AdminDrivers: Error reactivating driver:', error);
        const errorMessage = error.message || error.code || 'فشل إعادة تنشيط الحساب';
        showToast(errorMessage, 'error');
      } finally {
        setProcessingDriverId(null);
      }
    };

    const confirmed = await showConfirm(
      'إعادة تنشيط الحساب',
      'هل أنت متأكد من إعادة تنشيط حساب هذا السائق؟',
      {
        confirmText: 'إعادة التنشيط',
        cancelText: 'إلغاء',
      }
    );
    
    if (confirmed) {
      performReactivation();
    }
  };

  console.log('AdminDrivers: Component render, drivers count:', drivers.length, 'loading:', loading);
  if (drivers.length > 0) {
    console.log('AdminDrivers: Drivers state:', drivers.map(d => ({
      id: d.id,
      name: d.full_name,
      status: d.status,
      approval_status: d.approval_status,
      canSuspend: d.status === 'active' && d.approval_status === 'approved'
    })));
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.drivers')}</Text>
        <TouchableOpacity
          style={[styles.filterButton, filterActive && styles.filterButtonActive]}
          onPress={() => {
            setFilterActive(!filterActive);
            // loadDrivers سيتم استدعاؤه تلقائياً من useEffect عند تغيير filterActive
          }}
        >
          <Ionicons 
            name={filterActive ? "checkmark-circle" : "filter-outline"} 
            size={20} 
            color={filterActive ? "#fff" : "#007AFF"} 
          />
          <Text style={[styles.filterButtonText, filterActive && styles.filterButtonTextActive]}>
            {filterActive ? 'النشطين فقط' : 'جميع السائقين'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={drivers}
        keyExtractor={(item) => {
          console.log('AdminDrivers: keyExtractor called for:', item.id);
          return item.id;
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadDrivers} />
        }
        onLayout={() => {
          console.log('AdminDrivers: FlatList onLayout, drivers count:', drivers.length);
        }}
        renderItem={({ item, index }) => {
          console.log(`AdminDrivers: Rendering driver [${index}]:`, {
            id: item.id,
            name: item.full_name,
            status: item.status,
            approval_status: item.approval_status,
            shouldShowSuspend: item.status === 'active' && item.approval_status === 'approved'
          });
          return (
          <TouchableOpacity 
            style={styles.driverCard}
            onPress={() => {
              setSelectedDriver(item);
              setShowDriverDetailsModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{item.full_name || item.email}</Text>
              <Text style={styles.driverEmail}>{item.email}</Text>
              {item.phone && (
                <Text style={styles.driverPhone}>{item.phone}</Text>
              )}
              <View style={styles.statusContainer}>
                {/* حالة الموافقة */}
                {item.approval_status === 'pending' && (
                  <View style={[styles.statusBadge, styles.statusPending]}>
                    <Ionicons name="time-outline" size={14} color="#FF9500" />
                    <Text style={[styles.statusText, { color: '#FF9500' }]}>
                      في انتظار المراجعة
                    </Text>
                  </View>
                )}
                {item.approval_status === 'approved' && (
                  <View style={[styles.statusBadge, styles.statusActive]}>
                    <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                    <Text style={[styles.statusText, { color: '#34C759' }]}>
                      موافق عليه
                    </Text>
                  </View>
                )}
                {item.approval_status === 'rejected' && (
                  <View style={[styles.statusBadge, styles.statusSuspended]}>
                    <Ionicons name="close-circle" size={14} color="#FF3B30" />
                    <Text style={[styles.statusText, { color: '#FF3B30' }]}>
                      مرفوض
                    </Text>
                  </View>
                )}
                {/* حالة الحساب */}
                <View
                  style={[
                    styles.statusBadge,
                    item.status === 'active'
                      ? styles.statusActive
                      : styles.statusSuspended,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {item.status === 'active' ? 'نشط' : 'معلق'}
                  </Text>
                </View>
              </View>
            </View>
            
            {/* أزرار الإجراءات */}
            <View style={styles.actionsContainer}>
              {item.approval_status === 'pending' && (
                <>
                  <TouchableOpacity
                    style={[
                      styles.actionButton, 
                      styles.approveButton,
                      (processingDriverId === item.id || loading) && styles.actionButtonDisabled
                    ]}
                    onPress={() => {
                      console.log('AdminDrivers: Approve button pressed for:', item.id, 'item:', item);
                      if (!item.id) {
                        console.error('AdminDrivers: No driver ID!');
                        showToast('معرف السائق غير موجود', 'error');
                        return;
                      }
                      approveDriver(item.id);
                    }}
                    disabled={processingDriverId === item.id || loading}
                  >
                    {processingDriverId === item.id ? (
                      <ActivityIndicator size="small" color="#34C759" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                        <Text style={styles.approveButtonText}>موافقة</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionButton, 
                      styles.rejectButton,
                      (processingDriverId === item.id || loading) && styles.actionButtonDisabled
                    ]}
                    onPress={() => {
                      console.log('AdminDrivers: Reject button pressed for:', item.id, 'item:', item);
                      if (!item.id) {
                        console.error('AdminDrivers: No driver ID!');
                        showToast('معرف السائق غير موجود', 'error');
                        return;
                      }
                      rejectDriver(item.id);
                    }}
                    disabled={processingDriverId === item.id || loading}
                  >
                    {processingDriverId === item.id ? (
                      <ActivityIndicator size="small" color="#FF3B30" />
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                        <Text style={styles.rejectButtonText}>رفض</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {/* عرض المستندات */}
                  {(item.id_card_image_url || item.selfie_image_url) && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.viewDocumentsButton]}
                      onPress={() => {
                        setSelectedDriver(item);
                        setShowDocumentsModal(true);
                      }}
                    >
                      <Ionicons name="document-text" size={20} color="#007AFF" />
                      <Text style={styles.viewDocumentsButtonText}>عرض المستندات</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {item.status === 'active' && item.approval_status === 'approved' && (
                <TouchableOpacity
                  style={styles.suspendButton}
                  onPressIn={() => {
                    console.log('AdminDrivers: Suspend button onPressIn triggered');
                  }}
                  onPress={() => {
                    console.log('AdminDrivers: Suspend button pressed for:', item.id, 'item:', item);
                    if (!item.id) {
                      console.error('AdminDrivers: No driver ID!');
                      showToast('معرف السائق غير موجود', 'error');
                      return;
                    }
                    console.log('AdminDrivers: Calling suspendDriver with ID:', item.id);
                    suspendDriver(item.id);
                  }}
                  disabled={processingDriverId === item.id || loading}
                  activeOpacity={0.7}
                >
                  {processingDriverId === item.id ? (
                    <ActivityIndicator size="small" color="#FF3B30" />
                  ) : (
                    <>
                      <Ionicons name="ban" size={20} color="#FF3B30" />
                      <Text style={styles.suspendButtonText}>
                        {t('admin.suspendAccount')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {item.status === 'suspended' && (
                <TouchableOpacity
                  style={styles.reactivateButton}
                  onPressIn={() => {
                    console.log('AdminDrivers: Reactivate button onPressIn triggered');
                  }}
                  onPress={() => {
                    console.log('AdminDrivers: Reactivate button pressed for:', item.id, 'item:', item);
                    if (!item.id) {
                      console.error('AdminDrivers: No driver ID!');
                      showToast('معرف السائق غير موجود', 'error');
                      return;
                    }
                    console.log('AdminDrivers: Calling reactivateDriver with ID:', item.id);
                    reactivateDriver(item.id);
                  }}
                  disabled={processingDriverId === item.id || loading}
                  activeOpacity={0.7}
                >
                  {processingDriverId === item.id ? (
                    <ActivityIndicator size="small" color="#34C759" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                      <Text style={styles.reactivateButtonText}>
                        إعادة تنشيط الحساب
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا يوجد سائقين</Text>
          </View>
        }
      />

      {/* Modal لعرض جميع بيانات السائق */}
      <Modal
        visible={showDriverDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDriverDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                بيانات السائق
              </Text>
              <TouchableOpacity
                onPress={() => setShowDriverDetailsModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {selectedDriver && (
                <>
                  {/* المعلومات الأساسية */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>المعلومات الأساسية</Text>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>الاسم الكامل:</Text>
                      <Text style={styles.detailValue}>
                        {selectedDriver.full_name || 'غير محدد'}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>البريد الإلكتروني:</Text>
                      <Text style={styles.detailValue}>{selectedDriver.email}</Text>
                    </View>
                    
                    {selectedDriver.phone && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>رقم الهاتف:</Text>
                        <Text style={styles.detailValue}>{selectedDriver.phone}</Text>
                      </View>
                    )}
                    
                    {selectedDriver.created_at && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>تاريخ التسجيل:</Text>
                        <Text style={styles.detailValue}>
                          {new Date(selectedDriver.created_at).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* حالة الحساب */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>حالة الحساب</Text>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>حالة الموافقة:</Text>
                      <View style={styles.statusValueContainer}>
                        {selectedDriver.approval_status === 'pending' && (
                          <View style={[styles.statusBadge, styles.statusPending]}>
                            <Ionicons name="time-outline" size={14} color="#FF9500" />
                            <Text style={[styles.statusText, { color: '#FF9500' }]}>
                              في انتظار المراجعة
                            </Text>
                          </View>
                        )}
                        {selectedDriver.approval_status === 'approved' && (
                          <View style={[styles.statusBadge, styles.statusActive]}>
                            <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                            <Text style={[styles.statusText, { color: '#34C759' }]}>
                              موافق عليه
                            </Text>
                          </View>
                        )}
                        {selectedDriver.approval_status === 'rejected' && (
                          <View style={[styles.statusBadge, styles.statusSuspended]}>
                            <Ionicons name="close-circle" size={14} color="#FF3B30" />
                            <Text style={[styles.statusText, { color: '#FF3B30' }]}>
                              مرفوض
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>حالة الحساب:</Text>
                      <View style={styles.statusValueContainer}>
                        <View
                          style={[
                            styles.statusBadge,
                            selectedDriver.status === 'active'
                              ? styles.statusActive
                              : styles.statusSuspended,
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {selectedDriver.status === 'active' ? 'نشط' : 'معلق'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* المستندات */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>المستندات المرفوعة</Text>
                    
                    {selectedDriver.id_card_image_url ? (
                      <View style={styles.documentSection}>
                        <Text style={styles.documentLabel}>صورة البطاقة الشخصية</Text>
                        <Image
                          source={{ uri: selectedDriver.id_card_image_url }}
                          style={styles.documentImage}
                          resizeMode="contain"
                        />
                      </View>
                    ) : (
                      <View style={styles.missingDocument}>
                        <Ionicons name="document-outline" size={32} color="#999" />
                        <Text style={styles.missingDocumentText}>
                          لم يتم رفع صورة البطاقة الشخصية
                        </Text>
                      </View>
                    )}
                    
                    {selectedDriver.selfie_image_url ? (
                      <View style={styles.documentSection}>
                        <Text style={styles.documentLabel}>صورة السيلفي</Text>
                        <Image
                          source={{ uri: selectedDriver.selfie_image_url }}
                          style={styles.documentImage}
                          resizeMode="contain"
                        />
                      </View>
                    ) : (
                      <View style={styles.missingDocument}>
                        <Ionicons name="person-outline" size={32} color="#999" />
                        <Text style={styles.missingDocumentText}>
                          لم يتم رفع صورة السيلفي
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
            
            {/* أزرار الإجراءات */}
            {selectedDriver?.approval_status === 'pending' && (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[
                    styles.modalActionButton, 
                    styles.modalRejectButton,
                    processingDriverId === selectedDriver.id && styles.actionButtonDisabled
                  ]}
                  onPress={() => {
                    setShowDriverDetailsModal(false);
                    rejectDriver(selectedDriver.id);
                  }}
                  disabled={processingDriverId === selectedDriver.id}
                >
                  {processingDriverId === selectedDriver.id ? (
                    <ActivityIndicator size="small" color="#FF3B30" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={20} color="#FF3B30" />
                      <Text style={styles.modalRejectButtonText}>رفض</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalActionButton, 
                    styles.modalApproveButton,
                    processingDriverId === selectedDriver.id && styles.actionButtonDisabled
                  ]}
                  onPress={() => {
                    setShowDriverDetailsModal(false);
                    approveDriver(selectedDriver.id);
                  }}
                  disabled={processingDriverId === selectedDriver.id}
                >
                  {processingDriverId === selectedDriver.id ? (
                    <ActivityIndicator size="small" color="#34C759" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                      <Text style={styles.modalApproveButtonText}>موافقة</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
            
            {/* أزرار التعليق/التفعيل */}
            {selectedDriver?.approval_status === 'approved' && (
              <View style={styles.modalActions}>
                {selectedDriver.status === 'active' ? (
                  <TouchableOpacity
                    style={[
                      styles.modalActionButton, 
                      styles.modalRejectButton,
                      processingDriverId === selectedDriver.id && styles.actionButtonDisabled
                    ]}
                    onPress={() => {
                      setShowDriverDetailsModal(false);
                      suspendDriver(selectedDriver.id);
                    }}
                    disabled={processingDriverId === selectedDriver.id}
                  >
                    {processingDriverId === selectedDriver.id ? (
                      <ActivityIndicator size="small" color="#FF3B30" />
                    ) : (
                      <>
                        <Ionicons name="ban" size={20} color="#FF3B30" />
                        <Text style={styles.modalRejectButtonText}>تعليق الحساب</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.modalActionButton, 
                      styles.modalApproveButton,
                      processingDriverId === selectedDriver.id && styles.actionButtonDisabled
                    ]}
                    onPress={() => {
                      setShowDriverDetailsModal(false);
                      reactivateDriver(selectedDriver.id);
                    }}
                    disabled={processingDriverId === selectedDriver.id}
                  >
                    {processingDriverId === selectedDriver.id ? (
                      <ActivityIndicator size="small" color="#34C759" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                        <Text style={styles.modalApproveButtonText}>إعادة تنشيط الحساب</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal لعرض المستندات */}
      <Modal
        visible={showDocumentsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDocumentsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                مستندات {selectedDriver?.full_name || selectedDriver?.email}
              </Text>
              <TouchableOpacity
                onPress={() => setShowDocumentsModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {selectedDriver?.id_card_image_url && (
                <View style={styles.documentSection}>
                  <Text style={styles.documentLabel}>صورة البطاقة الشخصية</Text>
                  <Image
                    source={{ uri: selectedDriver.id_card_image_url }}
                    style={styles.documentImage}
                    resizeMode="contain"
                  />
                </View>
              )}
              
              {selectedDriver?.selfie_image_url && (
                <View style={styles.documentSection}>
                  <Text style={styles.documentLabel}>صورة السيلفي</Text>
                  <Image
                    source={{ uri: selectedDriver.selfie_image_url }}
                    style={styles.documentImage}
                    resizeMode="contain"
                  />
                </View>
              )}
              
              {!selectedDriver?.id_card_image_url && !selectedDriver?.selfie_image_url && (
                <Text style={styles.noDocumentsText}>لا توجد مستندات مرفوعة</Text>
              )}
            </ScrollView>
            
            {selectedDriver?.approval_status === 'pending' && (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[
                    styles.modalActionButton, 
                    styles.modalRejectButton,
                    processingDriverId === selectedDriver.id && styles.actionButtonDisabled
                  ]}
                  onPress={() => {
                    console.log('AdminDrivers: Modal reject button pressed for:', selectedDriver.id);
                    setShowDocumentsModal(false);
                    rejectDriver(selectedDriver.id);
                  }}
                  disabled={processingDriverId === selectedDriver.id}
                >
                  {processingDriverId === selectedDriver.id ? (
                    <ActivityIndicator size="small" color="#FF3B30" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={20} color="#FF3B30" />
                      <Text style={styles.modalRejectButtonText}>رفض</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalActionButton, 
                    styles.modalApproveButton,
                    processingDriverId === selectedDriver.id && styles.actionButtonDisabled
                  ]}
                  onPress={() => {
                    console.log('AdminDrivers: Modal approve button pressed for:', selectedDriver.id);
                    setShowDocumentsModal(false);
                    approveDriver(selectedDriver.id);
                  }}
                  disabled={processingDriverId === selectedDriver.id}
                >
                  {processingDriverId === selectedDriver.id ? (
                    <ActivityIndicator size="small" color="#34C759" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                      <Text style={styles.modalApproveButtonText}>موافقة</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#fff',
    padding: responsive.getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    flex: 1,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: responsive.isTablet() ? 16 : 12,
    paddingVertical: responsive.isTablet() ? 10 : 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#007AFF',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  driverCard: {
    backgroundColor: '#fff',
    margin: responsive.isTablet() ? 20 : 16,
    padding: responsive.isTablet() ? 20 : 16,
    borderRadius: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  driverInfo: {
    marginBottom: 12,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  driverEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  driverPhone: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
  },
  statusContainer: {
    marginTop: 12,
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusActive: {
    backgroundColor: '#34C75920',
  },
  statusSuspended: {
    backgroundColor: '#FF3B3020',
  },
  statusPending: {
    backgroundColor: '#FF950020',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  actionsContainer: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
    flex: 1,
    minWidth: 100,
  },
  approveButton: {
    backgroundColor: '#34C75920',
  },
  approveButtonText: {
    color: '#34C759',
    fontWeight: '600',
    fontSize: 14,
  },
  rejectButton: {
    backgroundColor: '#FF3B3020',
  },
  rejectButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 14,
  },
  viewDocumentsButton: {
    backgroundColor: '#007AFF20',
  },
  viewDocumentsButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  suspendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B3020',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  suspendButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  reactivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C75920',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  reactivateButtonText: {
    color: '#34C759',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  documentSection: {
    marginBottom: 24,
  },
  documentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'right',
  },
  documentImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  noDocumentsText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    padding: 40,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalApproveButton: {
    backgroundColor: '#34C75920',
  },
  modalApproveButtonText: {
    color: '#34C759',
    fontWeight: '600',
    fontSize: 16,
  },
  modalRejectButton: {
    backgroundColor: '#FF3B3020',
  },
  modalRejectButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 16,
  },
  detailSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'right',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginRight: 12,
  },
  detailValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  statusValueContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  missingDocument: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  missingDocumentText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

