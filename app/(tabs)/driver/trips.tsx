import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentLocation, requestLocationPermission } from '@/lib/webUtils';
import responsive from '@/utils/responsive';
import { createNotification } from '@/lib/notifications';
import OrderCard from '@/components/OrderCard';
import { showSimpleAlert } from '@/lib/alert';

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
  negotiated_price?: number;
  negotiation_status?: string;
  driver_proposed_price?: number;
  customer_proposed_price?: number;
  negotiation_history?: any[];
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
  
  // Reference لتتبع interval الموقع
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      loadNewOrders();
      loadActiveOrder();
      
      // الاشتراك في تحديثات الطلبات المعلقة
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

      // الاشتراك في تحديثات الطلبات المقبولة في حالة التفاوض
      const negotiatingOrdersSubscription = supabase
        .channel(`driver_negotiating_orders_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `driver_id=eq.${user.id}`,
          },
          (payload) => {
            const updatedOrder = payload.new as any;
            // إذا كان الطلب مقبولاً وفي حالة التفاوض (negotiation_status != 'accepted' أو null)
            if (updatedOrder.status === 'accepted' && updatedOrder.negotiation_status !== 'accepted') {
              loadNewOrders();
            }
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
        negotiatingOrdersSubscription.unsubscribe();
        activeOrderSubscription.unsubscribe();
      };
    }
  }, [user]);

  const loadNewOrders = async () => {
    try {
      setLoading(true);
      // جلب الطلبات الموجهة لهذا السائق (driver_id = user.id) أو الطلبات العامة (driver_id = null)
      // استخدام استعلامين منفصلين ثم دمج النتائج لتجنب مشاكل .or()
      // أيضاً إظهار الطلبات المقبولة التي في حالة التفاوض (status = 'accepted' و driver_id = user.id و لا يوجد driver_proposed_price بعد)
      const [assignedOrders, generalOrders, negotiatingOrders] = await Promise.all([
        // الطلبات الموجهة لهذا السائق والمعلقة
        supabase
          .from('orders')
          .select('*')
          .eq('status', 'pending')
          .eq('driver_id', user?.id)
          .order('created_at', { ascending: false }),
        // الطلبات العامة (بدون سائق)
        supabase
          .from('orders')
          .select('*')
          .eq('status', 'pending')
          .is('driver_id', null)
          .order('created_at', { ascending: false }),
        // الطلبات المقبولة التي في حالة التفاوض (جميع حالات التفاوض)
        // - negotiation_status = null (قبل إرسال اقتراح)
        // - negotiation_status = 'driver_proposed' (بعد إرسال السائق لاقتراح)
        // - negotiation_status = 'customer_proposed' (بعد إرسال العميل لاقتراح)
        supabase
          .from('orders')
          .select('*')
          .eq('status', 'accepted')
          .eq('driver_id', user?.id)
          .or('negotiation_status.is.null,negotiation_status.eq.driver_proposed,negotiation_status.eq.customer_proposed') // تضمين جميع حالات التفاوض
          .order('created_at', { ascending: false }),
      ]);

      if (assignedOrders.error) throw assignedOrders.error;
      if (generalOrders.error) throw generalOrders.error;
      if (negotiatingOrders.error) throw negotiatingOrders.error;

      // دمج النتائج وإزالة التكرارات (بما في ذلك الطلبات في حالة التفاوض)
      const allOrders = [
        ...(assignedOrders.data || []), 
        ...(generalOrders.data || []),
        ...(negotiatingOrders.data || [])
      ];
      const uniqueOrders = allOrders.filter((order, index, self) =>
        index === self.findIndex((o) => o.id === order.id)
      );
      
      // تصفية الطلبات التي توقف البحث عنها (لا تظهر للسائقين)
      const activeSearchOrders = uniqueOrders.filter((order: any) => {
        // إخفاء الطلبات التي search_status = 'stopped'
        if (order.search_status === 'stopped') {
          console.log('🛑 طلب متوقف، تم إخفاؤه من قائمة السائقين:', order.id);
          return false;
        }
        return true;
      });
      
      // ترتيب حسب التاريخ
      activeSearchOrders.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      // جلب بيانات العملاء بشكل منفصل
      const customerIds = activeSearchOrders
        .map((order: any) => order.customer_id)
        .filter((id): id is string => id != null);
      
      const customerProfilesMap = new Map<string, { full_name?: string; phone?: string }>();
      
      if (customerIds.length > 0) {
        const uniqueCustomerIds = [...new Set(customerIds)];
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', uniqueCustomerIds);
        
        if (!profilesError && profiles) {
          profiles.forEach((profile: any) => {
            customerProfilesMap.set(profile.id, {
              full_name: profile.full_name,
              phone: profile.phone,
            });
          });
        }
      }
      
      // تحويل البيانات وتضمين بيانات العميل
      const formattedOrders = activeSearchOrders.map((order: any) => {
        // تسجيل البيانات للتأكد من وجود items
        if (order.items) {
          console.log('📍 طلب جديد يحتوي على items:', {
            orderId: order.id,
            itemsType: typeof order.items,
            isArray: Array.isArray(order.items),
            itemsLength: Array.isArray(order.items) ? order.items.length : 'N/A',
          });
        }
        return {
          ...order,
          customer: order.customer_id ? (customerProfilesMap.get(order.customer_id) || null) : null,
        };
      });
      
      setOrders(formattedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };


  // دالة قبول الطلب بالسعر الأصلي
  const handleAcceptOrder = async (order: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'accepted',
          driver_id: user?.id,
          negotiation_status: 'accepted',
          negotiated_price: order.total_fee,
        })
        .eq('id', order.id);

      if (error) throw error;
      
      // إرسال إشعار للعميل
      if (order.customer_id) {
        await createNotification({
          user_id: order.customer_id,
          title: 'تم قبول طلبك',
          message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
          type: 'success',
          order_id: order.id,
        });
      }
      
      // إعادة تحميل الرحلة النشطة مع بيانات العميل
      await loadActiveOrder();
      startLocationTracking(order.id);
      loadNewOrders(); // إعادة تحميل قائمة الطلبات
      showSimpleAlert('نجح', 'تم قبول الطلب بنجاح', 'success');
    } catch (error: any) {
      showSimpleAlert('خطأ', error.message || 'فشل قبول الطلب', 'error');
    } finally {
      setLoading(false);
    }
  };


  const startLocationTracking = async (orderId: string) => {
    // إيقاف أي تتبع سابق
    stopLocationTracking();
    
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      showSimpleAlert('خطأ', 'يجب السماح بالوصول إلى الموقع', 'error');
      return;
    }

    // بدء تتبع الموقع كل 5 ثوانٍ
    locationIntervalRef.current = setInterval(async () => {
      try {
        const location = await getCurrentLocation({
          enableHighAccuracy: true,
          timeout: 5000,
        });
        await supabase.from('driver_locations').upsert({
          driver_id: user?.id,
          order_id: orderId,
          latitude: location.latitude,
          longitude: location.longitude,
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error updating driver location:', error);
      }
    }, 5000);
  };

  const stopLocationTracking = () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
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
          await createNotification({
            user_id: activeOrder.customer_id,
            title: 'تم استلام طلبك',
            message: 'تم استلام طلبك من نقطة الاستلام.',
            type: 'info'
          });
        } catch (notifErr) {
          console.error('Error sending notification to customer:', notifErr);
        }
      }
      
      showSimpleAlert('نجح', 'تم تحديث حالة الطلب', 'success');
      loadActiveOrder(); // إعادة تحميل الطلب النشط
    } catch (error: any) {
      showSimpleAlert('خطأ', error.message || 'فشل تحديث حالة الطلب', 'error');
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

      stopLocationTracking(); // إيقاف تتبع الموقع
      setActiveOrder(null);
      showSimpleAlert('نجح', 'تم إكمال الطلب', 'success');
      loadNewOrders();
    } catch (error: any) {
      showSimpleAlert('خطأ', error.message || 'فشل إكمال الطلب', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadActiveOrder = async () => {
    if (!user) return;
    try {
      // جلب الطلبات النشطة (مستثنياً الطلبات في حالة التفاوض)
      // الطلبات في حالة التفاوض: status = 'accepted' و driver_id = user.id و !driver_proposed_price و !negotiation_status
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', user.id)
        .in('status', ['accepted', 'pickedUp', 'inTransit'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading active order:', error);
        return;
      }
      
      // تصفية الطلبات في حالة التفاوض (لا نعرضها كرحلة نشطة)
      // الرحلة النشطة تبدأ فقط عندما negotiation_status = 'accepted' (تم الاتفاق على السعر)
      const filteredData = data?.filter((order: any) => {
        // إذا كان الطلب في حالة accepted و negotiation_status != 'accepted'
        // فهذا يعني أنه في حالة التفاوض، يجب استبعاده من الرحلة النشطة
        if (order.status === 'accepted' && order.negotiation_status !== 'accepted') {
          return false; // استبعاد الطلبات في حالة التفاوض
        }
        return true;
      });

      // استخدام البيانات المفلترة (بدون الطلبات في حالة التفاوض)
      const activeOrderData = filteredData && filteredData.length > 0 ? filteredData[0] : null;

      // إذا كان هناك طلب نشط (وليس في حالة التفاوض)، استخدمه
      if (activeOrderData) {
        const orderData = activeOrderData;
        
        // جلب بيانات العميل بشكل منفصل
        let customerData = null;
        if (orderData.customer_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', orderData.customer_id)
            .single();
          
          if (profile) {
            customerData = {
              full_name: profile.full_name,
              phone: profile.phone,
            };
          }
        }
        
        setActiveOrder({
          ...orderData,
          customer: customerData,
        });
        
        // بدء تتبع الموقع
        startLocationTracking(orderData.id);
      } else {
        // لا يوجد طلب نشط (أو جميع الطلبات في حالة التفاوض)
        setActiveOrder(null);
        stopLocationTracking();
      }
    } catch (error) {
      console.error('Error loading active order:', error);
    }
  };

  // تنظيف interval عند unmount
  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, []);

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
        <ScrollView contentContainerStyle={styles.activeTripContainer}>
          <OrderCard
            order={{
              ...activeOrder,
              deadline: activeOrder.deadline, // إضافة deadline للعد التنازلي
            } as any}
            showActions={false} // لا نعرض أزرار الإجراءات في OrderCard لأن لدينا أزرار مخصصة هنا
          />

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
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.newTrips')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color="#999" />
            <Text style={styles.emptyText}>لا توجد طلبات جديدة</Text>
          </View>
        ) : (
          orders.map((order) => {
            // تحويل Order من trips.tsx إلى Order من useMyOrders
            const orderCardData: any = {
              id: order.id,
              status: order.status,
              order_type: order.order_type || 'package',
              pickup_address: order.pickup_address,
              delivery_address: order.delivery_address,
              total_fee: order.total_fee,
              created_at: order.created_at,
              items: order.items,
              negotiated_price: order.negotiated_price,
              negotiation_status: order.negotiation_status,
              driver_proposed_price: order.driver_proposed_price,
              customer_proposed_price: order.customer_proposed_price,
              customer_id: order.customer_id,
              driver_id: order.driver_id,
              search_status: order.search_status,
              deadline: order.deadline, // إضافة deadline للعد التنازلي
            };

            return (
              <OrderCard
                key={order.id}
                order={orderCardData}
                onAccept={handleAcceptOrder}
                onOrderUpdated={loadNewOrders}
              />
            );
          })
        )}
      </ScrollView>
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
    padding: responsive.getResponsivePadding(),
    paddingBottom: responsive.getResponsivePadding() + 20,
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
  backButton: {
    padding: 4,
  },
});

