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
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  
  // حالة التفاوض
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiatingOrder, setNegotiatingOrder] = useState<Order | null>(null);
  const [proposedPrice, setProposedPrice] = useState('');
  
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
            <Text style={styles.orderFee}>
              الأجرة: {item.negotiated_price || item.total_fee} ج.م
            </Text>
            
            {/* إشعار التفاوض */}
            {item.negotiation_status === 'driver_proposed' && item.driver_proposed_price && (
              <View style={styles.negotiationAlert}>
                <Ionicons name="cash" size={20} color="#FF9500" />
                <View style={styles.negotiationAlertContent}>
                  <Text style={styles.negotiationAlertTitle}>
                    اقتراح سعر من السائق
                  </Text>
                  <Text style={styles.negotiationAlertText}>
                    السائق يقترح: {item.driver_proposed_price} ج.م
                  </Text>
                  <View style={styles.negotiationAlertActions}>
                    <TouchableOpacity
                      style={[styles.negotiationAlertButton, styles.rejectButton]}
                      onPress={() => {
                        // رفض الاقتراح
                        supabase
                          .from('orders')
                          .update({
                            negotiation_status: 'rejected',
                            driver_proposed_price: null,
                          })
                          .eq('id', item.id)
                          .then(() => loadOrders());
                      }}
                    >
                      <Text style={styles.negotiationAlertButtonText}>رفض</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.negotiationAlertButton, styles.acceptButton]}
                      onPress={() => {
                        setNegotiatingOrder(item);
                        setShowNegotiation(true);
                      }}
                    >
                      <Text style={styles.negotiationAlertButtonText}>قبول</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            
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

      {/* Modal للتفاوض */}
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

            {negotiatingOrder && (
              <ScrollView>
                <View style={styles.negotiationOrderInfo}>
                  <View style={styles.negotiationPriceRow}>
                    <Text style={styles.negotiationPriceLabel}>السعر الأصلي:</Text>
                    <Text style={styles.negotiationOriginalPrice}>
                      {negotiatingOrder.total_fee} ج.م
                    </Text>
                  </View>
                  
                  {negotiatingOrder.driver_proposed_price && (
                    <View style={styles.negotiationPriceRow}>
                      <Text style={styles.negotiationPriceLabel}>السعر المقترح من السائق:</Text>
                      <Text style={styles.negotiationDriverPrice}>
                        {negotiatingOrder.driver_proposed_price} ج.م
                      </Text>
                    </View>
                  )}

                  {negotiatingOrder.customer_proposed_price && (
                    <View style={styles.negotiationPriceRow}>
                      <Text style={styles.negotiationPriceLabel}>السعر المقترح منك:</Text>
                      <Text style={styles.negotiationCustomerPrice}>
                        {negotiatingOrder.customer_proposed_price} ج.م
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

                {/* قبول اقتراح السائق */}
                {negotiatingOrder.driver_proposed_price && 
                 negotiatingOrder.negotiation_status === 'driver_proposed' && (
                  <TouchableOpacity
                    style={[styles.negotiationButton, styles.acceptDriverProposalButton]}
                    onPress={acceptDriverProposal}
                    disabled={loading}
                  >
                    <Text style={styles.negotiationButtonText}>
                      قبول اقتراح السائق ({negotiatingOrder.driver_proposed_price} ج.م)
                    </Text>
                  </TouchableOpacity>
                )}

                {/* اقتراح سعر جديد */}
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
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  negotiationAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  negotiationAlertContent: {
    flex: 1,
  },
  negotiationAlertTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#FF9500',
    marginBottom: 4,
    textAlign: 'right',
  },
  negotiationAlertText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 12,
    textAlign: 'right',
  },
  negotiationAlertActions: {
    flexDirection: 'row',
    gap: 8,
  },
  negotiationAlertButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  negotiationAlertButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
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
  negotiationDriverPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#34C759',
  },
  negotiationCustomerPrice: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#FF9500',
  },
  negotiationFinalPrice: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#34C759',
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
  acceptDriverProposalButton: {
    backgroundColor: '#34C759',
  },
  negotiationButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});

// This will be set in the component

