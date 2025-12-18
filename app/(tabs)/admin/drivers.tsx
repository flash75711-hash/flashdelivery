import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
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
import responsive from '@/utils/responsive';

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
  const [processingDriverId, setProcessingDriverId] = useState<string | null>(null);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    loadDrivers();
    // التحقق من أن المستخدم الحالي هو admin
    checkAdminStatus();
  }, []);

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
      console.log('AdminDrivers: Loading drivers...');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('AdminDrivers: Error loading drivers:', error);
        throw error;
      }
      
      console.log('AdminDrivers: Loaded drivers:', data?.length || 0);
      setDrivers(data || []);
    } catch (error: any) {
      console.error('AdminDrivers: Error loading drivers:', error);
      Alert.alert('خطأ', `فشل تحميل السائقين: ${error.message || error.code || 'خطأ غير معروف'}`);
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
        const { data: { user } } = await supabase.auth.getUser();
        console.log('AdminDrivers: Current user:', user?.id);
        
        const { data, error } = await supabase
          .from('profiles')
          .update({ 
            approval_status: 'approved',
            registration_complete: true,
            status: 'active'
          })
          .eq('id', driverId)
          .select();

        console.log('AdminDrivers: Update result:', { data, error, driverId });

        if (error) {
          console.error('AdminDrivers: Update error details:', {
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
        
        console.log('AdminDrivers: Driver approved successfully, updated rows:', data.length);
        
        if (Platform.OS === 'web') {
          window.alert('✅ نجح\nتم الموافقة على تسجيل السائق بنجاح!\nسيتم إشعار السائق بالموافقة.');
        } else {
          Alert.alert('✅ نجح', 'تم الموافقة على تسجيل السائق بنجاح!\nسيتم إشعار السائق بالموافقة.');
        }
        
        await loadDrivers();
      } catch (error: any) {
        console.error('AdminDrivers: Error approving driver:', error);
        const errorMessage = error.message || error.code || 'فشل الموافقة على التسجيل';
        
        if (Platform.OS === 'web') {
          window.alert(`خطأ\n${errorMessage}`);
        } else {
          Alert.alert('خطأ', errorMessage, [{ text: 'حسناً' }]);
        }
      } finally {
        setProcessingDriverId(null);
      }
    };

    // استخدام window.confirm على الويب
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('موافقة على التسجيل\n\nهل أنت متأكد من الموافقة على تسجيل هذا السائق؟');
      if (confirmed) {
        performApproval();
      }
    } else {
      Alert.alert(
        'موافقة على التسجيل',
        'هل أنت متأكد من الموافقة على تسجيل هذا السائق؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'موافقة',
            style: 'default',
            onPress: performApproval,
          },
        ]
      );
    }
  };

  const rejectDriver = async (driverId: string) => {
    console.log('AdminDrivers: rejectDriver called for:', driverId);
    
    const performRejection = async () => {
      console.log('AdminDrivers: Rejecting driver:', driverId);
      setProcessingDriverId(driverId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        console.log('AdminDrivers: Current user:', user?.id);
        
        const { data, error } = await supabase
          .from('profiles')
          .update({ 
            approval_status: 'rejected',
            registration_complete: false
          })
          .eq('id', driverId)
          .select();

        console.log('AdminDrivers: Reject result:', { data, error, driverId });

        if (error) {
          console.error('AdminDrivers: Reject error details:', {
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
        
        console.log('AdminDrivers: Driver rejected successfully, updated rows:', data.length);
        
        if (Platform.OS === 'web') {
          window.alert('تم الرفض\nتم رفض تسجيل السائق');
        } else {
          Alert.alert('تم الرفض', 'تم رفض تسجيل السائق');
        }
        
        await loadDrivers();
      } catch (error: any) {
        console.error('AdminDrivers: Error rejecting driver:', error);
        const errorMessage = error.message || error.code || 'فشل رفض التسجيل';
        
        if (Platform.OS === 'web') {
          window.alert(`خطأ\n${errorMessage}`);
        } else {
          Alert.alert('خطأ', errorMessage, [{ text: 'حسناً' }]);
        }
      } finally {
        setProcessingDriverId(null);
      }
    };

    // استخدام window.confirm على الويب
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('رفض التسجيل\n\nهل أنت متأكد من رفض تسجيل هذا السائق؟');
      if (confirmed) {
        performRejection();
      }
    } else {
      Alert.alert(
        'رفض التسجيل',
        'هل أنت متأكد من رفض تسجيل هذا السائق؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'رفض',
            style: 'destructive',
            onPress: performRejection,
          },
        ]
      );
    }
  };

  const suspendDriver = async (driverId: string) => {
    Alert.alert(
      'تعليق الحساب',
      'هل أنت متأكد من تعليق حساب هذا السائق؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تعليق',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('profiles')
                .update({ status: 'suspended' })
                .eq('id', driverId);

              if (error) throw error;
              Alert.alert('نجح', 'تم تعليق حساب السائق');
              loadDrivers();
            } catch (error: any) {
              Alert.alert('خطأ', error.message || 'فشل تعليق الحساب');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.drivers')}</Text>
      </View>

      <FlatList
        data={drivers}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadDrivers} />
        }
        renderItem={({ item }) => (
          <View style={styles.driverCard}>
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
                        Alert.alert('خطأ', 'معرف السائق غير موجود');
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
                        Alert.alert('خطأ', 'معرف السائق غير موجود');
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
                onPress={() => suspendDriver(item.id)}
              >
                <Ionicons name="ban" size={20} color="#FF3B30" />
                <Text style={styles.suspendButtonText}>
                  {t('admin.suspendAccount')}
                </Text>
              </TouchableOpacity>
            )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا يوجد سائقين</Text>
          </View>
        }
      />

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
  driverCard: {
    backgroundColor: '#fff',
    margin: responsive.isTablet() ? 20 : 16,
    padding: responsive.isTablet() ? 20 : 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
});

const styles = getStyles();

