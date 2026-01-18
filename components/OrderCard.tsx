import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import responsive, { createShadowStyle, getM3CardStyle, getM3ButtonStyle, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import type { Order } from '@/hooks/useMyOrders';
import OrderSearchCountdown from './OrderSearchCountdown';
import { showConfirm, showSimpleAlert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';

interface OrderCardProps {
  order: Order;
  onPress?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  onAccept?: (order: Order) => void;
  onNegotiate?: (order: Order) => void;
  onRestartSearch?: (order: Order) => void; // إعادة البحث عن سائق
  onOrderUpdated?: () => void; // callback عند تحديث الطلب
  showActions?: boolean; // إظهار أزرار الإجراءات
}

function OrderCard({ 
  order, 
  onPress, 
  onCancel, 
  onAccept, 
  onNegotiate,
  onRestartSearch,
  onOrderUpdated,
  showActions = true 
}: OrderCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isMultiPoint = order.items && Array.isArray(order.items) && order.items.length > 2;
  
  // حالة التفاوض
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [proposedPrice, setProposedPrice] = useState('');
  const [customerProposedPrice, setCustomerProposedPrice] = useState(''); // للعميل: السعر المقترح
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // تحديد إذا كان الطلب نشطاً (يمكن إجراء عمليات عليه)
  const isActive = !['completed', 'cancelled'].includes(order.status);
  
  // تحديد الدور
  const isCustomer = user?.role === 'customer';
  const isDriver = user?.role === 'driver';
  
  // تحديد إذا كان السائق قد قبل الطلب وبدأ التفاوض (status = accepted و driver_id = user.id و لا يوجد driver_proposed_price بعد)
  const isDriverInNegotiation = isDriver && order.status === 'accepted' && order.driver_id === user?.id && !order.driver_proposed_price && !order.negotiation_status;
  
  // تهيئة proposedPrice عندما تظهر واجهة التفاوض
  useEffect(() => {
    if (isDriverInNegotiation) {
      if (!proposedPrice) {
        setProposedPrice((order.negotiated_price || order.total_fee).toString());
      }
      setShowNegotiation(true);
    }
  }, [isDriverInNegotiation, order.negotiated_price, order.total_fee]);
  
  // حفظ order في ref لتجنب إعادة إنشاء callback عند تغيير order object reference
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);
  
  // Wrapper function لـ onRestartSearch لتتوافق مع OrderSearchCountdown
  // استخدام ref لتجنب إعادة إنشاء callback عند تغيير order object reference
  const handleRestartSearch = useCallback((e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    if (onRestartSearch) {
      onRestartSearch(orderRef.current);
    }
  }, [onRestartSearch]); // الاعتماد على onRestartSearch فقط
  
  // تحديد الأزرار المتاحة حسب الدور وحالة الطلب
  const canCancel = isActive && (isCustomer || (isDriver && order.status === 'pending'));
  const canAccept = isDriver && isActive && order.status === 'pending';
  const canNegotiate = isDriver && isActive && order.status === 'pending';
  // للعميل: عرض التفاوض إذا كان الطلب مقبولاً وهناك اقتراح من السائق
  const showCustomerNegotiation = isCustomer && order.status === 'accepted' && order.negotiation_status === 'driver_proposed' && order.driver_proposed_price;
  
  // للسائق: عرض اقتراح العميل إذا كان الطلب مقبولاً وهناك اقتراح من العميل
  const showDriverCustomerProposal = isDriver && order.status === 'accepted' && order.negotiation_status === 'customer_proposed' && order.customer_proposed_price;
  
  // للعميل: إمكانية متابعة الطلب (للطلبات النشطة التي لديها سائق)
  const canTrackOrder = isCustomer && isActive && order.driver_id && ['accepted', 'pickedUp', 'inTransit'].includes(order.status);

  // M3 Status Colors with Tonal Palettes
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return M3Theme.statusStyles.success; // Light green bg, dark green text
      case 'accepted':
      case 'pickedUp':
      case 'inTransit':
        return M3Theme.statusStyles.info; // Light blue bg, dark blue text
      case 'cancelled':
        return M3Theme.statusStyles.error; // Light red bg, dark red text
      default:
        return M3Theme.statusStyles.pending; // Light yellow bg, dark yellow text
    }
  };
  
  // Legacy function for backward compatibility (if needed elsewhere)
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return M3Theme.colors.success.onContainer;
      case 'accepted':
      case 'pickedUp':
      case 'inTransit':
        return M3Theme.colors.info.onContainer;
      case 'cancelled':
        return M3Theme.colors.onErrorContainer;
      default:
        return M3Theme.colors.pending.onContainer;
    }
  };

  const getStatusText = (status: string) => {
    // إذا كان البحث متوقفاً، عرض رسالة واضحة
    if (order.search_status === 'stopped' && status === 'pending') {
      return 'لم يتم العثور على سائق';
    }
    
    // إذا كان البحث جارياً، عرض رسالة واضحة
    if ((order.search_status === 'searching' || order.search_status === 'expanded') && status === 'pending') {
      return 'جاري البحث عن سائق';
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

  const handlePress = (e?: any) => {
    // منع التنقل إذا كان الضغط على TextInput أو أي عنصر تفاعلي
    if (e?.target?.tagName === 'INPUT' || e?.nativeEvent?.target?.tagName === 'INPUT') {
      return;
    }
    if (onPress) {
      onPress(order);
    } else {
      router.push(`/orders/${order.id}`);
    }
  };

  const handleCancel = async (e: any) => {
    e.stopPropagation();
    if (onCancel) {
      onCancel(order);
    } else {
      const confirmed = await showConfirm(
        'إلغاء الطلب',
        'هل أنت متأكد من إلغاء هذا الطلب؟',
        {
          confirmText: 'نعم، إلغاء',
          cancelText: 'لا',
          type: 'warning',
        }
      );
      if (confirmed) {
        // سيتم التعامل مع الإلغاء في الصفحة الأم
      }
    }
  };

  const handleAccept = (e: any) => {
    e.stopPropagation();
    if (onAccept) {
      onAccept(order);
    }
  };

  // دالة بدء التفاوض (تقبل الطلب أولاً)
  const handleStartNegotiation = async (e: any) => {
    e.stopPropagation();
    
    setIsAccepting(true);
    try {
      // قبول الطلب أولاً
      const { error: acceptError } = await supabase
        .from('orders')
        .update({
          status: 'accepted',
          driver_id: user?.id,
        })
        .eq('id', order.id);

      if (acceptError) throw acceptError;

      // إشعار العميل ببدء التفاوض
      if (order.customer_id) {
        await createNotification({
          user_id: order.customer_id,
          title: 'بدء التفاوض',
          message: 'السائق قبل الطلب وبدأ التفاوض على السعر',
          type: 'info',
          order_id: order.id,
        });
      }

      // فتح واجهة التفاوض
      setShowNegotiation(true);
      setProposedPrice((order.negotiated_price || order.total_fee).toString());
      
      // تحديث البيانات في الصفحة الأم (سيتم عرض واجهة التفاوض من خلال isDriverInNegotiation بعد التحديث)
      if (onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error: any) {
      console.error('Error starting negotiation:', error);
      showSimpleAlert('خطأ', error.message || 'فشل بدء التفاوض', 'error');
    } finally {
      setIsAccepting(false);
    }
  };

  // دالة اختيار اقتراح سريع (+5، +10، +15، +20)
  const handleQuickProposal = (amount: number) => {
    const basePrice = order.negotiated_price || order.total_fee;
    const newPrice = basePrice + amount;
    setProposedPrice(newPrice.toString());
  };
  
  // للسائق: فتح واجهة التفاوض عندما يكون هناك اقتراح من العميل (بدلاً من قبوله مباشرة)
  useEffect(() => {
    if (showDriverCustomerProposal && !showNegotiation) {
      // يمكن فتح واجهة التفاوض تلقائياً أو يمكن للسائق أن يختار
      // حالياً سنتركه كما هو (يعرض اقتراح العميل مع زر القبول)
    }
  }, [showDriverCustomerProposal, showNegotiation]);

  // دالة إرسال اقتراح السعر
  const handleProposePrice = async (e: any) => {
    e.stopPropagation();
    if (!proposedPrice) {
      showSimpleAlert('خطأ', 'يرجى اختيار أو إدخال سعر مقترح', 'error');
      return;
    }

    const price = parseFloat(proposedPrice);
    if (isNaN(price) || price <= 0) {
      showSimpleAlert('خطأ', 'يرجى إدخال سعر صحيح', 'error');
      return;
    }

    setIsNegotiating(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          driver_proposed_price: price,
          negotiation_status: 'driver_proposed',
          customer_proposed_price: null, // إزالة اقتراح العميل السابق (إن وجد)
        })
        .eq('id', order.id);

      if (error) throw error;

      // إشعار العميل
      if (order.customer_id) {
        await createNotification({
          user_id: order.customer_id,
          title: 'اقتراح سعر جديد',
          message: `اقترح السائق سعر جديد: ${price} ج.م`,
          type: 'info',
          order_id: order.id,
        });
      }

      showSimpleAlert('نجح', 'تم إرسال اقتراح السعر', 'success');
      setShowNegotiation(false);
      setProposedPrice('');
      // إعلام الصفحة الأم بالتحديث
      if (onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error: any) {
      console.error('Error proposing price:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إرسال الاقتراح', 'error');
    } finally {
      setIsNegotiating(false);
    }
  };

  // دالة قبول اقتراح السائق للعميل
  const handleAcceptDriverProposal = async (e: any) => {
    e.stopPropagation();
    if (!order.driver_proposed_price) return;

    const confirmed = await showConfirm(
      'قبول اقتراح السائق',
      `هل تريد قبول السعر المقترح ${order.driver_proposed_price} ج.م؟`,
      {
        confirmText: 'نعم، قبول',
        cancelText: 'إلغاء',
        type: 'question',
      }
    );

    if (!confirmed) return;

    setIsNegotiating(true);
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
      // إعلام الصفحة الأم بالتحديث
      if (onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error: any) {
      console.error('Error accepting proposal:', error);
      showSimpleAlert('خطأ', error.message || 'فشل قبول الاقتراح', 'error');
    } finally {
      setIsNegotiating(false);
    }
  };

  // دالة العميل لإرسال اقتراح سعر جديد
  const handleCustomerProposePrice = async (e: any) => {
    e.stopPropagation();
    if (!customerProposedPrice) {
      showSimpleAlert('خطأ', 'يرجى إدخال سعر مقترح', 'error');
      return;
    }

    const price = parseFloat(customerProposedPrice);
    if (isNaN(price) || price <= 0) {
      showSimpleAlert('خطأ', 'يرجى إدخال سعر صحيح', 'error');
      return;
    }

    setIsNegotiating(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          customer_proposed_price: price,
          negotiation_status: 'customer_proposed',
          driver_proposed_price: null, // إزالة اقتراح السائق السابق
        })
        .eq('id', order.id);

      if (error) throw error;

      // إشعار السائق
      if (order.driver_id) {
        await createNotification({
          user_id: order.driver_id,
          title: 'اقتراح سعر جديد من العميل',
          message: `اقترح العميل سعر جديد: ${price} ج.م`,
          type: 'info',
          order_id: order.id,
        });
      }

      showSimpleAlert('نجح', 'تم إرسال اقتراح السعر', 'success');
      setCustomerProposedPrice('');
      // إعلام الصفحة الأم بالتحديث
      if (onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error: any) {
      console.error('Error proposing price:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إرسال الاقتراح', 'error');
    } finally {
      setIsNegotiating(false);
    }
  };

  // دالة السائق لقبول اقتراح العميل
  const handleDriverAcceptCustomerProposal = async (e: any) => {
    e.stopPropagation();
    if (!order.customer_proposed_price) return;

    const confirmed = await showConfirm(
      'قبول اقتراح العميل',
      `هل تريد قبول السعر المقترح من العميل ${order.customer_proposed_price} ج.م؟`,
      {
        confirmText: 'نعم، قبول',
        cancelText: 'إلغاء',
        type: 'question',
      }
    );

    if (!confirmed) return;

    setIsNegotiating(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          negotiation_status: 'accepted',
          negotiated_price: order.customer_proposed_price,
          total_fee: order.customer_proposed_price,
          customer_proposed_price: null, // إزالة اقتراح العميل بعد القبول
        })
        .eq('id', order.id);

      if (error) throw error;

      // إشعار العميل
      if (order.customer_id) {
        await createNotification({
          user_id: order.customer_id,
          title: 'تم قبول اقتراحك',
          message: `تم قبول اقتراحك للسعر ${order.customer_proposed_price} ج.م`,
          type: 'success',
          order_id: order.id,
        });
      }

      showSimpleAlert('نجح', 'تم قبول اقتراح العميل', 'success');
      // إعلام الصفحة الأم بالتحديث
      if (onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error: any) {
      console.error('Error accepting customer proposal:', error);
      showSimpleAlert('خطأ', error.message || 'فشل قبول الاقتراح', 'error');
    } finally {
      setIsNegotiating(false);
    }
  };

  return (
    <Pressable 
      style={({ pressed }) => [styles.card, pressed && !isInputFocused && { opacity: 0.7 }]}
      onPress={() => {
        if (!isInputFocused) {
          handlePress();
        }
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name={order.order_type === 'package' ? 'cube' : 'cart'}
            size={24}
            color="#007AFF"
          />
          <View style={styles.info}>
            <Text style={styles.orderType}>
              {order.order_type === 'package' ? 'توصيل طلب' : 'طلب شراء'}
            </Text>
            <Text style={styles.date}>
              {new Date(order.created_at).toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, getStatusBadgeStyle(order.status)]}>
          <Text style={styles.statusText}>
            {getStatusText(order.status)}
          </Text>
        </View>
      </View>

      {/* شريط العداد التنازلي للبحث عن السائقين */}
      {/* نعرض العدّاد للطلبات pending أو accepted حديثاً (للاكتشاف الفوري للتغييرات) */}
      {/* نسمح للمكوّن بالبقاء قيد التشغيل حتى يكتشف التغيير من polling أو realtime */}
      {/* الشرط: pending أو (accepted بدون driver_id) - للسماح باكتشاف التغيير حتى بعد قبول السائق */}
      {/* المكوّن نفسه سيتوقف تلقائياً عند اكتشاف driver_id */}
      {(order.status === 'pending' || (order.status === 'accepted' && !order.driver_id)) && (
        <OrderSearchCountdown 
          key={order.id}
          orderId={order.id} 
          onRestartSearch={onRestartSearch ? handleRestartSearch : undefined}
        />
      )}

      {isMultiPoint ? (
        <View style={styles.multiPointContainer}>
          <Text style={styles.multiPointTitle}>
            <Ionicons
              name="map"
              size={responsive.getResponsiveFontSize(16)}
              color="#007AFF"
            />{' '}
            مسار متعدد النقاط ({order.items.length} نقاط)
          </Text>
          {order.items.slice(0, 3).map((point: any, index: number) => (
            <View key={index} style={styles.multiPointRow}>
              <Ionicons
                name={
                  index === 0
                    ? 'flag'
                    : index === order.items.length - 1
                    ? 'location'
                    : 'ellipse'
                }
                size={responsive.getResponsiveFontSize(14)}
                color={
                  index === 0
                    ? '#34C759'
                    : index === order.items.length - 1
                    ? '#FF3B30'
                    : '#FF9500'
                }
              />
              <Text style={styles.multiPointAddress}>
                {point.address || point.description}
              </Text>
            </View>
          ))}
          {order.items.length > 3 && (
            <Text style={styles.multiPointMore}>
              و {order.items.length - 3} نقطة أخرى...
            </Text>
          )}
        </View>
      ) : (
        <>
          {order.pickup_address && (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={16} color="#34C759" />
              <Text style={styles.address} numberOfLines={1}>
                من: {order.pickup_address}
              </Text>
            </View>
          )}
          {order.delivery_address && (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={16} color="#FF3B30" />
              <Text style={styles.address} numberOfLines={1}>
                إلى: {order.delivery_address}
              </Text>
            </View>
          )}
          
          {/* عرض العناصر (order_items) إذا كانت موجودة */}
          {order.order_items && Array.isArray(order.order_items) && order.order_items.length > 0 && (
            <View style={styles.itemsContainer}>
              <View style={styles.itemsHeader}>
                <Ionicons name="cube-outline" size={16} color="#007AFF" />
                <Text style={styles.itemsTitle}>
                  العناصر ({order.order_items.length})
                </Text>
              </View>
              {order.order_items.slice(0, 3).map((item: any, index: number) => (
                <View key={item.id || index} style={styles.itemRow}>
                  <View style={styles.itemNumber}>
                    <Text style={styles.itemNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemAddress} numberOfLines={1}>
                      {item.address}
                    </Text>
                    {item.description && (
                      <Text style={styles.itemDescription} numberOfLines={1}>
                        {item.description}
                      </Text>
                    )}
                    {item.item_fee && (
                      <Text style={styles.itemFee}>
                        المبلغ: {parseFloat(item.item_fee).toFixed(2)} ج.م
                      </Text>
                    )}
                  </View>
                  {item.is_picked_up && (
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                  )}
                </View>
              ))}
              {order.order_items.length > 3 && (
                <Text style={styles.itemsMore}>
                  و {order.order_items.length - 3} عنصر آخر...
                </Text>
              )}
            </View>
          )}
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.fee}>
          الأجرة: {order.negotiated_price || order.total_fee} ج.م
        </Text>
        
        {/* عرض التفاوض للعميل في الطلب النشط */}
        {showCustomerNegotiation && (
          <View style={styles.customerNegotiationContainer}>
            <Text style={styles.negotiationTitle}>اقتراح سعر من السائق</Text>
            <View style={styles.negotiationPriceInfo}>
              <Text style={styles.negotiationPriceLabel}>السعر الأصلي:</Text>
              <Text style={styles.negotiationOriginalPrice}>{order.total_fee} ج.م</Text>
            </View>
            <View style={styles.negotiationPriceInfo}>
              <Text style={styles.negotiationPriceLabel}>السعر المقترح:</Text>
              <Text style={styles.negotiationProposedPrice}>{order.driver_proposed_price} ج.م</Text>
            </View>
            <TouchableOpacity
              style={styles.acceptProposalButton}
              onPress={handleAcceptDriverProposal}
              disabled={isNegotiating}
            >
              {isNegotiating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.acceptProposalButtonText}>قبول السعر المقترح</Text>
                </>
              )}
            </TouchableOpacity>
            
            {/* خيار اقتراح سعر جديد للعميل */}
            <View style={styles.customerProposeContainer}>
              <Text style={styles.customPriceLabel}>أو اقترح سعر جديد:</Text>
              <View style={styles.negotiationInputRow}>
                <View 
                  style={{ flex: 1 }}
                  onStartShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                >
                  <TextInput
                    style={styles.negotiationInput}
                    value={customerProposedPrice}
                    onChangeText={setCustomerProposedPrice}
                    keyboardType="numeric"
                    placeholder="أدخل السعر المقترح"
                    placeholderTextColor="#999"
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.proposeButton, (isNegotiating || !customerProposedPrice) && styles.proposeButtonDisabled]}
                  onPress={handleCustomerProposePrice}
                  disabled={isNegotiating || !customerProposedPrice}
                >
                  {isNegotiating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.proposeButtonText}>إرسال</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* عرض اقتراح العميل للسائق */}
      {showDriverCustomerProposal && (
        <View 
          style={styles.driverCustomerProposalContainer}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <Text style={styles.negotiationTitle}>اقتراح سعر من العميل</Text>
          <View style={styles.negotiationPriceInfo}>
            <Text style={styles.negotiationPriceLabel}>السعر الأصلي:</Text>
            <Text style={styles.negotiationOriginalPrice}>{order.total_fee} ج.م</Text>
          </View>
          <View style={styles.negotiationPriceInfo}>
            <Text style={styles.negotiationPriceLabel}>السعر المقترح:</Text>
            <Text style={styles.negotiationProposedPrice}>{order.customer_proposed_price} ج.م</Text>
          </View>
          <TouchableOpacity
            style={styles.acceptProposalButton}
            onPress={handleDriverAcceptCustomerProposal}
            disabled={isNegotiating}
          >
            {isNegotiating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.acceptProposalButtonText}>قبول السعر المقترح</Text>
              </>
            )}
          </TouchableOpacity>
          
          {/* خيار اقتراح سعر جديد للسائق */}
          <TouchableOpacity
            style={[styles.proposeButton, styles.proposeNewPriceButton]}
            onPress={(e) => { e.stopPropagation(); setShowNegotiation(true); setProposedPrice((order.negotiated_price || order.total_fee).toString()); }}
            disabled={isNegotiating}
          >
            <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
            <Text style={styles.proposeButtonText}>اقترح سعر جديد</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* قسم التفاوض للسائق (عندما يريد اقتراح سعر جديد بعد رؤية اقتراح العميل أو في البداية) */}
      {(isDriver && ((showNegotiation || isDriverInNegotiation) || (showDriverCustomerProposal && showNegotiation))) && (
        <View 
          style={styles.negotiationContainer} 
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <View style={styles.negotiationHeader}>
            <Text style={styles.negotiationTitle}>التفاوض على السعر</Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowNegotiation(false); }}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.negotiationPriceRow}>
            <Text style={styles.negotiationPriceLabel}>السعر الأساسي:</Text>
            <Text style={styles.negotiationCurrentPrice}>{order.negotiated_price || order.total_fee} ج.م</Text>
          </View>

          {/* 4 اقتراحات سريعة */}
          <View style={styles.quickProposalsContainer}>
            <Text style={styles.quickProposalsLabel}>اختر اقتراح سريع:</Text>
            <View style={styles.quickProposalsRow}>
              <TouchableOpacity
                style={[styles.quickProposalButton, proposedPrice === ((order.negotiated_price || order.total_fee) + 5).toString() && styles.quickProposalButtonActive]}
                onPress={() => handleQuickProposal(5)}
              >
                <Text style={[styles.quickProposalText, proposedPrice === ((order.negotiated_price || order.total_fee) + 5).toString() && styles.quickProposalTextActive]}>
                  +5 ج.م
                </Text>
                <Text style={styles.quickProposalPrice}>{(order.negotiated_price || order.total_fee) + 5} ج.م</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.quickProposalButton, proposedPrice === ((order.negotiated_price || order.total_fee) + 10).toString() && styles.quickProposalButtonActive]}
                onPress={() => handleQuickProposal(10)}
              >
                <Text style={[styles.quickProposalText, proposedPrice === ((order.negotiated_price || order.total_fee) + 10).toString() && styles.quickProposalTextActive]}>
                  +10 ج.م
                </Text>
                <Text style={styles.quickProposalPrice}>{(order.negotiated_price || order.total_fee) + 10} ج.م</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.quickProposalButton, proposedPrice === ((order.negotiated_price || order.total_fee) + 15).toString() && styles.quickProposalButtonActive]}
                onPress={() => handleQuickProposal(15)}
              >
                <Text style={[styles.quickProposalText, proposedPrice === ((order.negotiated_price || order.total_fee) + 15).toString() && styles.quickProposalTextActive]}>
                  +15 ج.م
                </Text>
                <Text style={styles.quickProposalPrice}>{(order.negotiated_price || order.total_fee) + 15} ج.م</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.quickProposalButton, proposedPrice === ((order.negotiated_price || order.total_fee) + 20).toString() && styles.quickProposalButtonActive]}
                onPress={() => handleQuickProposal(20)}
              >
                <Text style={[styles.quickProposalText, proposedPrice === ((order.negotiated_price || order.total_fee) + 20).toString() && styles.quickProposalTextActive]}>
                  +20 ج.م
                </Text>
                <Text style={styles.quickProposalPrice}>{(order.negotiated_price || order.total_fee) + 20} ج.م</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* أو إدخال سعر مخصص */}
          <View style={styles.negotiationInputRow}>
            <Text style={styles.customPriceLabel}>أو أدخل سعر مخصص:</Text>
            <View 
              style={{ flex: 1 }}
              onStartShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
            >
              <TextInput
                style={styles.negotiationInput}
                value={proposedPrice}
                onChangeText={setProposedPrice}
                keyboardType="numeric"
                placeholder="أدخل السعر المقترح"
                placeholderTextColor="#999"
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
              />
            </View>
          </View>

          {/* زر الإرسال */}
          <TouchableOpacity
            style={[styles.proposeButton, (isNegotiating || !proposedPrice) && styles.proposeButtonDisabled]}
            onPress={handleProposePrice}
            disabled={isNegotiating || !proposedPrice}
          >
            {isNegotiating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.proposeButtonText}>إرسال الاقتراح</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* أزرار الإجراءات */}
      {showActions && isActive && (
        <View style={styles.actionsContainer}>
          {/* للعميل: عندما البحث متوقف، إظهار زر إعادة البحث وزر الإلغاء */}
          {isCustomer && (order.search_status === 'stopped') && order.status === 'pending' && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.restartSearchButton]}
                onPress={handleRestartSearch}
              >
                <Ionicons name="refresh" size={18} color="#007AFF" />
                <Text style={[styles.actionButtonText, styles.restartSearchButtonText]}>
                  إعادة البحث عن سائق
                </Text>
              </TouchableOpacity>
              {canCancel && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Ionicons name="close-circle" size={18} color="#FF3B30" />
                  <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                    إلغاء الطلب
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
          
          {/* للعميل: زر متابعة الطلب */}
          {canTrackOrder && (
            <TouchableOpacity
              style={[styles.actionButton, styles.trackButton]}
              onPress={() => router.push(`/customer/track-order?orderId=${order.id}`)}
            >
              <Ionicons name="location" size={18} color="#007AFF" />
              <Text style={[styles.actionButtonText, styles.trackButtonText]}>
                متابعة الطلب
              </Text>
            </TouchableOpacity>
          )}
          
          {/* للعميل: زر إلغاء (عندما البحث غير متوقف) */}
          {isCustomer && canCancel && (order.search_status !== 'stopped' || !order.search_status) && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Ionicons name="close-circle" size={18} color="#FF3B30" />
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                إلغاء
              </Text>
            </TouchableOpacity>
          )}

          {/* للسائق: أزرار قبول، تفاوض، إلغاء */}
          {isDriver && (
            <>
              {canAccept && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={handleAccept}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                  <Text style={[styles.actionButtonText, styles.acceptButtonText]}>
                    قبول ({order.negotiated_price || order.total_fee} ج.م)
                  </Text>
                </TouchableOpacity>
              )}
              
              {canNegotiate && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.negotiateButton, isAccepting && styles.actionButtonDisabled]}
                  onPress={handleStartNegotiation}
                  disabled={isAccepting}
                >
                  {isAccepting ? (
                    <ActivityIndicator color="#FF9500" size="small" />
                  ) : (
                    <>
                      <Ionicons name="chatbubble-ellipses" size={18} color="#FF9500" />
                      <Text style={[styles.actionButtonText, styles.negotiateButtonText]}>
                        تفاوض
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              
              {canCancel && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Ionicons name="close-circle" size={18} color="#FF3B30" />
                  <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                    رفض
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...getM3CardStyle(), // M3: 16px radius, 16px padding, subtle shadow
    backgroundColor: M3Theme.colors.surface, // M3 Surface #FFFBFE
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  info: {
    flex: 1,
  },
  orderType: {
    ...M3Theme.typography.titleLarge, // 22px, weight 500 (semi-bold)
    color: M3Theme.colors.onSurface,
    marginBottom: 6,
  },
  date: {
    ...M3Theme.typography.bodySmall, // 12px
    color: M3Theme.colors.onSurfaceVariant, // #49454F
  },
  statusBadge: {
    paddingHorizontal: M3Theme.spacing.sm, // 8px
    paddingVertical: M3Theme.spacing.xs, // 4px
    borderRadius: M3Theme.shape.cornerSmall, // 8px
  },
  statusText: {
    ...M3Theme.typography.labelMedium, // 12px, weight 600
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  address: {
    ...M3Theme.typography.bodyMedium, // 14px base font
    color: M3Theme.colors.onSurfaceVariant,
    flex: 1,
    textAlign: 'right',
  },
  multiPointContainer: {
    backgroundColor: M3Theme.colors.surfaceVariant, // #E7E0EC
    borderRadius: M3Theme.shape.cornerLarge, // 16px
    padding: M3Theme.spacing.md, // 16px
    marginTop: 12,
  },
  multiPointTitle: {
    ...M3Theme.typography.labelLarge, // 14px, weight 600
    color: M3Theme.colors.primary,
    marginBottom: 8,
    textAlign: 'right',
  },
  multiPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  multiPointAddress: {
    ...M3Theme.typography.bodySmall, // 12px
    color: M3Theme.colors.onSurfaceVariant,
    flex: 1,
    textAlign: 'right',
  },
  multiPointMore: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0,
  },
  fee: {
    ...M3Theme.typography.titleLarge, // 22px, weight 500
    fontWeight: '700', // Override for emphasis
    color: M3Theme.colors.success.onContainer, // Dark green
    textAlign: 'right',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: M3Theme.spacing.lg, // 24px
    paddingVertical: M3Theme.spacing.md, // 16px
    borderRadius: M3Theme.shape.cornerLarge, // 16px
    minWidth: 110, // Custom minWidth (>= 44px from M3 requirement)
    minHeight: 44, // M3 minimum touch target
    justifyContent: 'center',
    ...Platform.select({
      web: M3Theme.webViewStyles.button, // user-select: none
    }),
  },
  acceptButton: {
    backgroundColor: M3Theme.colors.success.onContainer, // Dark green for filled button
    borderWidth: 0,
  },
  negotiateButton: {
    backgroundColor: M3Theme.colors.warning.onContainer, // Dark orange for filled button
    borderWidth: 0,
  },
  cancelButton: {
    backgroundColor: M3Theme.colors.error, // M3 Error color
    borderWidth: 0,
  },
  actionButtonText: {
    ...M3Theme.typography.labelLarge, // 14px, weight 600
    color: '#fff', // Will be overridden by button-specific styles
  },
  acceptButtonText: {
    color: '#fff',
  },
  negotiateButtonText: {
    color: '#fff',
  },
  cancelButtonText: {
    color: '#fff',
  },
  restartSearchButton: {
    ...M3Theme.buttonVariants.outlined, // M3 Outlined button variant
    backgroundColor: M3Theme.colors.info.container, // Light blue background
    borderColor: M3Theme.colors.info.onContainer, // Dark blue border
  },
  restartSearchButtonText: {
    ...M3Theme.typography.labelLarge,
    color: M3Theme.colors.info.onContainer,
  },
  trackButton: {
    ...M3Theme.buttonVariants.outlined,
    backgroundColor: M3Theme.colors.info.container,
    borderColor: M3Theme.colors.info.onContainer,
  },
  trackButtonText: {
    ...M3Theme.typography.labelLarge,
    color: M3Theme.colors.info.onContainer,
  },
  driverProposalContainer: {
    marginTop: 12,
    padding: M3Theme.spacing.md, // 16px
    ...M3Theme.statusStyles.success, // M3 Success tonal palette
    borderRadius: M3Theme.shape.cornerMedium, // 12px
    borderWidth: 1,
    borderColor: M3Theme.colors.success.onContainer,
  },
  driverProposalLabel: {
    ...M3Theme.typography.labelMedium, // 12px, weight 600
    color: M3Theme.colors.onSurfaceVariant,
    marginBottom: 4,
    textAlign: 'right',
  },
  driverProposalPrice: {
    ...M3Theme.typography.titleMedium, // 16px, weight 600
    fontWeight: 'bold',
    color: M3Theme.colors.success.onContainer,
    textAlign: 'right',
    marginBottom: 8,
  },
  acceptProposalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: M3Theme.colors.success.onContainer,
    padding: M3Theme.spacing.sm, // 8px
    borderRadius: M3Theme.shape.cornerSmall, // 8px
    ...getM3TouchTarget('minimum'),
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  acceptProposalButtonText: {
    ...M3Theme.typography.labelLarge,
    color: '#fff',
  },
  negotiationContainer: {
    marginTop: 12,
    padding: M3Theme.spacing.md, // 16px
    ...M3Theme.statusStyles.warning, // M3 Warning tonal palette
    borderRadius: M3Theme.shape.cornerMedium, // 12px
    borderWidth: 1,
    borderColor: M3Theme.colors.warning.onContainer,
  },
  negotiationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  negotiationTitle: {
    ...M3Theme.typography.titleMedium, // 16px, weight 600
    color: M3Theme.colors.onSurface,
  },
  negotiationPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  negotiationPriceLabel: {
    ...M3Theme.typography.bodyMedium, // 14px
    color: M3Theme.colors.onSurfaceVariant,
  },
  negotiationCurrentPrice: {
    ...M3Theme.typography.titleMedium, // 16px, weight 600
    color: M3Theme.colors.primary,
  },
  negotiationInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  negotiationInput: {
    flex: 1,
    backgroundColor: M3Theme.colors.surface,
    borderRadius: M3Theme.shape.cornerSmall, // 8px
    padding: M3Theme.spacing.sm, // 8px
    fontSize: 16, // M3: 16px minimum for inputs (prevents iOS auto-zoom)
    textAlign: 'right',
    borderWidth: 1,
    borderColor: M3Theme.colors.outlineVariant,
  },
  proposeButton: {
    backgroundColor: M3Theme.colors.warning.onContainer,
    paddingHorizontal: M3Theme.spacing.lg, // 24px
    paddingVertical: M3Theme.spacing.md, // 16px
    borderRadius: M3Theme.shape.cornerSmall, // 8px
    minWidth: 80, // Custom minWidth (>= 44px from M3 requirement)
    minHeight: 44, // M3 minimum touch target
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  proposeButtonDisabled: {
    opacity: 0.5,
  },
  proposeButtonText: {
    ...M3Theme.typography.labelLarge,
    color: '#fff',
  },
  proposeNewPriceButton: {
    marginTop: 12,
    backgroundColor: '#FF9500',
  },
  closeNegotiationButton: {
    marginTop: 8,
    padding: M3Theme.spacing.md, // 16px
    alignItems: 'center',
    ...getM3TouchTarget('minimum'),
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  closeNegotiationButtonText: {
    ...M3Theme.typography.labelLarge,
    color: M3Theme.colors.onSurfaceVariant,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  quickProposalsContainer: {
    marginTop: 16,
    marginBottom: 12,
  },
  quickProposalsLabel: {
    ...M3Theme.typography.labelLarge,
    color: M3Theme.colors.onSurface,
    marginBottom: 8,
    textAlign: 'right',
  },
  quickProposalsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickProposalButton: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quickProposalButtonActive: {
    backgroundColor: '#FFF4E6',
    borderColor: '#FF9500',
  },
  quickProposalText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  quickProposalTextActive: {
    color: '#FF9500',
  },
  quickProposalPrice: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  customPriceLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  customerNegotiationContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  negotiationPriceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  negotiationProposedPrice: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#007AFF',
  },
  negotiationOriginalPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#8E8E93',
  },
  customerProposeContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
  },
  driverCustomerProposalContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  itemsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  itemsTitle: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#007AFF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  itemNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumberText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#fff',
  },
  itemInfo: {
    flex: 1,
  },
  itemAddress: {
    fontSize: responsive.getResponsiveFontSize(13),
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  itemDescription: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    marginBottom: 4,
  },
  itemFee: {
    fontSize: responsive.getResponsiveFontSize(11),
    color: '#34C759',
    fontWeight: '600',
  },
  itemsMore: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
    fontStyle: 'italic',
  },
});

// استخدام React.memo لمنع إعادة التحميل غير الضرورية
// إعادة التحميل فقط إذا تغير order.id أو callbacks أو حقول مهمة في order
export default memo(OrderCard, (prevProps, nextProps) => {
  // إعادة التحميل إذا تغير order.id
  const orderIdChanged = prevProps.order?.id !== nextProps.order?.id;
  
  // إعادة التحميل إذا تغيرت حقول مهمة في order (لكن بدون مقارنة كاملة للكائن)
  const orderChanged = 
    prevProps.order?.status !== nextProps.order?.status ||
    prevProps.order?.search_status !== nextProps.order?.search_status ||
    prevProps.order?.driver_id !== nextProps.order?.driver_id ||
    prevProps.order?.negotiation_status !== nextProps.order?.negotiation_status ||
    prevProps.order?.driver_proposed_price !== nextProps.order?.driver_proposed_price ||
    prevProps.order?.customer_proposed_price !== nextProps.order?.customer_proposed_price;
  
  // إعادة التحميل إذا تغيرت callbacks
  const callbacksChanged = 
    prevProps.onPress !== nextProps.onPress ||
    prevProps.onCancel !== nextProps.onCancel ||
    prevProps.onAccept !== nextProps.onAccept ||
    prevProps.onNegotiate !== nextProps.onNegotiate ||
    prevProps.onRestartSearch !== nextProps.onRestartSearch ||
    prevProps.onOrderUpdated !== nextProps.onOrderUpdated;
  
  const shouldUpdate = orderIdChanged || orderChanged || callbacksChanged;
  
  if (shouldUpdate && orderIdChanged) {
    console.log(`[OrderCard] 🔄 React.memo: order.id changed from ${prevProps.order?.id} to ${nextProps.order?.id}`);
  } else if (shouldUpdate && orderChanged) {
    console.log(`[OrderCard] 🔄 React.memo: order fields changed for order ${nextProps.order?.id}`);
  }
  
  // return true = skip re-render, return false = re-render
  return !shouldUpdate;
});

