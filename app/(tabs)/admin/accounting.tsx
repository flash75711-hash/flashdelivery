import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive from '@/utils/responsive';

interface DriverPayment {
  driver_id: string;
  driver_name: string;
  weekly_dues: number;
  is_debt_cleared: boolean;
}

export default function AdminAccountingScreen() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<DriverPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      // جلب جميع السائقين مع حساب المستحقات الأسبوعية
      const { data: drivers, error: driversError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'driver')
        .eq('status', 'active');

      if (driversError) throw driversError;

      const paymentsData: DriverPayment[] = [];

      for (const driver of drivers || []) {
        // حساب المستحقات الأسبوعية (آخر 7 أيام)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: earnings, error: earningsError } = await supabase
          .from('wallets')
          .select('amount, commission')
          .eq('driver_id', driver.id)
          .eq('type', 'earning')
          .gte('created_at', weekAgo.toISOString());

        if (earningsError) continue;

        const weeklyDues =
          earnings?.reduce(
            (sum, item) => sum + (item.amount || 0) + (item.commission || 0),
            0
          ) || 0;

        // التحقق من حالة الدفع
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_debt_cleared')
          .eq('id', driver.id)
          .single();

        paymentsData.push({
          driver_id: driver.id,
          driver_name: driver.full_name || driver.email,
          weekly_dues: weeklyDues,
          is_debt_cleared: profile?.is_debt_cleared || false,
        });
      }

      setPayments(paymentsData);
    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsCollected = async (driverId: string) => {
    Alert.alert(
      'تم التحصيل',
      'هل تم تحصيل المستحقات من السائق؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('profiles')
                .update({ is_debt_cleared: true })
                .eq('id', driverId);

              if (error) throw error;
              Alert.alert('نجح', 'تم تحديث حالة الدفع');
              loadPayments();
            } catch (error: any) {
              Alert.alert('خطأ', error.message || 'فشل تحديث الحالة');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.accounting')}</Text>
      </View>

      <FlatList
        data={payments}
        keyExtractor={(item) => item.driver_id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadPayments} />
        }
        renderItem={({ item }) => (
          <View style={styles.paymentCard}>
            <View style={styles.paymentHeader}>
              <Text style={styles.driverName}>{item.driver_name}</Text>
              <View
                style={[
                  styles.statusBadge,
                  item.is_debt_cleared
                    ? styles.statusPaid
                    : styles.statusUnpaid,
                ]}
              >
                <Text style={styles.statusText}>
                  {item.is_debt_cleared ? 'تم الدفع' : 'مستحق'}
                </Text>
              </View>
            </View>
            <Text style={styles.duesAmount}>
              {t('admin.weeklyDues')}: {item.weekly_dues.toFixed(2)} ج.م
            </Text>
            {!item.is_debt_cleared && item.weekly_dues > 0 && (
              <TouchableOpacity
                style={styles.collectButton}
                onPress={() => markAsCollected(item.driver_id)}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.collectButtonText}>
                  {t('admin.collected')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد مستحقات</Text>
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
  paymentCard: {
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
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverName: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: responsive.isTablet() ? 16 : 12,
    paddingVertical: responsive.isTablet() ? 8 : 6,
    borderRadius: 12,
  },
  statusPaid: {
    backgroundColor: '#34C75920',
  },
  statusUnpaid: {
    backgroundColor: '#FF950020',
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  duesAmount: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 12,
    textAlign: 'right',
  },
  collectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    padding: responsive.isTablet() ? 16 : 12,
    borderRadius: 8,
    gap: 8,
  },
  collectButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: responsive.getResponsiveFontSize(14),
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
});

