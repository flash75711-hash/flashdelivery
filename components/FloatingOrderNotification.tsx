import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import responsive from '@/utils/responsive';

interface OrderNotification {
  id: string;
  order_id: string;
  title: string;
  message: string;
  total_fee: number;
  order_type?: string;
  pickup_address?: string;
  delivery_address?: string;
}

interface FloatingOrderNotificationProps {
  visible: boolean;
  notification: OrderNotification | null;
  onAccept: () => void;
  onReject: () => void;
  onDismiss: () => void;
}

export default function FloatingOrderNotification({
  visible,
  notification,
  onAccept,
  onReject,
  onDismiss,
}: FloatingOrderNotificationProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [slideAnim] = useState(new Animated.Value(-500));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && notification) {
      // إظهار الإشعار بانتقال سلس
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      // إخفاء الإشعار
      Animated.timing(slideAnim, {
        toValue: -500,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, notification, slideAnim]);

  const handleAccept = async () => {
    if (!notification || !user) return;
    
    setLoading(true);
    try {
      // تحديث حالة الطلب إلى accepted
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'accepted',
          driver_id: user.id,
        })
        .eq('id', notification.order_id);

      if (updateError) throw updateError;

      // جلب بيانات الطلب لإرسال إشعار للعميل
      const { data: order } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('id', notification.order_id)
        .single();

      if (order?.customer_id) {
        // إرسال إشعار للعميل باستخدام دالة SECURITY DEFINER
        await supabase.rpc('insert_notification_for_customer', {
          p_user_id: order.customer_id,
          p_title: 'تم قبول طلبك',
          p_message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
          p_type: 'success',
          p_order_id: notification.order_id,
        }).catch(err => {
          console.error('Error sending notification to customer:', err);
          // محاولة بديلة: INSERT مباشر (يحتاج RLS policy)
          supabase
            .from('notifications')
            .insert({
              user_id: order.customer_id,
              title: 'تم قبول طلبك',
              message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
              type: 'success',
              order_id: notification.order_id,
            }).catch(() => {
              console.log('Both notification methods failed');
            });
        });
      }

      // تحديث الإشعار كمقروء
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id);

      onAccept();
      onDismiss();
      
      // الانتقال إلى صفحة الرحلات مع فتح التفاوض
      // استخدام setTimeout للتأكد من أن الإشعار يختفي قبل الانتقال
      setTimeout(() => {
        router.push({
          pathname: '/(tabs)/driver/trips',
          params: { orderId: notification.order_id, showNegotiation: 'true' },
        });
      }, 300);
    } catch (error: any) {
      console.error('Error accepting order:', error);
      alert('فشل قبول الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!notification) return;
    
    setLoading(true);
    try {
      // تحديث الإشعار كمقروء
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id);

      onReject();
      onDismiss();
    } catch (error: any) {
      console.error('Error rejecting order:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !notification) return null;

  const styles = getStyles();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons 
                name={notification.order_type === 'package' ? 'cube' : 'cart'} 
                size={24} 
                color="#007AFF" 
              />
              <Text style={styles.title}>{notification.title}</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <Text style={styles.message}>{notification.message}</Text>

          {/* معلومات الطلب */}
          <View style={styles.orderInfo}>
            <View style={styles.priceContainer}>
              <Ionicons name="cash" size={20} color="#34C759" />
              <Text style={styles.price}>{notification.total_fee} ج.م</Text>
            </View>
            
            {notification.pickup_address && (
              <View style={styles.addressRow}>
                <Ionicons name="location" size={16} color="#34C759" />
                <Text style={styles.address} numberOfLines={1}>
                  من: {notification.pickup_address}
                </Text>
              </View>
            )}
            
            {notification.delivery_address && (
              <View style={styles.addressRow}>
                <Ionicons name="location" size={16} color="#FF3B30" />
                <Text style={styles.address} numberOfLines={1}>
                  إلى: {notification.delivery_address}
                </Text>
              </View>
            )}
          </View>

          {/* أزرار القبول والرفض */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={handleReject}
              disabled={loading}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
              <Text style={styles.buttonText}>رفض</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
              disabled={loading}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.buttonText}>
                {loading ? 'جاري...' : 'قبول'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const getStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    ...(responsive.isLargeScreen() && {
      alignItems: 'center',
    }),
  },
  container: {
    backgroundColor: '#fff',
    marginHorizontal: responsive.isLargeScreen() ? 'auto' : 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: responsive.isLargeScreen() ? responsive.getMaxContentWidth() - 32 : '100%',
    width: responsive.isLargeScreen() ? responsive.getMaxContentWidth() - 32 : 'auto',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  message: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 16,
    textAlign: 'right',
    lineHeight: 20,
  },
  orderInfo: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  price: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#34C759',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  address: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});
