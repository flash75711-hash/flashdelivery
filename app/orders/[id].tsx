import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { createNotification } from '@/lib/notifications';
import { showAlert, showSimpleAlert, showConfirm } from '@/lib/alert';

interface Order {
  id: string;
  status: string;
  order_type: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  items?: any;
  negotiated_price?: number;
  negotiation_status?: string;
  driver_proposed_price?: number;
  customer_proposed_price?: number;
  customer_id: string;
  driver_id?: string | null;
  search_status?: string;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [proposedPrice, setProposedPrice] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);


      const loadOrder = async () => {
    if (!id || !user) return;

    try {
      // محاولة جلب الطلب مباشرة أولاً
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        // إذا فشل، استخدم Edge Function (لتجاوز RLS)
        if (user.role === 'customer') {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-customer', {
            body: {
              orderId: id,
              customerId: user.id,
            },
          });

          if (edgeError || !edgeData?.success || !edgeData?.order) {
            throw new Error(edgeData?.error || edgeError?.message || 'فشل تحميل تفاصيل الطلب');
          }

          setOrder(edgeData.order);
        } else {
          throw error || new Error('فشل تحميل تفاصيل الطلب');
        }
      } else {
      setOrder(data);
      }
    } catch (error: any) {
      console.error('Error loading order:', error);
      showSimpleAlert('خطأ', error.message || 'فشل تحميل تفاصيل الطلب', 'error');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const acceptDriverProposal = async () => {
    if (!order || !order.driver_proposed_price) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          negotiation_status: 'accepted',
          negotiated_price: order.driver_proposed_price,
          total_fee: order.driver_proposed_price,
        })
        .eq('id', order.id);

      if (error) throw error;

      // إشعار السائق
      if (order.driver_id) {
        await createNotification({
          user_id: order.driver_id,
          title: 'تم قبول اقتراحك',
          message: `تم قبول اقتراحك للسعر ${order.driver_proposed_price} ج.م`,
          type: 'success',
          order_id: order.id,
        });
      }

      showSimpleAlert('نجح', 'تم قبول اقتراح السائق', 'success');
      setShowNegotiation(false);
      loadOrder();
    } catch (error: any) {
      console.error('Error accepting proposal:', error);
      showSimpleAlert('خطأ', error.message || 'فشل قبول الاقتراح', 'error');
    }
  };

  // دالة إعادة البحث عن سائق
  const handleRestartSearch = async () => {
    if (!order) {
      return;
    }

    const confirmed = await showConfirm(
      'إعادة البحث عن سائق',
      'هل تريد إعادة البحث عن سائق لهذا الطلب؟',
      {
        confirmText: 'نعم، إعادة البحث',
        cancelText: 'إلغاء',
        type: 'question',
      }
    );

    if (!confirmed) return;

    setIsRestarting(true);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          search_status: 'searching',
          search_started_at: new Date().toISOString(),
          search_expanded_at: null,
          driver_id: null,
        })
        .eq('id', order.id);

      if (updateError) {
        showSimpleAlert('خطأ', 'فشل تحديث حالة البحث', 'error');
        setIsRestarting(false);
        return;
      }

      await showSimpleAlert('نجح', 'تم بدء البحث عن سائق جديد. سيتم البحث تلقائياً.', 'success');
      router.back();
    } catch (error: any) {
      console.error('Error restarting search:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إعادة البحث', 'error');
      setIsRestarting(false);
    }
  };

  // دالة إلغاء الطلب
  const handleCancelOrder = async () => {
    if (!order) {
      return;
    }

    const confirmed = await showConfirm(
      'إلغاء الطلب',
      'هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذه العملية.',
      {
        confirmText: 'نعم، إلغاء',
        cancelText: 'إلغاء',
        type: 'warning',
      }
    );

    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id);

      if (error) throw error;

      // إشعار السائق إذا كان الطلب مقبولاً
      if (order.driver_id) {
        await createNotification({
          user_id: order.driver_id,
          title: 'تم إلغاء الطلب',
          message: `تم إلغاء الطلب رقم ${order.id.slice(0, 8)}`,
          type: 'warning',
          order_id: order.id,
        });
      }

      await showSimpleAlert('نجح', 'تم إلغاء الطلب بنجاح', 'success');
      router.back();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إلغاء الطلب', 'error');
      setIsCancelling(false);
    }
  };

  const proposePrice = async () => {
    if (!order || !proposedPrice) return;

    const price = parseFloat(proposedPrice);
    if (isNaN(price) || price <= 0) {
      showSimpleAlert('خطأ', 'يرجى إدخال سعر صحيح', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          negotiation_status: 'customer_proposed',
          customer_proposed_price: price,
        })
        .eq('id', order.id);

      if (error) throw error;

      // إشعار السائق
      if (order.driver_id) {
        const notificationResult = await createNotification({
          user_id: order.driver_id,
          title: 'اقتراح سعر جديد',
          message: `العميل يقترح سعر ${price} ج.م`,
          type: 'info',
          order_id: order.id,
        });
        
        // إذا فشل إنشاء الإشعار، سجل الخطأ لكن لا توقف العملية
        if (!notificationResult.success) {
          console.error('Failed to create notification:', notificationResult.error);
          // الإشعار ليس ضرورياً لعملية الإرسال، لكن يجب تسجيل الخطأ
        }
      }

      showSimpleAlert('نجح', 'تم إرسال اقتراحك', 'success');
      setShowNegotiation(false);
      setProposedPrice('');
      loadOrder();
    } catch (error: any) {
      console.error('Error proposing price:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إرسال الاقتراح', 'error');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.title}>تفاصيل الطلب</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.title}>تفاصيل الطلب</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>الطلب غير موجود</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isCustomer = user?.id === order.customer_id;
  const hasNegotiation = order.negotiation_status === 'driver_proposed' && order.driver_proposed_price;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>تفاصيل الطلب</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderType}>
              {order.order_type === 'package' ? 'توصيل طرد' : 'طلب شراء'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                {getStatusText(order.status, order.search_status)}
              </Text>
            </View>
          </View>

          <Text style={styles.date}>
            {new Date(order.created_at).toLocaleDateString('ar-EG', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>

          {order.pickup_address && (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={20} color="#34C759" />
              <Text style={styles.address}>من: {order.pickup_address}</Text>
            </View>
          )}

          {order.delivery_address && (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={20} color="#FF3B30" />
              <Text style={styles.address}>إلى: {order.delivery_address}</Text>
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>الأجرة:</Text>
            <Text style={styles.priceValue}>
              {order.negotiated_price || order.total_fee} ج.م
            </Text>
          </View>

          {hasNegotiation && isCustomer && (
            <TouchableOpacity
              style={styles.negotiationButton}
              onPress={() => setShowNegotiation(true)}
            >
              <Ionicons name="cash" size={20} color="#FF9500" />
              <Text style={styles.negotiationButtonText}>
                اقتراح سعر من السائق: {order.driver_proposed_price} ج.م
              </Text>
            </TouchableOpacity>
          )}

          {/* أزرار إعادة البحث وإلغاء الطلب للعميل عندما البحث متوقف */}
          {isCustomer && order.search_status === 'stopped' && order.status === 'pending' && (
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.restartSearchButton]}
                onPress={handleRestartSearch}
                disabled={isRestarting}
              >
                {isRestarting ? (
                  <ActivityIndicator color="#007AFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color="#007AFF" />
                    <Text style={styles.restartSearchButtonText}>
                      إعادة البحث عن سائق
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.cancelOrderButton]}
                onPress={handleCancelOrder}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator color="#FF3B30" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    <Text style={styles.cancelOrderButtonText}>
                      إلغاء الطلب
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal للتفاوض */}
      <Modal
        visible={showNegotiation}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNegotiation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>التفاوض على السعر</Text>
              <TouchableOpacity onPress={() => setShowNegotiation(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.negotiationInfo}>
                <View style={styles.negotiationPriceRow}>
                  <Text style={styles.negotiationPriceLabel}>السعر الأصلي:</Text>
                  <Text style={styles.negotiationOriginalPrice}>{order.total_fee} ج.م</Text>
                </View>

                {order.driver_proposed_price && (
                  <View style={styles.negotiationPriceRow}>
                    <Text style={styles.negotiationPriceLabel}>السعر المقترح من السائق:</Text>
                    <Text style={styles.negotiationDriverPrice}>
                      {order.driver_proposed_price} ج.م
                    </Text>
                  </View>
                )}

                {order.negotiation_status === 'driver_proposed' && (
                  <TouchableOpacity
                    style={[styles.negotiationActionButton, styles.acceptButton]}
                    onPress={acceptDriverProposal}
                  >
                    <Text style={styles.negotiationActionButtonText}>
                      قبول اقتراح السائق ({order.driver_proposed_price} ج.م)
                    </Text>
                  </TouchableOpacity>
                )}

                {order.negotiation_status !== 'accepted' && (
                  <View style={styles.negotiationInputContainer}>
                    <Text style={styles.negotiationInputLabel}>اقترح سعر جديد:</Text>
                    <TextInput
                      style={styles.negotiationInput}
                      value={proposedPrice}
                      onChangeText={setProposedPrice}
                      keyboardType="numeric"
                      placeholder="أدخل السعر"
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity
                      style={[styles.negotiationActionButton, styles.proposeButton]}
                      onPress={proposePrice}
                      disabled={!proposedPrice}
                    >
                      <Text style={styles.negotiationActionButtonText}>إرسال الاقتراح</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return '#34C759';
    case 'accepted':
    case 'pickedUp':
    case 'inTransit':
      return '#007AFF';
    case 'cancelled':
      return '#FF3B30';
    default:
      return '#FF9500';
  }
};

const getStatusText = (status: string, searchStatus?: string) => {
  // إذا كان البحث متوقفاً، عرض رسالة واضحة
  if (searchStatus === 'stopped' && status === 'pending') {
    return 'لم يتم العثور على سائق';
  }
  
  switch (status) {
    case 'pending':
      return 'قيد الانتظار';
    case 'accepted':
      return 'مقبول';
    case 'pickedUp':
      return 'تم الاستلام';
    case 'inTransit':
      return 'قيد التوصيل';
    case 'completed':
      return 'مكتمل';
    case 'cancelled':
      return 'ملغي';
    default:
      return status;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: responsive.getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 12,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'right',
  },
  content: {
    padding: responsive.getResponsivePadding(),
    paddingBottom: responsive.getResponsivePadding() + 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderType: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
  },
  date: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 16,
    textAlign: 'right',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  address: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  priceLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#666',
  },
  priceValue: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#34C759',
  },
  negotiationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  negotiationButtonText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#FF9500',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#999',
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
    maxWidth: responsive.isLargeScreen() ? 600 : '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  negotiationInfo: {
    gap: 16,
  },
  negotiationPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  negotiationPriceLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  negotiationOriginalPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#007AFF',
  },
  negotiationDriverPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#34C759',
  },
  negotiationInputContainer: {
    marginTop: 16,
  },
  negotiationInputLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'right',
  },
  negotiationInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: responsive.getResponsiveFontSize(16),
    textAlign: 'right',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  negotiationActionButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
  proposeButton: {
    backgroundColor: '#007AFF',
  },
  negotiationActionButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    minHeight: 50,
  },
  restartSearchButton: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  restartSearchButtonText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
  cancelOrderButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  cancelOrderButtonText: {
    color: '#FF3B30',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});

