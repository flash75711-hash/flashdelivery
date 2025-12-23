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
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  const params = useLocalSearchParams();
  
  // حالة التفاوض
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiatingOrder, setNegotiatingOrder] = useState<Order | null>(null);
  const [proposedPrice, setProposedPrice] = useState('');
  const [negotiationHistory, setNegotiationHistory] = useState<any[]>([]);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);
  
  // فتح صفحة التفاوض عند القبول من الإشعار العائم
  useEffect(() => {
    if (params.orderId && params.showNegotiation === 'true') {
      loadOrderForNegotiation(params.orderId as string);
    }
  }, [params.orderId, params.showNegotiation]);

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

      // الاشتراك في تحديثات التفاوض
      const negotiationSubscription = supabase
        .channel(`driver_negotiation_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `driver_id=eq.${user.id}`,
          },
          (payload) => {
            if (negotiatingOrder && payload.new.id === negotiatingOrder.id) {
              // تحديث حالة التفاوض
              setNegotiatingOrder({
                ...negotiatingOrder,
                ...payload.new,
              });
              setNegotiationHistory(payload.new.negotiation_history || []);
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
        activeOrderSubscription.unsubscribe();
        negotiationSubscription.unsubscribe();
      };
    }
  }, [user, negotiatingOrder]);

  const loadNewOrders = async () => {
    try {
      setLoading(true);
      // جلب الطلبات الموجهة لهذا السائق (driver_id = user.id) أو الطلبات العامة (driver_id = null)
      // استخدام استعلامين منفصلين ثم دمج النتائج لتجنب مشاكل .or()
      const [assignedOrders, generalOrders] = await Promise.all([
        // الطلبات الموجهة لهذا السائق
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
      ]);

      if (assignedOrders.error) throw assignedOrders.error;
      if (generalOrders.error) throw generalOrders.error;

      // دمج النتائج وإزالة التكرارات
      const allOrders = [...(assignedOrders.data || []), ...(generalOrders.data || [])];
      const uniqueOrders = allOrders.filter((order, index, self) =>
        index === self.findIndex((o) => o.id === order.id)
      );
      
      // ترتيب حسب التاريخ
      uniqueOrders.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      // جلب بيانات العملاء بشكل منفصل
      const customerIds = uniqueOrders
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
      const formattedOrders = uniqueOrders.map((order: any) => {
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

  const loadOrderForNegotiation = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        Alert.alert('خطأ', 'الطلب غير موجود أو لا يمكن الوصول إليه');
        return;
      }

        // جلب بيانات العميل بشكل منفصل
        let customerData = null;
        if (data.customer_id) {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', data.customer_id)
            .limit(1);
          
          if (!profileError && profiles && profiles.length > 0) {
            const profile = profiles[0];
            customerData = {
              full_name: profile.full_name,
              phone: profile.phone,
            };
          }
        }
        
        setNegotiatingOrder({
          ...data,
          customer: customerData,
        });
        setProposedPrice(data.total_fee?.toString() || '');
        setNegotiationHistory(data.negotiation_history || []);
        setShowNegotiation(true);
    } catch (error) {
      console.error('Error loading order for negotiation:', error);
      Alert.alert('خطأ', 'فشل تحميل بيانات الطلب');
    }
  };

  const acceptOrder = async (order: Order) => {
    setLoading(true);
    try {
      // إذا كان الطلب يحتاج تفاوض، افتح صفحة التفاوض
      if (order.status === 'pending') {
        await loadOrderForNegotiation(order.id);
        setLoading(false);
        return;
      }

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

  const proposePrice = async () => {
    if (!negotiatingOrder || !proposedPrice) {
      Alert.alert('خطأ', 'الرجاء إدخال سعر مقترح');
      return;
    }

    const price = parseFloat(proposedPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('خطأ', 'الرجاء إدخال سعر صحيح');
      return;
    }

    setLoading(true);
    try {
      const newHistoryEntry = {
        type: 'driver_proposed',
        price: price,
        timestamp: new Date().toISOString(),
        driver_id: user?.id,
      };

      const updatedHistory = [...(negotiatingOrder.negotiation_history || []), newHistoryEntry];

      console.log('📤 إرسال اقتراح السعر:', { orderId: negotiatingOrder.id, price, customerId: negotiatingOrder.customer_id });

      const { error, data } = await supabase
        .from('orders')
        .update({
          driver_proposed_price: price,
          negotiation_status: 'driver_proposed',
          negotiation_history: updatedHistory,
        })
        .eq('id', negotiatingOrder.id)
        .select();

      if (error) {
        console.error('❌ خطأ في تحديث الطلب:', error);
        throw error;
      }

      console.log('✅ تم تحديث الطلب بنجاح:', data);

      // إرسال إشعار للعميل
      if (negotiatingOrder.customer_id) {
        console.log('📨 إنشاء إشعار للعميل:', negotiatingOrder.customer_id);
        const notificationResult = await createNotification({
          user_id: negotiatingOrder.customer_id,
          title: 'اقتراح سعر جديد',
          message: `اقترح السائق سعر جديد: ${price} ج.م`,
          type: 'info',
          order_id: negotiatingOrder.id,
        });
        
        // إذا فشل إنشاء الإشعار، سجل الخطأ لكن لا توقف العملية
        if (!notificationResult.success) {
          console.error('⚠️ فشل إنشاء الإشعار (لكن الاقتراح تم حفظه):', notificationResult.error);
          // الإشعار ليس ضرورياً لعملية الإرسال، لكن يجب تسجيل الخطأ
        } else {
          console.log('✅ تم إنشاء الإشعار بنجاح');
        }
      }

      setNegotiationHistory(updatedHistory);
      setProposedPrice(''); // مسح حقل السعر بعد الإرسال الناجح
      Alert.alert('نجح', 'تم إرسال اقتراح السعر للعميل');
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل إرسال الاقتراح');
    } finally {
      setLoading(false);
    }
  };

  const acceptNegotiatedPrice = async () => {
    if (!negotiatingOrder) return;

    setLoading(true);
    try {
      const finalPrice = negotiatingOrder.negotiated_price || 
                        negotiatingOrder.driver_proposed_price || 
                        negotiatingOrder.total_fee;

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'accepted',
          driver_id: user?.id,
          total_fee: finalPrice,
          negotiation_status: 'accepted',
        })
        .eq('id', negotiatingOrder.id);

      if (error) throw error;

      // إرسال إشعار للعميل
      if (negotiatingOrder.customer_id) {
        await createNotification({
          user_id: negotiatingOrder.customer_id,
          title: 'تم قبول طلبك',
          message: `تم قبول طلبك بسعر ${finalPrice} ج.م وسيتم البدء في التوصيل قريباً.`,
          type: 'success'
        });
      }

      setShowNegotiation(false);
      setNegotiatingOrder(null);
      await loadActiveOrder();
      startLocationTracking(negotiatingOrder.id);
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
        .select('*')
        .eq('driver_id', user.id)
        .in('status', ['accepted', 'pickedUp', 'inTransit'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading active order:', error);
        return;
      }

      // إذا كان هناك طلب واحد فقط، استخدمه
      if (data && data.length === 1) {
        const orderData = data[0];
        
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
      } else {
        // لا يوجد طلب نشط
        setActiveOrder(null);
      }
    } catch (error) {
      console.error('Error loading active order:', error);
    }
  };

  // إذا كان هناك طلب للتفاوض، اعرض modal التفاوض
  if (showNegotiation && negotiatingOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <Modal
          visible={showNegotiation}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowNegotiation(false)}
        >
          <View style={styles.negotiationModalOverlay}>
            <View style={styles.negotiationModalContent}>
              <View style={styles.negotiationHeader}>
                <Text style={styles.negotiationTitle}>التفاوض على السعر</Text>
                <TouchableOpacity
                  onPress={() => setShowNegotiation(false)}
                  style={styles.negotiationCloseButton}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView>
                <View style={styles.negotiationOrderInfo}>
                  <Text style={styles.negotiationOrderType}>
                    {negotiatingOrder.order_type === 'package' ? 'توصيل طلب' : 'طلب من خارج'}
                  </Text>
                  
                  {negotiatingOrder.customer && (
                    <View style={styles.customerInfo}>
                      <Ionicons name="person" size={16} color="#666" />
                      <Text style={styles.customerText}>
                        {negotiatingOrder.customer.full_name || 'عميل'}
                        {negotiatingOrder.customer.phone && ` - ${negotiatingOrder.customer.phone}`}
                      </Text>
                    </View>
                  )}

                  <View style={styles.negotiationPriceRow}>
                    <Text style={styles.negotiationPriceLabel}>السعر الأصلي:</Text>
                    <Text style={styles.negotiationOriginalPrice}>
                      {negotiatingOrder.total_fee} ج.م
                    </Text>
                  </View>
                  
                  {negotiatingOrder.customer_proposed_price && (
                    <View style={styles.negotiationPriceRow}>
                      <Text style={styles.negotiationPriceLabel}>السعر المقترح من العميل:</Text>
                      <Text style={styles.negotiationCustomerPrice}>
                        {negotiatingOrder.customer_proposed_price} ج.م
                      </Text>
                    </View>
                  )}

                  {negotiatingOrder.driver_proposed_price && (
                    <View style={styles.negotiationPriceRow}>
                      <Text style={styles.negotiationPriceLabel}>السعر المقترح منك:</Text>
                      <Text style={styles.negotiationDriverPrice}>
                        {negotiatingOrder.driver_proposed_price} ج.م
                      </Text>
                    </View>
                  )}

                  {negotiatingOrder.negotiated_price && (
                    <View style={styles.negotiationPriceRow}>
                      <Text style={styles.negotiationPriceLabel}>السعر المتفق عليه:</Text>
                      <Text style={styles.negotiationFinalPrice}>
                        {negotiatingOrder.negotiated_price} ج.م
                      </Text>
                    </View>
                  )}
                </View>

                {/* تاريخ التفاوض */}
                {negotiationHistory.length > 0 && (
                  <View style={styles.negotiationHistoryContainer}>
                    <Text style={styles.negotiationHistoryTitle}>تاريخ التفاوض:</Text>
                    <View style={styles.negotiationHistoryList}>
                      {negotiationHistory.map((entry: any, index: number) => (
                        <View key={index} style={styles.negotiationHistoryItem}>
                          <Text style={styles.negotiationHistoryText}>
                            {entry.type === 'driver_proposed' ? 'أنت اقترحت' : 'العميل اقترح'}: {entry.price} ج.م
                          </Text>
                          <Text style={styles.negotiationHistoryTime}>
                            {new Date(entry.timestamp).toLocaleString('ar-EG')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* إدخال السعر المقترح */}
                {negotiatingOrder.negotiation_status !== 'accepted' && (
                  <View style={styles.negotiationInputContainer}>
                    <Text style={styles.negotiationInputLabel}>اقترح سعر جديد:</Text>
                    <TextInput
                      style={styles.negotiationInput}
                      value={proposedPrice}
                      onChangeText={setProposedPrice}
                      keyboardType="numeric"
                      placeholder="أدخل السعر"
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity
                      style={[styles.negotiationButton, styles.proposeButton]}
                      onPress={proposePrice}
                      disabled={loading || !proposedPrice}
                    >
                      <Text style={styles.negotiationButtonText}>إرسال الاقتراح</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* زر قبول السعر النهائي */}
                {negotiatingOrder.negotiated_price && (
                  <TouchableOpacity
                    style={[styles.negotiationButton, styles.acceptNegotiatedButton]}
                    onPress={acceptNegotiatedPrice}
                    disabled={loading}
                  >
                    <Text style={styles.negotiationButtonText}>
                      قبول السعر ({negotiatingOrder.negotiated_price} ج.م)
                    </Text>
                  </TouchableOpacity>
                )}

                {/* زر قبول السعر الأصلي */}
                {!negotiatingOrder.negotiated_price && (
                  <TouchableOpacity
                    style={[styles.negotiationButton, styles.acceptOriginalButton]}
                    onPress={async () => {
                      setLoading(true);
                      try {
                        const { error } = await supabase
                          .from('orders')
                          .update({
                            status: 'accepted',
                            driver_id: user?.id,
                            negotiation_status: 'accepted',
                          })
                          .eq('id', negotiatingOrder.id);

                        if (error) throw error;

                        if (negotiatingOrder.customer_id) {
                          await createNotification({
                            user_id: negotiatingOrder.customer_id,
                            title: 'تم قبول طلبك',
                            message: 'تم قبول طلبك بالسعر الأصلي وسيتم البدء في التوصيل قريباً.',
                            type: 'success'
                          });
                        }

                        setShowNegotiation(false);
                        setNegotiatingOrder(null);
                        await loadActiveOrder();
                        startLocationTracking(negotiatingOrder.id);
                        Alert.alert('نجح', 'تم قبول الطلب');
                      } catch (error: any) {
                        Alert.alert('خطأ', error.message || 'فشل قبول الطلب');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.negotiationButtonText}>
                      قبول السعر الأصلي ({negotiatingOrder.total_fee} ج.م)
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

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
              {/* إذا كان الطلب يحتوي على عدة نقاط (items)، نعرضها جميعاً */}
              {(() => {
                // التحقق من وجود items وتنسيقه
                const routePoints = activeOrder.items;
                const hasMultiplePoints = routePoints && 
                  Array.isArray(routePoints) && 
                  routePoints.length > 0;
                
                if (hasMultiplePoints) {
                  console.log('📍 عرض مسار متعدد النقاط:', routePoints.length, 'نقطة');
                  return (
                    <>
                      {routePoints.map((point: any, index: number) => {
                        const pointAddress = point.address || point;
                        const pointDescription = point.description || '';
                        return (
                          <View key={index} style={styles.addressRow}>
                            <Ionicons 
                              name={index === 0 ? "play-circle" : index === routePoints.length - 1 ? "checkmark-circle" : "ellipse"} 
                              size={18} 
                              color={index === 0 ? "#34C759" : index === routePoints.length - 1 ? "#FF3B30" : "#007AFF"} 
                            />
                            <View style={styles.addressTextContainer}>
                              <Text style={styles.addressLabel}>
                                {index === 0 ? 'نقطة الانطلاق:' : index === routePoints.length - 1 ? 'نقطة الوصول:' : `نقطة ${index + 1}:`}
                              </Text>
                              <Text style={styles.tripAddress}>
                                {pointDescription ? `${pointDescription}: ` : ''}{typeof pointAddress === 'string' ? pointAddress : JSON.stringify(pointAddress)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  );
                }
                return null;
              })()}
              {/* إذا لم يكن هناك items أو كان فارغاً، نعرض العنوانين البسيطين */}
              {(!activeOrder.items || !Array.isArray(activeOrder.items) || activeOrder.items.length === 0) && (
                <>
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
                </>
              )}
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
                {/* إذا كان الطلب يحتوي على عدة نقاط، نعرض ملخص */}
                {(() => {
                  let routePoints = order.items;
                  
                  // إذا كان items نص JSON، نحاول تحويله
                  if (routePoints && typeof routePoints === 'string') {
                    try {
                      routePoints = JSON.parse(routePoints);
                    } catch (e) {
                      console.warn('⚠️ فشل تحويل items من JSON:', e);
                      routePoints = null;
                    }
                  }
                  
                  const hasMultiplePoints = routePoints && 
                    Array.isArray(routePoints) && 
                    routePoints.length > 0;
                  
                  if (hasMultiplePoints) {
                    const firstPoint = routePoints[0];
                    const lastPoint = routePoints[routePoints.length - 1];
                    const firstPointObj = typeof firstPoint === 'object' ? firstPoint : { address: firstPoint };
                    const lastPointObj = typeof lastPoint === 'object' ? lastPoint : { address: lastPoint };
                    const firstAddress = firstPointObj.address || firstPoint || 'عنوان غير محدد';
                    const lastAddress = lastPointObj.address || lastPoint || 'عنوان غير محدد';
                    
                    return (
                      <View style={styles.addressRow}>
                        <Ionicons name="map" size={16} color="#007AFF" />
                        <View style={styles.addressTextContainer}>
                          <Text style={styles.addressLabel}>مسار متعدد النقاط ({routePoints.length} نقطة):</Text>
                          <Text style={styles.orderAddress} numberOfLines={1}>
                            {typeof firstAddress === 'string' ? firstAddress : JSON.stringify(firstAddress)} → ... → {typeof lastAddress === 'string' ? lastAddress : JSON.stringify(lastAddress)}
                          </Text>
                        </View>
                      </View>
                    );
                  }
                  return null;
                })()}
                {/* إذا لم يكن هناك items أو كان فارغاً، نعرض العنوانين البسيطين */}
                {(!order.items || !Array.isArray(order.items) || order.items.length === 0) && (
                  <>
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
                  </>
                )}
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
  negotiationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  negotiationModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: responsive.isLargeScreen() ? 600 : '100%',
    maxHeight: '80%',
  },
  negotiationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  negotiationTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  negotiationCloseButton: {
    padding: 4,
  },
  negotiationOrderInfo: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  negotiationOrderType: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'right',
  },
  negotiationPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  negotiationPriceLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  negotiationOriginalPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#007AFF',
  },
  negotiationCustomerPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#FF9500',
  },
  negotiationDriverPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#34C759',
  },
  negotiationFinalPrice: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#34C759',
  },
  negotiationHistoryContainer: {
    marginBottom: 20,
  },
  negotiationHistoryTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'right',
  },
  negotiationHistoryList: {
    maxHeight: 150,
  },
  negotiationHistoryItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  negotiationHistoryText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#333',
    textAlign: 'right',
  },
  negotiationHistoryTime: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    marginTop: 4,
    textAlign: 'right',
  },
  negotiationInputContainer: {
    marginBottom: 20,
  },
  negotiationInputLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'right',
  },
  negotiationInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: responsive.getResponsiveFontSize(16),
    textAlign: 'right',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  negotiationButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  proposeButton: {
    backgroundColor: '#007AFF',
  },
  acceptNegotiatedButton: {
    backgroundColor: '#34C759',
  },
  acceptOriginalButton: {
    backgroundColor: '#34C759',
  },
  negotiationButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});

