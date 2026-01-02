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
import responsive, { createShadowStyle } from '@/utils/responsive';

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
    if (user) {
      loadTrips();
      
      // الاشتراك في Realtime لتحديث الطلبات تلقائياً
      const tripsChannel = supabase
        .channel(`driver_trips_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `driver_id=eq.${user.id}`,
          },
          () => {
            loadTrips();
          }
        )
        .subscribe();
      
      return () => {
        tripsChannel.unsubscribe();
      };
    }
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
        <Text style={styles.title}>السجل</Text>
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
  tripCard: {
    backgroundColor: '#fff',
    margin: responsive.isTablet() ? 20 : 16,
    padding: responsive.isTablet() ? 20 : 16,
    borderRadius: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripStatus: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#34C759',
  },
  tripFee: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  tripAddress: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  tripDate: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
