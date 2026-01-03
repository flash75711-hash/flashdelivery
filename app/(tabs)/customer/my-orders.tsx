import React, { useMemo, useCallback, useRef } from 'react';
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
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useMyOrders } from '@/hooks/useMyOrders';
import OrderCard from '@/components/OrderCard';
import OrderTypeCards from '@/components/OrderTypeCards';
import CompletedOrdersCard from '@/components/CompletedOrdersCard';
import responsive from '@/utils/responsive';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { showAlert, showSimpleAlert, showConfirm } from '@/lib/alert';
import type { Order } from '@/hooks/useMyOrders';

export default function CustomerMyOrdersScreen() {
  const { t } = useTranslation();
  const { orders, loading, refreshing, onRefresh, reload } = useMyOrders();
  const cancelingOrderIdRef = useRef<string | null>(null);

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

  // دالة إعادة البحث عن سائق
  const handleRestartSearch = useCallback(async (order: Order) => {
    const confirmed = await showConfirm(
      'إعادة البحث عن سائق',
      'هل تريد إعادة البحث عن سائق لهذا الطلب؟',
      {
        confirmText: 'نعم، إعادة البحث',
        cancelText: 'إلغاء',
        type: 'question',
      }
    );

    if (!confirmed) return;

    try {
      // تحديث حالة البحث لإعادة التشغيل
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          search_status: 'searching',
          search_started_at: new Date().toISOString(),
          search_expanded_at: null,
          driver_id: null, // إزالة أي سائق معين سابقاً
        })
        .eq('id', order.id);

      if (updateError) {
        showSimpleAlert('خطأ', 'فشل تحديث حالة البحث', 'error');
        return;
      }

      await showSimpleAlert('نجح', 'تم بدء البحث عن سائق جديد. سيتم البحث تلقائياً.', 'success');
      reload();
    } catch (error: any) {
      console.error('Error restarting search:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إعادة البحث', 'error');
    }
  }, [reload]);

  // دالة إلغاء الطلب
  const handleCancelOrder = useCallback(async (order: Order) => {
    // منع الاستدعاءات المتكررة لنفس الطلب
    if (cancelingOrderIdRef.current === order.id) {
      return;
    }

    cancelingOrderIdRef.current = order.id;

    try {
      const confirmed = await showConfirm(
        'إلغاء الطلب',
        'هل أنت متأكد من إلغاء هذا الطلب؟',
        {
          confirmText: 'نعم، إلغاء',
          cancelText: 'لا',
          type: 'warning',
        }
      );

      if (!confirmed) {
        cancelingOrderIdRef.current = null;
        return;
      }

      // استخدام Edge Function لتحديث الطلب (لتجاوز RLS)
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-order', {
        body: {
          orderId: order.id,
          status: 'cancelled',
          cancelledBy: order.customer_id,
          cancelledAt: new Date().toISOString(),
        },
      });

      if (edgeFunctionError) {
        throw edgeFunctionError;
      }

      if (!edgeFunctionData || !edgeFunctionData.success) {
        throw new Error(edgeFunctionData?.error || 'فشل إلغاء الطلب');
      }

      // إشعار السائق إذا كان الطلب مقبولاً
      if (order.driver_id) {
        await createNotification({
          user_id: order.driver_id,
          title: 'تم إلغاء الطلب',
          message: `تم إلغاء الطلب رقم ${order.id.slice(0, 8)}`,
          type: 'warning',
          order_id: order.id,
        });
      }

      showSimpleAlert('نجح', 'تم إلغاء الطلب بنجاح', 'success');
      reload();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      showSimpleAlert('خطأ', error.message || 'فشل إلغاء الطلب', 'error');
    } finally {
      cancelingOrderIdRef.current = null;
    }
  }, [reload]);

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
            onCancel={handleCancelOrder}
            onRestartSearch={handleRestartSearch}
            onOrderUpdated={onRefresh}
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