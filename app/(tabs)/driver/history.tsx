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
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import responsive from '@/utils/responsive';

interface Trip {
  id: string;
  status: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  completed_at?: string;
}

export default function DriverHistoryScreen() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    loadTrips();
  }, [user]);

  const loadTrips = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', user.id)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error loading trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      completed: t('orders.status.completed'),
      cancelled: t('orders.status.cancelled'),
    };
    return statusMap[status] || status;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.tripHistory')}</Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadTrips} />
        }
        renderItem={({ item }) => (
          <View style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <Text style={styles.tripStatus}>{getStatusText(item.status)}</Text>
              <Text style={styles.tripFee}>{item.total_fee} ج.م</Text>
            </View>
            <Text style={styles.tripAddress}>
              من: {item.pickup_address}
            </Text>
            <Text style={styles.tripAddress}>
              إلى: {item.delivery_address}
            </Text>
            <Text style={styles.tripDate}>
              {new Date(item.created_at).toLocaleDateString('ar-SA')}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد رحلات سابقة</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
