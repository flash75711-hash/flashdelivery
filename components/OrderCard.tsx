import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import responsive from '@/utils/responsive';
import type { Order } from '@/hooks/useMyOrders';
import { OrderCountdownBar } from './OrderCountdownBar';

interface OrderCardProps {
  order: Order;
  onPress?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  onAccept?: (order: Order) => void;
  onNegotiate?: (order: Order) => void;
  showActions?: boolean; // إظهار أزرار الإجراءات
}

export default function OrderCard({ 
  order, 
  onPress, 
  onCancel, 
  onAccept, 
  onNegotiate,
  showActions = true 
}: OrderCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isMultiPoint = order.items && Array.isArray(order.items) && order.items.length > 2;
  
  // تحديد إذا كان الطلب نشطاً (يمكن إجراء عمليات عليه)
  const isActive = !['completed', 'cancelled'].includes(order.status);
  
  // تحديد الدور
  const isCustomer = user?.role === 'customer';
  const isDriver = user?.role === 'driver';
  
  // تحديد الأزرار المتاحة حسب الدور وحالة الطلب
  const canCancel = isActive && (isCustomer || (isDriver && order.status === 'pending'));
  const canAccept = isDriver && isActive && order.status === 'pending';
  const canNegotiate = isDriver && isActive && order.status === 'pending';

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

  const getStatusText = (status: string) => {
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

  const handlePress = () => {
    if (onPress) {
      onPress(order);
    } else {
      router.push(`/orders/${order.id}`);
    }
  };

  const handleCancel = (e: any) => {
    e.stopPropagation();
    if (onCancel) {
      onCancel(order);
    } else {
      Alert.alert(
        'إلغاء الطلب',
        'هل أنت متأكد من إلغاء هذا الطلب؟',
        [
          { text: 'لا', style: 'cancel' },
          { 
            text: 'نعم، إلغاء', 
            style: 'destructive',
            onPress: () => {
              // سيتم التعامل مع الإلغاء في الصفحة الأم
              console.log('Cancel order:', order.id);
            }
          }
        ]
      );
    }
  };

  const handleAccept = (e: any) => {
    e.stopPropagation();
    if (onAccept) {
      onAccept(order);
    }
  };

  const handleNegotiate = (e: any) => {
    e.stopPropagation();
    if (onNegotiate) {
      onNegotiate(order);
    } else {
      router.push({
        pathname: '/(tabs)/driver/trips',
        params: { orderId: order.id, showNegotiation: 'true' },
      });
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name={order.order_type === 'package' ? 'cube' : 'cart'}
            size={24}
            color="#007AFF"
          />
          <View style={styles.info}>
            <Text style={styles.orderType}>
              {order.order_type === 'package' ? 'توصيل طرد' : 'طلب شراء'}
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
        <OrderCountdownBar deadline={order.deadline} />
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(order.status) + '20' },
          ]}
        >
          <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
            {getStatusText(order.status)}
          </Text>
        </View>
      </View>

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
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.fee}>
          الأجرة: {order.negotiated_price || order.total_fee} ج.م
        </Text>
      </View>

      {/* أزرار الإجراءات */}
      {showActions && isActive && (
        <View style={styles.actionsContainer}>
          {/* للعميل: زر إلغاء */}
          {isCustomer && canCancel && (
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
                  style={[styles.actionButton, styles.negotiateButton]}
                  onPress={handleNegotiate}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color="#FF9500" />
                  <Text style={[styles.actionButtonText, styles.negotiateButtonText]}>
                    تفاوض
                  </Text>
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  date: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  address: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  multiPointContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  multiPointTitle: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#007AFF',
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
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
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
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  fee: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#34C759',
    textAlign: 'right',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 100,
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#34C75920',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  negotiateButton: {
    backgroundColor: '#FF950020',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  cancelButton: {
    backgroundColor: '#FF3B3020',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  actionButtonText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
  },
  acceptButtonText: {
    color: '#34C759',
  },
  negotiateButtonText: {
    color: '#FF9500',
  },
  cancelButtonText: {
    color: '#FF3B30',
  },
});

