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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMyOrders } from '@/hooks/useMyOrders';
import OrderCard from '@/components/OrderCard';
import OrderTypeCards from '@/components/OrderTypeCards';
import CompletedOrdersCard from '@/components/CompletedOrdersCard';
import responsive, { getM3HorizontalPadding } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { showAlert, showSimpleAlert, showConfirm } from '@/lib/alert';
import type { Order } from '@/hooks/useMyOrders';

export default function CustomerMyOrdersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
      // جلب إعدادات البحث لحساب search_expires_at
      const { data: settings } = await supabase
        .from('order_search_settings')
        .select('setting_key, setting_value');
      
      const searchDuration = parseFloat(
        settings?.find(s => s.setting_key === 'search_duration_seconds')?.setting_value || 
        settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || 
        '60'
      );
      
      // حساب search_expires_at = search_started_at + searchDuration
      const searchStartedAt = new Date().toISOString();
      const expiresDate = new Date(searchStartedAt);
      expiresDate.setSeconds(expiresDate.getSeconds() + searchDuration);
      const searchExpiresAt = expiresDate.toISOString();
      
      // تحديث حالة البحث لإعادة التشغيل
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          search_status: 'searching',
          search_started_at: searchStartedAt,
          search_expires_at: searchExpiresAt, // تحديث search_expires_at للعداد الموحد
          search_expanded_at: null,
          driver_id: null, // إزالة أي سائق معين سابقاً
        })
        .eq('id', order.id);

      if (updateError) {
        showSimpleAlert('خطأ', 'فشل تحديث حالة البحث', 'error');
        return;
      }

      // تحديد نقطة البحث حسب نوع الطلب
      let searchPoint: { lat: number; lon: number } | null = null;
      let searchAddress = '';

      if (order.order_type === 'outside' && order.items && Array.isArray(order.items) && order.items.length > 0) {
        // طلب من بره: البحث من أبعد نقطة في items
        searchAddress = order.items[0]?.address || order.pickup_address || '';
      } else if (order.order_type === 'package') {
        // توصيل طرد: البحث من نقطة الانطلاق
        searchAddress = order.pickup_address || '';
      }

      // إذا لم نجد عنوان، نستخدم delivery_address كحل أخير
      if (!searchAddress && order.delivery_address) {
        searchAddress = order.delivery_address;
      }

      if (searchAddress) {
        // تحويل العنوان إلى إحداثيات باستخدام Nominatim API
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1&accept-language=ar`;
          const geocodeResponse = await fetch(nominatimUrl, {
            headers: {
              'User-Agent': 'FlashDelivery/1.0',
            },
          });

          if (geocodeResponse.ok) {
            const geocodeData = await geocodeResponse.json();
            if (geocodeData && geocodeData.length > 0) {
              searchPoint = {
                lat: parseFloat(geocodeData[0].lat),
                lon: parseFloat(geocodeData[0].lon),
              };
            }
          }
        } catch (geocodeErr) {
          console.error('Error geocoding address:', geocodeErr);
        }
      }

      // إذا تم تحديد نقطة البحث، ابدأ البحث التلقائي
      if (searchPoint) {
        try {
          const searchResponse = await supabase.functions.invoke('start-order-search', {
            body: {
              order_id: order.id,
              search_point: searchPoint,
            },
          });

          if (searchResponse.error) {
            console.error('Error starting order search:', searchResponse.error);
          } else if (searchResponse.data?.success) {
            console.log('✅ Started search for order:', order.id);
          }
        } catch (searchErr) {
          console.error('Exception starting order search:', searchErr);
        }
      } else {
        console.warn('⚠️ Could not determine search point, search may not start automatically');
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
            onPress={(order) => router.push(`/orders/${order.id}`)}
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
      backgroundColor: M3Theme.colors.background,
      paddingBottom: tabBarBottomPadding,
    },
    header: {
      backgroundColor: M3Theme.colors.surface,
      padding: responsive.getResponsiveHeaderPadding(),
      borderBottomWidth: 1,
      borderBottomColor: M3Theme.colors.outlineVariant,
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
      ...M3Theme.typography.titleMedium,
      color: M3Theme.colors.onSurface,
      flex: 1,
    },
    badge: {
      backgroundColor: M3Theme.colors.primary,
      borderRadius: M3Theme.shape.cornerMedium,
      paddingHorizontal: M3Theme.spacing.sm,
      paddingVertical: M3Theme.spacing.xs,
      minWidth: 24,
      alignItems: 'center',
    },
    badgeText: {
      ...M3Theme.typography.labelMedium,
      color: M3Theme.colors.onPrimary,
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
      ...M3Theme.typography.titleLarge,
      color: M3Theme.colors.onSurfaceVariant,
      marginTop: 16,
    },
    emptySubtext: {
      ...M3Theme.typography.bodyMedium,
      color: M3Theme.colors.onSurfaceVariant,
      marginTop: 8,
    },
  });