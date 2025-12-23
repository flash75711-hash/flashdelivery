import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMyOrders } from '@/hooks/useMyOrders';
import OrderCard from '@/components/OrderCard';
import OrderTypeCards from '@/components/OrderTypeCards';
import CompletedOrdersCard from '@/components/CompletedOrdersCard';
import responsive from '@/utils/responsive';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createNotification } from '@/lib/notifications';
import type { Order } from '@/hooks/useMyOrders';

export default function DriverMyOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { orders, loading, refreshing, onRefresh, reload } = useMyOrders();

  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  // تقسيم الطلبات إلى نشطة ومكتملة
  const { activeOrders, completedOrders } = useMemo(() => {
    const active: Order[] = [];
    const completed: Order[] = [];

    orders.forEach((order) => {
      if (order.status === 'completed' || order.status === 'cancelled') {
        completed.push(order);
      } else {
        active.push(order);
      }
    });

    return {
      activeOrders: active,
      completedOrders: completed,
    };
  }, [orders]);

  // دالة قبول الطلب (بالسعر الحالي)
  const handleAcceptOrder = async (order: Order) => {
    Alert.alert(
      'قبول الطلب',
      `هل تريد قبول هذا الطلب بالسعر الحالي (${order.negotiated_price || order.total_fee} ج.م)؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'نعم، قبول',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('orders')
                .update({
                  status: 'accepted',
                  driver_id: user?.id,
                  negotiated_price: order.negotiated_price || order.total_fee,
                })
                .eq('id', order.id);

              if (error) throw error;

              // إشعار العميل
              if (order.customer_id) {
                await createNotification({
                  user_id: order.customer_id,
                  title: 'تم قبول طلبك',
                  message: `تم قبول طلبك وسيتم البدء في التوصيل قريباً.`,
                  type: 'success',
                  order_id: order.id,
                });
              }

              Alert.alert('نجح', 'تم قبول الطلب بنجاح');
              reload();
            } catch (error: any) {
              console.error('Error accepting order:', error);
              Alert.alert('خطأ', error.message || 'فشل قبول الطلب');
            }
          },
        },
      ]
    );
  };

  // دالة التفاوض
  const handleNegotiateOrder = (order: Order) => {
    router.push({
      pathname: '/(tabs)/driver/trips',
      params: { orderId: order.id, showNegotiation: 'true' },
    });
  };

  // دالة رفض/إلغاء الطلب
  const handleCancelOrder = async (order: Order) => {
    Alert.alert(
      'رفض الطلب',
      'هل أنت متأكد من رفض هذا الطلب؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'نعم، رفض',
          style: 'destructive',
          onPress: async () => {
            try {
              // إذا كان الطلب مقبولاً، نعيده إلى pending ونزيل driver_id
              if (order.status === 'accepted') {
                const { error } = await supabase
                  .from('orders')
                  .update({
                    status: 'pending',
                    driver_id: null,
                  })
                  .eq('id', order.id);

                if (error) throw error;

                // إشعار العميل
                if (order.customer_id) {
                  await createNotification({
                    user_id: order.customer_id,
                    title: 'تم رفض الطلب',
                    message: `تم رفض الطلب من قبل السائق. سيتم البحث عن سائق آخر.`,
                    type: 'warning',
                    order_id: order.id,
                  });
                }
              } else {
                // للطلبات pending، نزيل driver_id فقط
                const { error } = await supabase
                  .from('orders')
                  .update({ driver_id: null })
                  .eq('id', order.id);

                if (error) throw error;
              }

              Alert.alert('نجح', 'تم رفض الطلب');
              reload();
            } catch (error: any) {
              console.error('Error cancelling order:', error);
              Alert.alert('خطأ', error.message || 'فشل رفض الطلب');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>طلباتي</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>طلباتي</Text>
      </View>

      <FlatList
        data={activeOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onAccept={handleAcceptOrder}
            onNegotiate={handleNegotiateOrder}
            onCancel={handleCancelOrder}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <OrderTypeCards />
            {activeOrders.length > 0 && (
              <View style={styles.sectionHeader}>
                <Ionicons name="time" size={20} color="#007AFF" />
                <Text style={styles.sectionTitle}>الطلبات النشطة</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeOrders.length}</Text>
                </View>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          completedOrders.length > 0 ? (
            <CompletedOrdersCard orders={completedOrders} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد طلبات نشطة</Text>
            {completedOrders.length > 0 && (
              <Text style={styles.emptySubtext}>
                لديك {completedOrders.length} طلب مكتمل
              </Text>
            )}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </SafeAreaView>
  );
}

const getStyles = (tabBarBottomPadding: number = 0) =>
  StyleSheet.create({
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
    listContent: {
      padding: responsive.getResponsivePadding(),
      gap: 16,
      ...(responsive.isLargeScreen() && {
        maxWidth: responsive.getMaxContentWidth(),
        alignSelf: 'center',
        width: '100%',
      }),
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontSize: responsive.getResponsiveFontSize(18),
      fontWeight: 'bold',
      color: '#1a1a1a',
      flex: 1,
    },
    badge: {
      backgroundColor: '#007AFF',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: 24,
      alignItems: 'center',
    },
    badgeText: {
      fontSize: responsive.getResponsiveFontSize(12),
      fontWeight: 'bold',
      color: '#fff',
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
      paddingVertical: 64,
    },
    emptyText: {
      fontSize: responsive.getResponsiveFontSize(18),
      color: '#999',
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#666',
      marginTop: 8,
    },
  });
