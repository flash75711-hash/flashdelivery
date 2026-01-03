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
import responsive, { createShadowStyle } from '@/utils/responsive';

interface OrderNotification {
  id: string;
  order_id: string;
  title: string;
  message: string;
  total_fee: number;
  order_type?: string;
  pickup_address?: string;
  delivery_address?: string;
  items?: any; // النقاط المتعددة في المسار
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

  // تعطيل useNativeDriver على الويب لأنه غير مدعوم
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (visible && notification) {
      // إظهار الإشعار بانتقال سلس
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      // إخفاء الإشعار
      Animated.timing(slideAnim, {
        toValue: -500,
        duration: 300,
        useNativeDriver,
      }).start();
    }
  }, [visible, notification, slideAnim, useNativeDriver]);

  const handleAccept = async () => {
    if (!notification || !user) return;
    
    setLoading(true);
    try {
      // تحديث الإشعار كمقروء فقط
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id);

      onAccept();
      onDismiss();
      
      // الانتقال إلى صفحة الرحلات مع فتح صفحة التفاوض
      // في صفحة التفاوض، يمكن للسائق قبول السعر الأصلي أو اقتراح سعر جديد
      // بعد الموافقة على السعر، سيتم تحديث حالة الطلب إلى accepted
      setTimeout(() => {
        router.push({
          pathname: '/(tabs)/driver/trips',
          params: { orderId: notification.order_id, showNegotiation: 'true' },
        });
      }, 300);
    } catch (error: any) {
      console.error('Error accepting order:', error);
      const { showToast } = await import('@/lib/alert');
      showToast('فشل قبول الطلب. يرجى المحاولة مرة أخرى.', 'error');
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
                name="map" 
                size={24} 
                color="#007AFF" 
              />
              <Text style={styles.title}>{notification.title}</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* عرض الرسالة فقط إذا كانت موجودة */}
          {notification.message && (
            <Text style={styles.message}>{notification.message}</Text>
          )}

          {/* معلومات الطلب */}
          <View style={styles.orderInfo}>
            <View style={styles.priceContainer}>
              <Ionicons name="cash" size={20} color="#34C759" />
              <Text style={styles.price}>{notification.total_fee} ج.م</Text>
            </View>
            
            {/* عرض النقاط - هذا هو الشيء الرئيسي */}
            {(() => {
              let routePoints = notification.items;
              
              // إذا كان items نص JSON، نحاول تحويله
              if (routePoints && typeof routePoints === 'string') {
                try {
                  routePoints = JSON.parse(routePoints);
                } catch (e) {
                  routePoints = null;
                }
              }
              
              const hasMultiplePoints = routePoints && 
                Array.isArray(routePoints) && 
                routePoints.length > 0;
              
              if (hasMultiplePoints) {
                return (
                  <>
                    <View style={styles.routeHeader}>
                      <Ionicons name="map" size={18} color="#007AFF" />
                      <Text style={styles.routeTitle}>
                        المسار ({routePoints.length} نقطة):
                      </Text>
                    </View>
                    {routePoints.map((point: any, index: number) => {
                      const pointObj = typeof point === 'object' ? point : { address: point, description: '' };
                      const pointAddress = pointObj.address || pointObj || point || 'عنوان غير محدد';
                      const pointDescription = pointObj.description || '';
                      
                      // تحديد نوع النقطة
                      const isFirst = index === 0;
                      const isLast = index === routePoints.length - 1;
                      const isOnly = routePoints.length === 1;
                      
                      return (
                        <View key={index} style={[styles.addressRow, styles.routePoint]}>
                          <Ionicons 
                            name={isFirst && !isOnly ? "play-circle" : isLast ? "checkmark-circle" : "ellipse"} 
                            size={16} 
                            color={isFirst && !isOnly ? "#34C759" : isLast ? "#FF3B30" : "#007AFF"} 
                          />
                          <View style={styles.pointContent}>
                            <Text style={styles.pointLabel}>
                              {isOnly ? 'النقطة' : isFirst ? 'نقطة الانطلاق' : isLast ? 'نقطة الوصول' : `نقطة ${index + 1}`}
                            </Text>
                            <Text style={styles.address} numberOfLines={2}>
                              {pointDescription ? `${pointDescription}: ` : ''}
                              {typeof pointAddress === 'string' ? pointAddress : JSON.stringify(pointAddress)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                );
              }
              
              // إذا لم يكن هناك items، نعرض العنوانين البسيطين
              return (
                <>
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
                </>
              );
            })()}
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
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    }),
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
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  routeTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  routePoint: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  pointContent: {
    flex: 1,
  },
  pointLabel: {
    fontSize: responsive.getResponsiveFontSize(13),
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  address: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    flex: 1,
    textAlign: 'right',
    lineHeight: 18,
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
