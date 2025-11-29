import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface DashboardStats {
  totalRevenue: number;
  totalTrips: number;
  totalCommissions: number;
  activeDrivers: number;
}

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalTrips: 0,
    totalCommissions: 0,
    activeDrivers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // إجمالي الإيرادات
      const { data: revenueData } = await supabase
        .from('orders')
        .select('total_fee')
        .eq('status', 'completed');

      const totalRevenue =
        revenueData?.reduce((sum, order) => sum + (order.total_fee || 0), 0) ||
        0;

      // إجمالي الرحلات
      const { data: tripsData } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'completed');

      const totalTrips = tripsData?.length || 0;

      // إجمالي العمولات (10%)
      const totalCommissions = totalRevenue * 0.1;

      // السائقين النشطين
      const { data: driversData } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'driver')
        .eq('status', 'active');

      const activeDrivers = driversData?.length || 0;

      setStats({
        totalRevenue,
        totalTrips,
        totalCommissions,
        activeDrivers,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({
    icon,
    iconColor,
    title,
    value,
  }: {
    icon: string;
    iconColor: string;
    title: string;
    value: string | number;
  }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon as any} size={32} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.dashboard')}</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadStats} />
        }
      >
        <View style={styles.statsGrid}>
          <StatCard
            icon="cash"
            iconColor="#34C759"
            title={t('admin.totalRevenue')}
            value={`${stats.totalRevenue.toFixed(2)} ر.س`}
          />
          <StatCard
            icon="car"
            iconColor="#007AFF"
            title={t('admin.totalTrips')}
            value={stats.totalTrips}
          />
          <StatCard
            icon="trending-up"
            iconColor="#FF9500"
            title={t('admin.totalCommissions')}
            value={`${stats.totalCommissions.toFixed(2)} ر.س`}
          />
          <StatCard
            icon="people"
            iconColor="#AF52DE"
            title={t('admin.activeDrivers')}
            value={stats.activeDrivers}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

