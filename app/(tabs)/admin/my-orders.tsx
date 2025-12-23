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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMyOrders } from '@/hooks/useMyOrders';
import OrderCard from '@/components/OrderCard';
import OrderTypeCards from '@/components/OrderTypeCards';
import CompletedOrdersCard from '@/components/CompletedOrdersCard';
import responsive from '@/utils/responsive';
import type { Order } from '@/hooks/useMyOrders';

export default function AdminMyOrdersScreen() {
  const { orders, loading, refreshing, onRefresh } = useMyOrders();

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
        renderItem={({ item }) => <OrderCard order={item} />}
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
