import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import responsive, { createShadowStyle } from '@/utils/responsive';

interface Order {
  id: string;
  customer_id: string;
  driver_id: string;
  vendor_id: string;
  status: string;
  total_fee: number;
  created_at: string;
  pickup_address: string;
  delivery_address: string;
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
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  orderCard: {
    backgroundColor: '#fff',
    margin: responsive.getResponsivePadding(),
    padding: responsive.getResponsivePadding(),
    borderRadius: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderId: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  statusBadge: {
    paddingHorizontal: responsive.isTablet() ? 16 : 12,
    paddingVertical: responsive.isTablet() ? 8 : 6,
    borderRadius: 12,
  },
  statusCompleted: {
    backgroundColor: '#34C75920',
  },
  statusCancelled: {
    backgroundColor: '#FF3B3020',
  },
  statusPending: {
    backgroundColor: '#FF950020',
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  orderAddress: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#333',
    marginBottom: 4,
    textAlign: 'right',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  orderFee: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#007AFF',
  },
  orderDate: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
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
});

export default function AdminOrdersScreen() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    loadOrders();
    const subscription = supabase
      .channel('admin_orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: t('orders.status.pending'),
      accepted: t('orders.status.accepted'),
      pickedUp: t('orders.status.pickedUp'),
      inTransit: t('orders.status.inTransit'),
      completed: t('orders.status.completed'),
      cancelled: t('orders.status.cancelled'),
    };
    return statusMap[status] || status;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.allOrders')}</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadOrders} />
        }
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderId}>طلب #{item.id.slice(0, 8)}</Text>
              <View
                style={[
                  styles.statusBadge,
                  item.status === 'completed'
                    ? styles.statusCompleted
                    : item.status === 'cancelled'
                    ? styles.statusCancelled
                    : styles.statusPending,
                ]}
              >
                <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
              </View>
            </View>
            <Text style={styles.orderAddress}>
              من: {item.pickup_address}
            </Text>
            <Text style={styles.orderAddress}>
              إلى: {item.delivery_address}
            </Text>
            <View style={styles.orderFooter}>
              <Text style={styles.orderFee}>{item.total_fee} ج.م</Text>
              <Text style={styles.orderDate}>
                {new Date(item.created_at).toLocaleDateString('ar-SA')}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد طلبات</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
