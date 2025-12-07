import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

interface Order {
  id: string;
  customer_id: string;
  status: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
}

export default function DriverTripsScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    loadNewOrders();
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

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadNewOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
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
      setActiveOrder(order);
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
        .update({ status: 'completed' })
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

      setActiveOrder(null);
      Alert.alert('نجح', 'تم إكمال الطلب');
      loadNewOrders();
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (activeOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>رحلة نشطة</Text>
        </View>
        <View style={styles.activeTripContainer}>
          <View style={styles.tripCard}>
            <Text style={styles.tripTitle}>تفاصيل الرحلة</Text>
            <Text style={styles.tripAddress}>
              من: {activeOrder.pickup_address}
            </Text>
            <Text style={styles.tripAddress}>
              إلى: {activeOrder.delivery_address}
            </Text>
            <Text style={styles.tripFee}>
              الأجرة: {activeOrder.total_fee} ج.م
            </Text>
          </View>

          <View style={styles.actionsContainer}>
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

            <TouchableOpacity
              style={[styles.actionButton, styles.deliveryButton]}
              onPress={markDelivered}
              disabled={loading}
            >
              <Ionicons name="checkmark-done" size={24} color="#fff" />
              <Text style={styles.actionButtonText}>
                {t('driver.deliveryCompleted')}
              </Text>
            </TouchableOpacity>
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
                <Text style={styles.orderId}>طلب #{order.id.slice(0, 8)}</Text>
                <Text style={styles.orderFee}>{order.total_fee} ج.م</Text>
              </View>
              <Text style={styles.orderAddress}>
                من: {order.pickup_address}
              </Text>
              <Text style={styles.orderAddress}>
                إلى: {order.delivery_address}
              </Text>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => acceptOrder(order)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.acceptButtonText}>قبول الطلب</Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  activeTripContainer: {
    flex: 1,
    padding: 20,
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tripTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'right',
  },
  tripAddress: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
    textAlign: 'right',
  },
  tripFee: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 8,
    textAlign: 'right',
  },
  actionsContainer: {
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
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
    fontSize: 18,
    fontWeight: '600',
  },
});

