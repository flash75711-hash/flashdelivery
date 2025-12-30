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
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';

interface WalletTransaction {
  id: string;
  amount: number;
  commission: number;
  type: string;
  created_at: string;
  order_id: string;
}

export default function DriverWalletScreen() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    loadWalletData();
  }, [user]);

  const loadWalletData = async () => {
    if (!user) return;

    try {
      // حساب الرصيد الإجمالي
      const { data: earnings, error: earningsError } = await supabase
        .from('wallets')
        .select('amount, commission')
        .eq('driver_id', user.id)
        .eq('type', 'earning');

      if (earningsError) throw earningsError;

      const totalBalance = (earnings || []).reduce(
        (sum, item) => sum + (item.amount || 0),
        0
      );
      setBalance(totalBalance);

      // جلب سجل المعاملات
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('wallets')
        .select('*')
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (transactionsError) throw transactionsError;
      setTransactions(transactionsData || []);
    } catch (error) {
      console.error('Error loading wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.wallet')}</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('driver.balance')}</Text>
        <Text style={styles.balanceAmount}>{balance.toFixed(2)} ج.م</Text>
        <Text style={styles.commissionText}>
          {t('driver.commission')}: 10%
        </Text>
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>{t('driver.deductions')}</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadWalletData} />
        }
        renderItem={({ item }) => (
          <View style={styles.transactionCard}>
            <View style={styles.transactionHeader}>
              <Ionicons
                name={item.type === 'earning' ? 'arrow-down' : 'arrow-up'}
                size={24}
                color={item.type === 'earning' ? '#34C759' : '#FF3B30'}
              />
              <Text style={styles.transactionAmount}>
                {item.type === 'earning' ? '+' : '-'}
                {item.amount} ج.م
              </Text>
            </View>
            {item.commission > 0 && (
              <Text style={styles.commissionInfo}>
                عمولة: {item.commission} ج.م
              </Text>
            )}
            <Text style={styles.transactionDate}>
              {new Date(item.created_at).toLocaleString('ar-SA')}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد معاملات</Text>
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
  balanceCard: {
    backgroundColor: '#007AFF',
    margin: responsive.getResponsivePadding(),
    padding: responsive.isTablet() ? 32 : 24,
    borderRadius: 16,
    alignItems: 'center',
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  balanceLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#fff',
    opacity: 0.9,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: responsive.getResponsiveFontSize(48),
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  commissionText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#fff',
    opacity: 0.8,
  },
  transactionsHeader: {
    paddingHorizontal: responsive.getResponsivePadding(),
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  transactionCard: {
    backgroundColor: '#fff',
    marginHorizontal: responsive.getResponsivePadding(),
    marginBottom: 12,
    padding: responsive.isTablet() ? 20 : 16,
    borderRadius: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  commissionInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});

