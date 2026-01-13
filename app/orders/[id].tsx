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
import OrderTimeline from '@/components/OrderTimeline';

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
      // جلب إعدادات البحث لحساب search_expires_at
      const { data: settings } = await supabase
        .from('order_search_settings')
        .select('setting_key, setting_value');
      
      const searchDuration = parseFloat(
        settings?.find(s => s.setting_key === 'search_duration_seconds')?.setting_value || 
        settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || 
        '60'
      );
      
      // حساب search_expires_at = search_started_at + searchDuration
      const searchStartedAt = new Date().toISOString();
      const expiresDate = new Date(searchStartedAt);
      expiresDate.setSeconds(expiresDate.getSeconds() + searchDuration);
      const searchExpiresAt = expiresDate.toISOString();
      
      // تحديث حالة البحث لإعادة التشغيل
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          search_status: 'searching',
          search_started_at: searchStartedAt,
          search_expires_at: searchExpiresAt, // تحديث search_expires_at للعداد الموحد
          search_expanded_at: null,
          driver_id: null,
        })
        .eq('id', order.id);

      if (updateError) {
        showSimpleAlert('خطأ', 'فشل تحديث حالة البحث', 'error');
        setIsRestarting(false);
        return;
      }

      // تحديد نقطة البحث حسب نوع الطلب
      let searchPoint: { lat: number; lon: number } | null = null;
      let searchAddress = '';

      if (order.order_type === 'outside' && order.items && Array.isArray(order.items) && order.items.length > 0) {
        // طلب من بره: البحث من أبعد نقطة في items
        searchAddress = order.items[0]?.address || order.pickup_address || '';
      } else if (order.order_type === 'package') {
        // توصيل طرد: البحث من نقطة الانطلاق
        searchAddress = order.pickup_address || '';
      }

      // إذا لم نجد عنوان، نستخدم delivery_address كحل أخير
      if (!searchAddress && order.delivery_address) {
        searchAddress = order.delivery_address;
      }

      if (searchAddress) {
        // تحويل العنوان إلى إحداثيات باستخدام Nominatim API
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1&accept-language=ar`;
          const geocodeResponse = await fetch(nominatimUrl, {
            headers: {
              'User-Agent': 'FlashDelivery/1.0',
            },
          });

          if (geocodeResponse.ok) {
            const geocodeData = await geocodeResponse.json();
            if (geocodeData && geocodeData.length > 0) {
              searchPoint = {
                lat: parseFloat(geocodeData[0].lat),
                lon: parseFloat(geocodeData[0].lon),
              };
            }
          }
        } catch (geocodeErr) {
          console.error('Error geocoding address:', geocodeErr);
        }
      }

      // إذا تم تحديد نقطة البحث، ابدأ البحث التلقائي
      if (searchPoint) {
        try {
          const searchResponse = await supabase.functions.invoke('start-order-search', {
            body: {
              order_id: order.id,
              search_point: searchPoint,
            },
          });

          if (searchResponse.error) {
            console.error('Error starting order search:', searchResponse.error);
          } else if (searchResponse.data?.success) {
            console.log('✅ Started search for order:', order.id);
          }
        } catch (searchErr) {
          console.error('Exception starting order search:', searchErr);
        }
      } else {
        console.warn('⚠️ Could not determine search point, search may not start automatically');
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
              {order.order_type === 'package' ? 'توصيل طلب' : 'طلب شراء'}
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

          {/* الشريط الزمني للطلب */}
          <OrderTimeline order={order} />

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
    borderBottomWidth: 0,
    gap: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 3,
    }),
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
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 6,
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderType: {
    fontSize: responsive.getResponsiveFontSize(22),
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.2,
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
    fontSize: responsive.getResponsiveFontSize(15),
    color: '#8E8E93',
    marginBottom: 20,
    textAlign: 'right',
    fontWeight: '400',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  address: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#8E8E93',
    flex: 1,
    textAlign: 'right',
    lineHeight: 24,
    fontWeight: '400',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 0,
  },
  priceLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#666',
  },
  priceValue: {
    fontSize: responsive.getResponsiveFontSize(22),
    fontWeight: '700',
    color: '#34C759',
    letterSpacing: 0.3,
  },
  negotiationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9500',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    gap: 8,
    borderWidth: 0,
    ...createShadowStyle({
      shadowColor: '#FF9500',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  negotiationButtonText: {
    fontSize: responsive.getResponsiveFontSize(15),
    color: '#fff',
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
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: responsive.isLargeScreen() ? 600 : '100%',
    maxHeight: '80%',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 12,
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    borderBottomWidth: 0,
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(22),
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.2,
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
    backgroundColor: '#F5F5F7',
    borderRadius: 16,
    padding: 16,
    fontSize: responsive.getResponsiveFontSize(16),
    textAlign: 'right',
    marginBottom: 16,
    borderWidth: 0,
  },
  negotiationActionButton: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
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
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 0,
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    borderRadius: 16,
    minHeight: 56,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  restartSearchButton: {
    backgroundColor: '#007AFF',
    borderWidth: 0,
  },
  restartSearchButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
  cancelOrderButton: {
    backgroundColor: '#FF3B30',
    borderWidth: 0,
  },
  cancelOrderButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});

