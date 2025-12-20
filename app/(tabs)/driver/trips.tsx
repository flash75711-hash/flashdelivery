import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import responsive from '@/utils/responsive';
import { createNotification } from '@/lib/notifications';

interface Order {
  id: string;
  customer_id: string;
  driver_id?: string | null;
  status: string;
  order_type?: string;
  items?: any;
  package_description?: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  search_status?: string;
  customer?: {
    full_name?: string;
    phone?: string;
  };
}

export default function DriverTripsScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    if (user) {
      loadNewOrders();
      loadActiveOrder();
      
      const subscription = supabase
        .channel('driver_orders')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: 'status=eq.pending',
          },
          () => {
            loadNewOrders();
          }
        )
        .subscribe();

      // الاشتراك في تحديثات الرحلة النشطة
      const activeOrderSubscription = supabase
        .channel(`driver_active_order_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `driver_id=eq.${user.id}`,
          },
          () => {
            loadActiveOrder();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
        activeOrderSubscription.unsubscribe();
      };
    }
  }, [user]);

  const loadNewOrders = async () => {
    try {
      setLoading(true);
      // جلب الطلبات الموجهة لهذا السائق (driver_id = user.id) أو الطلبات العامة (driver_id = null)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(full_name, phone)
        `)
        .eq('status', 'pending')
        .or(`driver_id.eq.${user?.id},driver_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // تحويل البيانات لتنسيق مناسب
      const formattedOrders = (data || []).map((order: any) => ({
        ...order,
        customer: order.customer || null,
      }));
      
      setOrders(formattedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const acceptOrder = async (order: Order) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'accepted',
          driver_id: user?.id,
        })
        .eq('id', order.id);

      if (error) throw error;
      
      // إرسال إشعار للعميل
      if (order.customer_id) {
        await createNotification({
          user_id: order.customer_id,
          title: 'تم قبول طلبك',
          message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
          type: 'success'
        });
      }
      
      // إعادة تحميل الرحلة النشطة مع بيانات العميل
      await loadActiveOrder();
      startLocationTracking(order.id);
      Alert.alert('نجح', 'تم قبول الطلب');
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل قبول الطلب');
    } finally {
      setLoading(false);
    }
  };

  const startLocationTracking = async (orderId: string) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('خطأ', 'يجب السماح بالوصول إلى الموقع');
      return;
    }

    // بدء تتبع الموقع كل 5 ثوانٍ
    const locationInterval = setInterval(async () => {
      const location = await Location.getCurrentPositionAsync({});
      await supabase.from('driver_locations').upsert({
        driver_id: user?.id,
        order_id: orderId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        updated_at: new Date().toISOString(),
      });
    }, 5000);

    // تنظيف عند إكمال الطلب
    // يمكن إضافة cleanup logic هنا
  };

  const markPickedUp = async () => {
    if (!activeOrder) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'pickedUp' })
        .eq('id', activeOrder.id);

      if (error) throw error;
      
      // إرسال إشعار للعميل
      if (activeOrder.customer_id) {
        try {
          await supabase
            .from('notifications')
            .insert({
              user_id: activeOrder.customer_id,
              title: 'تم استلام طلبك',
              message: 'تم استلام طلبك من نقطة الاستلام.',
              type: 'info'
            });
        } catch (notifErr) {
          console.error('Error sending notification to customer:', notifErr);
        }
      }
      
      Alert.alert('نجح', 'تم تحديث حالة الطلب');
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    } finally {
      setLoading(false);
    }
  };

  const markDelivered = async () => {
    if (!activeOrder) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', activeOrder.id);

      if (error) throw error;

      // إضافة المبلغ إلى محفظة السائق
      const commission = activeOrder.total_fee * 0.1;
      await supabase.from('wallets').insert({
        driver_id: user?.id,
        order_id: activeOrder.id,
        amount: activeOrder.total_fee - commission,
        commission: commission,
        type: 'earning',
      });

      // إرسال إشعار للعميل
      if (activeOrder.customer_id) {
        await createNotification({
          user_id: activeOrder.customer_id,
          title: 'تم إكمال طلبك',
          message: `تم إكمال طلبك بنجاح. شكراً لاستخدامك Flash Delivery!`,
          type: 'success'
        });
      }

      setActiveOrder(null);
      Alert.alert('نجح', 'تم إكمال الطلب');
      loadNewOrders();
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveOrder = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(full_name, phone)
        `)
        .eq('driver_id', user.id)
        .in('status', ['accepted', 'pickedUp', 'inTransit'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading active order:', error);
        return;
      }

      if (data) {
        setActiveOrder({
          ...data,
          customer: data.customer || null,
        });
      }
    } catch (error) {
      console.error('Error loading active order:', error);
    }
  };

  if (activeOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>رحلة نشطة</Text>
          <TouchableOpacity
            onPress={() => setActiveOrder(null)}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.activeTripContainer}>
          <View style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <View style={styles.tripHeaderLeft}>
                <Ionicons 
                  name={activeOrder.order_type === 'package' ? 'cube' : 'cart'} 
                  size={24} 
                  color="#007AFF" 
                />
                <Text style={styles.tripTitle}>
                  {activeOrder.order_type === 'package' ? 'توصيل طلب' : 'طلب من خارج'}
                </Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {activeOrder.status === 'accepted' && 'تم القبول'}
                  {activeOrder.status === 'pickedUp' && 'تم الاستلام'}
                  {activeOrder.status === 'inTransit' && 'قيد التوصيل'}
                </Text>
              </View>
            </View>

            {/* معلومات العميل */}
            {activeOrder.customer && (
              <View style={styles.customerInfo}>
                <Ionicons name="person" size={18} color="#007AFF" />
                <View style={styles.customerDetails}>
                  <Text style={styles.customerName}>
                    {activeOrder.customer.full_name || 'عميل'}
                  </Text>
                  {activeOrder.customer.phone && (
                    <Text style={styles.customerPhone}>{activeOrder.customer.phone}</Text>
                  )}
                </View>
              </View>
            )}

            {/* وصف الطلب */}
            {activeOrder.package_description && (
              <View style={styles.descriptionContainer}>
                <Ionicons name="document-text" size={18} color="#666" />
                <Text style={styles.descriptionText}>
                  {activeOrder.package_description}
                </Text>
              </View>
            )}

            {/* عناوين الاستلام والتوصيل */}
            <View style={styles.addressContainer}>
              <View style={styles.addressRow}>
                <Ionicons name="location" size={18} color="#34C759" />
                <View style={styles.addressTextContainer}>
                  <Text style={styles.addressLabel}>من:</Text>
                  <Text style={styles.tripAddress}>{activeOrder.pickup_address}</Text>
                </View>
              </View>
              <View style={styles.addressRow}>
                <Ionicons name="location" size={18} color="#FF3B30" />
                <View style={styles.addressTextContainer}>
                  <Text style={styles.addressLabel}>إلى:</Text>
                  <Text style={styles.tripAddress}>{activeOrder.delivery_address}</Text>
                </View>
              </View>
            </View>

            <View style={styles.feeContainer}>
              <Ionicons name="cash" size={20} color="#007AFF" />
              <Text style={styles.tripFee}>
                الأجرة: {activeOrder.total_fee} ج.م
              </Text>
            </View>
          </View>

          <View style={styles.actionsContainer}>
            {/* زر "تم الاستلام" - يظهر فقط إذا كان الطلب في حالة accepted */}
            {activeOrder.status === 'accepted' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.pickupButton]}
                onPress={markPickedUp}
                disabled={loading}
              >
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {t('driver.pickupReceived')}
                </Text>
              </TouchableOpacity>
            )}

            {/* زر "تم التوصيل" - يظهر إذا كان الطلب في حالة pickedUp أو inTransit */}
            {(activeOrder.status === 'pickedUp' || activeOrder.status === 'inTransit' || activeOrder.status === 'accepted') && (
              <TouchableOpacity
                style={[styles.actionButton, styles.deliveryButton]}
                onPress={markDelivered}
                disabled={loading || activeOrder.status === 'accepted'}
              >
                <Ionicons name="checkmark-done" size={24} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {t('driver.deliveryCompleted')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.newTrips')}</Text>
      </View>

      <View style={styles.content}>
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color="#999" />
            <Text style={styles.emptyText}>لا توجد طلبات جديدة</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <Ionicons 
                    name={order.order_type === 'package' ? 'cube' : 'cart'} 
                    size={20} 
                    color="#007AFF" 
                  />
                  <Text style={styles.orderId}>
                    {order.order_type === 'package' ? 'توصيل طلب' : 'طلب من خارج'}
                  </Text>
                </View>
                <Text style={styles.orderFee}>{order.total_fee} ج.م</Text>
              </View>

              {/* معلومات العميل */}
              {order.customer && (
                <View style={styles.customerInfo}>
                  <Ionicons name="person" size={16} color="#666" />
                  <Text style={styles.customerText}>
                    {order.customer.full_name || 'عميل'}
                    {order.customer.phone && ` - ${order.customer.phone}`}
                  </Text>
                </View>
              )}

              {/* وصف الطلب */}
              {order.package_description && (
                <View style={styles.descriptionContainer}>
                  <Ionicons name="document-text" size={16} color="#666" />
                  <Text style={styles.descriptionText} numberOfLines={2}>
                    {order.package_description}
                  </Text>
                </View>
              )}

              {/* عناوين الاستلام والتوصيل */}
              <View style={styles.addressContainer}>
                <View style={styles.addressRow}>
                  <Ionicons name="location" size={16} color="#34C759" />
                  <View style={styles.addressTextContainer}>
                    <Text style={styles.addressLabel}>من:</Text>
                    <Text style={styles.orderAddress}>{order.pickup_address}</Text>
                  </View>
                </View>
                <View style={styles.addressRow}>
                  <Ionicons name="location" size={16} color="#FF3B30" />
                  <View style={styles.addressTextContainer}>
                    <Text style={styles.addressLabel}>إلى:</Text>
                    <Text style={styles.orderAddress}>{order.delivery_address}</Text>
                  </View>
                </View>
              </View>

              {/* وقت إنشاء الطلب */}
              <View style={styles.timeContainer}>
                <Ionicons name="time-outline" size={14} color="#999" />
                <Text style={styles.timeText}>
                  {new Date(order.created_at).toLocaleDateString('ar-EG', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>

              {/* حالة البحث */}
              {order.search_status && (
                <View style={styles.searchStatusContainer}>
                  <Ionicons name="search" size={14} color="#FF9500" />
                  <Text style={styles.searchStatusText}>
                    {order.search_status === 'searching' && 'جاري البحث عن سائق'}
                    {order.search_status === 'expanded' && 'تم توسيع نطاق البحث'}
                    {order.search_status === 'stopped' && 'توقف البحث'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => acceptOrder(order)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.acceptButtonText}>قبول الطلب</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
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
  content: {
    flex: 1,
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: responsive.isTablet() ? 24 : 20,
    marginBottom: responsive.isTablet() ? 20 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  orderFee: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  orderAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: responsive.getResponsiveFontSize(18),
    color: '#999',
    marginTop: 16,
  },
  activeTripContainer: {
    flex: 1,
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: responsive.isTablet() ? 32 : 24,
    marginBottom: responsive.isTablet() ? 32 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  tripTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'right',
  },
  tripAddress: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#333',
    marginBottom: 12,
    textAlign: 'right',
  },
  tripFee: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 8,
    textAlign: 'right',
  },
  actionsContainer: {
    gap: responsive.isTablet() ? 20 : 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: responsive.isTablet() ? 20 : 16,
    gap: 8,
  },
  pickupButton: {
    backgroundColor: '#FF9500',
  },
  deliveryButton: {
    backgroundColor: '#34C759',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
  },
  orderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
  },
  customerText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  descriptionContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  descriptionText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#333',
    flex: 1,
    textAlign: 'right',
    lineHeight: 20,
  },
  addressContainer: {
    marginTop: 16,
    gap: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  addressTextContainer: {
    flex: 1,
  },
  addressLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    marginBottom: 4,
    textAlign: 'right',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  timeText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
  },
  searchStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFF4E6',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  searchStatusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#FF9500',
    fontWeight: '500',
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tripHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#34C75920',
    borderRadius: 12,
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#34C759',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  customerPhone: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  feeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
});

