import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import responsive, { createShadowStyle, getM3CardStyle, getM3HorizontalPadding } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import { Ionicons } from '@expo/vector-icons';

interface Order {
  id: string;
  status: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  completed_at?: string;
  driver?: {
    full_name?: string;
    phone?: string;
  };
}

export default function CustomerHistoryScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    if (user) {
      loadOrders();
      
      // الاشتراك في Realtime لتحديث الطلبات تلقائياً
      const ordersChannel = supabase
        .channel(`customer_orders_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `customer_id=eq.${user.id}`,
          },
          () => {
            loadOrders();
          }
        )
        .subscribe();
      
      return () => {
        ordersChannel.unsubscribe();
      };
    }
  }, [user]);

  const loadOrders = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // استخدام Edge Function لتجاوز RLS (لأن المستخدم قد لا يكون لديه session نشط)
      const { data: historyResponse, error: historyError } = await supabase.functions.invoke('get-customer-history', {
        body: { customerId: user.id },
      });

      if (historyError) {
        console.error('Error calling get-customer-history function:', historyError);
        // Fallback: محاولة الاستعلام المباشر (قد لا يعمل بسبب RLS)
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_id', user.id)
          .in('status', ['completed', 'cancelled'])
          .order('created_at', { ascending: false });

        if (!ordersError && ordersData) {
          setOrders(ordersData);
        } else {
          console.error('Error loading orders (fallback):', ordersError);
        }
        return;
      }

      if (historyResponse?.success) {
        console.log('Customer history loaded from Edge Function:', {
          count: historyResponse.orders?.length || 0,
        });
        setOrders(historyResponse.orders || []);
      } else {
        console.error('Edge Function returned error:', historyResponse?.error);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      completed: 'مكتمل',
      cancelled: 'ملغي',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      completed: '#34C759',
      cancelled: '#FF3B30',
    };
    return colorMap[status] || '#666';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>السجل</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <View style={styles.statusContainer}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                    {getStatusText(item.status)}
                  </Text>
                </View>
                <Text style={styles.orderFee}>{item.total_fee.toFixed(2)} ج.م</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>

            <View style={styles.orderDetails}>
              <View style={styles.addressRow}>
                <Ionicons name="location" size={16} color="#007AFF" />
                <Text style={styles.addressText} numberOfLines={2}>
                  من: {item.pickup_address}
                </Text>
              </View>
              <View style={styles.addressRow}>
                <Ionicons name="location" size={16} color="#34C759" />
                <Text style={styles.addressText} numberOfLines={2}>
                  إلى: {item.delivery_address}
                </Text>
              </View>

              {item.driver && (
                <View style={styles.driverRow}>
                  <Ionicons name="person" size={16} color="#666" />
                  <Text style={styles.driverText}>
                    السائق: {item.driver.full_name || item.driver.phone || 'غير محدد'}
                  </Text>
                </View>
              )}

              <View style={styles.dateRow}>
                <Ionicons name="time-outline" size={14} color="#999" />
                <Text style={styles.dateText}>
                  {formatDate(item.completed_at || item.created_at)}
                </Text>
              </View>

              {/* عرض العناصر إذا كانت موجودة */}
              {item.order_items && Array.isArray(item.order_items) && item.order_items.length > 0 && (
                <View style={styles.itemsContainer}>
                  <View style={styles.itemsHeader}>
                    <Ionicons name="cube-outline" size={14} color="#007AFF" />
                    <Text style={styles.itemsTitle}>
                      العناصر ({item.order_items.length})
                    </Text>
                  </View>
                  {item.order_items.slice(0, 3).map((orderItem: any, index: number) => (
                    <View key={orderItem.id || index} style={styles.itemRow}>
                      <View style={styles.itemNumber}>
                        <Text style={styles.itemNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemAddress} numberOfLines={1}>
                          {orderItem.address}
                        </Text>
                        {orderItem.description && (
                          <Text style={styles.itemDescription} numberOfLines={1}>
                            {orderItem.description}
                          </Text>
                        )}
                        {orderItem.item_fee && (
                          <Text style={styles.itemFee}>
                            المبلغ: {parseFloat(orderItem.item_fee).toFixed(2)} ج.م
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                  {item.order_items.length > 3 && (
                    <Text style={styles.itemsMore}>
                      و {item.order_items.length - 3} عنصر آخر...
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد طلبات سابقة</Text>
            <Text style={styles.emptySubtext}>
              ستظهر هنا جميع طلباتك المكتملة والملغاة
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
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
    ...M3Theme.typography.headlineMedium,
    color: M3Theme.colors.onSurface,
    textAlign: 'right',
  },
  listContent: {
    padding: getM3HorizontalPadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  orderCard: {
    ...getM3CardStyle(),
    backgroundColor: M3Theme.colors.surface,
    marginBottom: 16,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
    }),
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    ...M3Theme.typography.labelLarge,
  },
  orderFee: {
    ...M3Theme.typography.titleMedium,
    color: M3Theme.colors.onSurface,
  },
  orderDetails: {
    gap: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  addressText: {
    flex: 1,
    ...M3Theme.typography.bodyMedium,
    color: M3Theme.colors.onSurfaceVariant,
    textAlign: 'right',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  driverText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  dateText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyText: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#999',
    textAlign: 'center',
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

