import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import responsive from '@/utils/responsive';

interface Order {
  id: string;
  status: string;
  created_at: string;
  total_fee: number;
  pickup_address: string;
  delivery_address: string;
}

export default function CustomerOrdersScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const router = useRouter();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    loadOrders();
    const subscription = supabase
      .channel('orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user?.id}`,
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const loadOrders = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

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

  const handleReorder = (order: Order) => {
    router.push({
      pathname: '/customer/outside-order',
      params: { orderId: order.id },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('customer.orderHistory')}</Text>
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
              <Text style={styles.orderStatus}>{getStatusText(item.status)}</Text>
              <Text style={styles.orderDate}>
                {new Date(item.created_at).toLocaleDateString('ar-SA')}
              </Text>
            </View>
            <Text style={styles.orderAddress}>{item.pickup_address}</Text>
            <Text style={styles.orderAddress}>→ {item.delivery_address}</Text>
            <Text style={styles.orderFee}>الأجرة: {item.total_fee} ج.م</Text>
            {item.status === 'completed' && (
              <View style={styles.orderActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleReorder(item)}
                >
                  <Text style={styles.actionButtonText}>{t('customer.reorder')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() => handleReorder(item)}
                >
                  <Text style={styles.actionButtonText}>
                    {t('customer.editAndReorder')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
  orderCard: {
    backgroundColor: '#fff',
    margin: responsive.getResponsivePadding(),
    padding: responsive.isTablet() ? 20 : 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  orderStatus: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#007AFF',
  },
  orderDate: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  orderAddress: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#333',
    marginBottom: 4,
    textAlign: 'right',
  },
  orderFee: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 8,
    textAlign: 'right',
  },
  orderActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#34C759',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
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

// This will be set in the component

