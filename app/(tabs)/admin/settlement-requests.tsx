import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Image,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle, getM3CardStyle, getM3ButtonStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import { showSimpleAlert, showToast, showConfirm } from '@/lib/alert';

interface SettlementRequest {
  id: string;
  driver_id: string;
  total_commission: number;
  receipt_image_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  requested_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  driver?: {
    full_name?: string;
    phone?: string;
  };
}

export default function AdminSettlementRequestsScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [requests, setRequests] = useState<SettlementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SettlementRequest | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    console.log('[AdminSettlementRequests] useEffect triggered, user:', user?.id);
    if (user) {
      console.log('[AdminSettlementRequests] User found, calling loadSettlementRequests');
      loadSettlementRequests();
    } else {
      console.log('[AdminSettlementRequests] No user found, skipping load');
    }
  }, [user]);

  const loadSettlementRequests = async () => {
    console.log('[AdminSettlementRequests] ⚡ loadSettlementRequests CALLED - NEW VERSION WITH FETCH');
    setLoading(true);
    try {
      console.log('[AdminSettlementRequests] Loading settlement requests for user:', user?.id);
      
      if (!user?.id) {
        console.error('[AdminSettlementRequests] No user ID found');
        setRequests([]);
        return;
      }

      // استخدام Edge Function لتجاوز RLS
      console.log('[AdminSettlementRequests] ⚡ Calling Edge Function with adminId:', user.id);
      
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase configuration');
      }

      // الحصول على JWT token من session
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      console.log('[AdminSettlementRequests] Making fetch request to Edge Function');
      
      const response = await fetch(`${supabaseUrl}/functions/v1/get-settlement-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ adminId: user.id }),
      });

      console.log('[AdminSettlementRequests] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AdminSettlementRequests] Error response:', errorText);
        throw new Error(`Edge Function error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[AdminSettlementRequests] Edge Function response:', result);

      if (!result.success) {
        const errorMsg = result?.error || 'Failed to load settlement requests';
        console.error('[AdminSettlementRequests] Error:', errorMsg);
        throw new Error(errorMsg);
      }

      const formattedRequests = result.requests || [];
      console.log('[AdminSettlementRequests] Loaded requests:', formattedRequests.length, 'requests');
      console.log('[AdminSettlementRequests] Formatted requests:', formattedRequests);
      
      if (formattedRequests.length === 0) {
        console.log('[AdminSettlementRequests] No requests found');
        setRequests([]);
        return;
      }

      setRequests(formattedRequests);
    } catch (error) {
      console.error('Error loading settlement requests:', error);
      showToast('فشل تحميل طلبات التوريد', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSettlementRequests();
  };

  const handleReviewRequest = (request: SettlementRequest, action: 'approved' | 'rejected') => {
    setSelectedRequest(request);
    setReviewAction(action);
    setRejectionReason('');
    setShowReviewModal(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedRequest || !reviewAction || !user?.id) return;

    if (reviewAction === 'rejected' && !rejectionReason.trim()) {
      showSimpleAlert('تنبيه', 'يرجى إدخال سبب الرفض', 'warning');
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد',
      reviewAction === 'approved'
        ? 'هل أنت متأكد من قبول طلب التوريد هذا؟'
        : 'هل أنت متأكد من رفض طلب التوريد هذا؟'
    );

    if (!confirmed) return;

    setSubmittingReview(true);
    try {
      const { data, error } = await supabase.functions.invoke('review-settlement-request', {
        body: {
          requestId: selectedRequest.id,
          action: reviewAction,
          rejectionReason: reviewAction === 'rejected' ? rejectionReason : undefined,
          adminId: user.id,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        showToast(
          reviewAction === 'approved'
            ? 'تم قبول طلب التوريد بنجاح'
            : 'تم رفض طلب التوريد',
          'success'
        );
        setShowReviewModal(false);
        setSelectedRequest(null);
        setReviewAction(null);
        setRejectionReason('');
        loadSettlementRequests();
      } else {
        throw new Error(data?.error || 'فشل مراجعة الطلب');
      }
    } catch (error: any) {
      console.error('Error reviewing settlement request:', error);
      showSimpleAlert('خطأ', error.message || 'فشل مراجعة طلب التوريد', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FF9500';
      case 'approved':
        return '#34C759';
      case 'rejected':
        return '#FF3B30';
      default:
        return '#666';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'قيد المراجعة';
      case 'approved':
        return 'موافق عليه';
      case 'rejected':
        return 'مرفوض';
      default:
        return status;
    }
  };

  const renderRequest = ({ item }: { item: SettlementRequest }) => (
    <TouchableOpacity
      style={styles.requestCard}
      onPress={() => {
        setSelectedRequest(item);
        setShowImageModal(true);
        setSelectedImageUrl(item.receipt_image_url);
      }}
    >
      <View style={styles.requestHeader}>
        <View style={styles.requestInfo}>
          <Text style={styles.driverName}>
            {item.driver?.full_name || item.driver?.phone || 'سائق غير معروف'}
          </Text>
          <Text style={styles.requestDate}>
            {new Date(item.requested_at).toLocaleString('ar-SA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + '20' },
          ]}
        >
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.requestDetails}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>إجمالي المستحقات للتوريد:</Text>
          <Text style={styles.amountValue}>{item.total_commission.toFixed(2)} ج.م</Text>
        </View>
        <Text style={styles.amountNote}>
          (إجمالي العمولة + إجمالي باقي العملاء)
        </Text>

        {item.status === 'pending' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => handleReviewRequest(item, 'approved')}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>قبول</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleReviewRequest(item, 'rejected')}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>رفض</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.status === 'rejected' && item.rejection_reason && (
          <View style={styles.rejectionReasonContainer}>
            <Text style={styles.rejectionReasonLabel}>سبب الرفض:</Text>
            <Text style={styles.rejectionReasonText}>{item.rejection_reason}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.viewReceiptButton}
          onPress={() => {
            setSelectedImageUrl(item.receipt_image_url);
            setShowImageModal(true);
          }}
        >
          <Ionicons name="image-outline" size={18} color="#007AFF" />
          <Text style={styles.viewReceiptText}>عرض صورة الوصل</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>مراجعة طلبات التوريد</Text>
        <Text style={styles.subtitle}>
          {requests.filter(r => r.status === 'pending').length} طلب قيد المراجعة
        </Text>
      </View>

      {loading && requests.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequest}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد طلبات توريد</Text>
            </View>
          }
        />
      )}

      {/* Modal مراجعة الطلب */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {reviewAction === 'approved' ? 'قبول طلب التوريد' : 'رفض طلب التوريد'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowReviewModal(false);
                  setSelectedRequest(null);
                  setReviewAction(null);
                  setRejectionReason('');
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedRequest && (
                <>
                  <View style={styles.reviewInfoCard}>
                    <Text style={styles.reviewInfoLabel}>اسم السائق:</Text>
                    <Text style={styles.reviewInfoValue}>
                      {selectedRequest.driver?.full_name || selectedRequest.driver?.phone || 'غير معروف'}
                    </Text>
                  </View>
                  <View style={styles.reviewInfoCard}>
                    <Text style={styles.reviewInfoLabel}>إجمالي المستحقات للتوريد:</Text>
                    <Text style={styles.reviewInfoValue}>
                      {selectedRequest.total_commission.toFixed(2)} ج.م
                    </Text>
                  </View>
                  <View style={styles.reviewInfoNoteContainer}>
                    <Text style={styles.reviewInfoNote}>
                      يشمل: إجمالي العمولة + إجمالي باقي العملاء
                    </Text>
                  </View>
                  <View style={styles.reviewInfoCard}>
                    <Text style={styles.reviewInfoLabel}>تاريخ الطلب:</Text>
                    <Text style={styles.reviewInfoValue}>
                      {new Date(selectedRequest.requested_at).toLocaleString('ar-SA')}
                    </Text>
                  </View>
                </>
              )}

              {reviewAction === 'rejected' && (
                <View style={styles.rejectionReasonInputContainer}>
                  <Text style={styles.rejectionReasonInputLabel}>سبب الرفض *</Text>
                  <TextInput
                    style={styles.rejectionReasonInput}
                    placeholder="أدخل سبب رفض الطلب..."
                    value={rejectionReason}
                    onChangeText={setRejectionReason}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.submitReviewButton,
                  reviewAction === 'approved' ? styles.approveButton : styles.rejectButton,
                  submittingReview && styles.submitReviewButtonDisabled,
                ]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={reviewAction === 'approved' ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.submitReviewButtonText}>
                      {reviewAction === 'approved' ? 'قبول الطلب' : 'رفض الطلب'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal عرض صورة الوصل */}
      <Modal
        visible={showImageModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowImageModal(false);
          setSelectedImageUrl(null);
        }}
      >
        <View style={styles.imageModalOverlay}>
          <View style={styles.imageModalContent}>
            <View style={styles.imageModalHeader}>
              <Text style={styles.imageModalTitle}>صورة الوصل / الريسيت</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowImageModal(false);
                  setSelectedImageUrl(null);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.imageScrollContainer}
              showsVerticalScrollIndicator={true}
              showsHorizontalScrollIndicator={true}
            >
              {selectedImageUrl && (
                <Image
                  source={{ uri: selectedImageUrl }}
                  style={styles.receiptImage}
                  resizeMode="contain"
                />
              )}
            </ScrollView>
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
    ...M3Theme.typography.headlineMedium,
    color: M3Theme.colors.onSurface,
    textAlign: 'right',
    marginBottom: 4,
  },
  subtitle: {
    ...M3Theme.typography.bodyMedium,
    color: M3Theme.colors.onSurfaceVariant,
    textAlign: 'right',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestCard: {
    ...getM3CardStyle(),
    backgroundColor: M3Theme.colors.surface,
    marginHorizontal: getM3HorizontalPadding(),
    marginBottom: 12,
      shadowRadius: 4,
      elevation: 2,
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requestInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  requestDate: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
  },
  requestDetails: {
    marginTop: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  amountLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  amountValue: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#007AFF',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  approveButton: {
    backgroundColor: '#34C759',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
  rejectionReasonContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFF3F3',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF3B30',
  },
  rejectionReasonLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    marginBottom: 4,
  },
  rejectionReasonText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#1a1a1a',
  },
  viewReceiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    gap: 8,
  },
  viewReceiptText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
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
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: responsive.getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: responsive.getResponsivePadding(),
  },
  reviewInfoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  reviewInfoLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  reviewInfoValue: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#1a1a1a',
    fontWeight: '500',
  },
  reviewInfoNoteContainer: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  reviewInfoNote: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    textAlign: 'right',
    fontStyle: 'italic',
  },
  rejectionReasonInputContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  rejectionReasonInputLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  rejectionReasonInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#1a1a1a',
    minHeight: 100,
    textAlign: 'right',
  },
  submitReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  submitReviewButtonDisabled: {
    opacity: 0.6,
  },
  submitReviewButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '95%',
    maxWidth: 800,
    height: '90%',
    maxHeight: 600,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageModalHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: responsive.getResponsivePadding(),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  imageModalTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#fff',
  },
  imageScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 10,
  },
  receiptImage: {
    width: '100%',
    minHeight: 300,
    maxHeight: '80%',
  },
});
