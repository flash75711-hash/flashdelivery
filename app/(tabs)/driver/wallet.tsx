import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';

interface WalletTransaction {
  id: string;
  amount: number;
  commission: number;
  type: string;
  created_at: string;
  order_id?: string | null;
  description?: string | null;
  commission_paid?: boolean;
  settlement_date?: string | null;
}

export default function DriverWalletScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [totalDeductions, setTotalDeductions] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    if (user) {
      loadWalletData();
      
      // الاشتراك في Realtime لتحديث الرصيد تلقائياً
      const walletChannel = supabase
        .channel(`driver_wallet_realtime_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wallets',
            filter: `driver_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('DriverWallet: Realtime update:', payload);
            setTimeout(() => {
              loadWalletData();
            }, 500);
          }
        )
        .subscribe();
      
      return () => {
        walletChannel.unsubscribe();
      };
    }
  }, [user]);

  // تحديث الرصيد عند العودة للصفحة
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadWalletData();
      }
    }, [user])
  );

  const loadWalletData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // استخدام Edge Function لتجاوز RLS (لأن المستخدم قد لا يكون لديه session نشط)
      const { data: walletResponse, error: walletError } = await supabase.functions.invoke('get-driver-wallet', {
        body: { driverId: user.id },
      });

      if (walletError) {
        console.error('Error calling get-driver-wallet function:', walletError);
        // Fallback: محاولة الاستعلام المباشر (قد لا يعمل بسبب RLS)
        const { data: allTransactions, error: transactionsError } = await supabase
          .from('wallets')
          .select('*')
          .eq('driver_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (transactionsError) {
          console.error('Error loading wallet (fallback):', transactionsError);
          throw transactionsError;
        }

        // حساب الإحصائيات
        const earnings = (allTransactions || []).filter(t => t.type === 'earning');
        const deductions = (allTransactions || []).filter(t => t.type === 'deduction');
        
        const totalEarningsAmount = earnings.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        const totalCommissionAmount = earnings.reduce((sum, item) => sum + parseFloat(item.commission || 0), 0);
        const totalDeductionsAmount = deductions.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        
        // الرصيد = الأرباح - الخصومات
        const totalBalance = totalEarningsAmount - totalDeductionsAmount;

        setBalance(totalBalance);
        setTotalEarnings(totalEarningsAmount);
        setTotalCommission(totalCommissionAmount);
        setTotalDeductions(totalDeductionsAmount);
        setTransactions(allTransactions || []);
      } else if (walletResponse?.success) {
        // استخدام البيانات من Edge Function
        setBalance(walletResponse.balance || 0);
        setTotalEarnings(walletResponse.totalEarnings || 0);
        setTotalCommission(walletResponse.totalCommission || 0);
        setTotalDeductions(walletResponse.totalDeductions || 0);
        setTransactions(walletResponse.transactions || []);
      } else {
        console.error('Edge Function returned error:', walletResponse?.error);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadWalletData();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.wallet')}</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
        <Text style={styles.balanceAmount}>{balance.toFixed(2)} ج.م</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>إجمالي الأرباح</Text>
            <Text style={styles.statValue}>{totalEarnings.toFixed(2)} ج.م</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>إجمالي العمولة</Text>
            <Text style={[styles.statValue, styles.commissionValue]}>-{totalCommission.toFixed(2)} ج.م</Text>
          </View>
        </View>
        {totalDeductions > 0 && (
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>إجمالي الخصومات</Text>
            <Text style={[styles.statValue, styles.deductionValue]}>-{totalDeductions.toFixed(2)} ج.م</Text>
          </View>
        )}
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>سجل المعاملات</Text>
        <Text style={styles.transactionsCount}>{transactions.length} معاملة</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.transactionCard}
            onPress={() => {
              if (item.order_id) {
                router.push(`/driver/track-trip?orderId=${item.order_id}`);
              }
            }}
            activeOpacity={item.order_id ? 0.7 : 1}
          >
            <View style={styles.transactionHeader}>
              <View style={styles.transactionLeft}>
                <Ionicons
                  name={item.type === 'earning' ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={28}
                  color={item.type === 'earning' ? '#34C759' : '#FF3B30'}
                />
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionType}>
                    {item.type === 'earning' ? 'إضافة' : 'خصم'}
                  </Text>
                  {item.description && (
                    <Text style={styles.transactionDescription} numberOfLines={1}>
                      {item.description}
                    </Text>
                  )}
                  {item.order_id && (
                    <Text style={styles.orderIdText}>
                      طلب #{item.order_id.substring(0, 8)}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.transactionRight}>
                <Text style={[
                  styles.transactionAmount,
                  item.type === 'earning' ? styles.earningAmount : styles.deductionAmount
                ]}>
                  {item.type === 'earning' ? '+' : '-'}
                  {item.amount.toFixed(2)} ج.م
                </Text>
                {item.commission > 0 && (
                  <Text style={styles.commissionInfo}>
                    عمولة: {item.commission.toFixed(2)} ج.م
                  </Text>
                )}
                {item.commission_paid && item.settlement_date && (
                  <View style={styles.settlementBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#34C759" />
                    <Text style={styles.settlementText}>
                      تم التوريد {new Date(item.settlement_date).toLocaleDateString('ar-SA')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.transactionDate}>
              {new Date(item.created_at).toLocaleString('ar-SA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </TouchableOpacity>
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#fff',
    opacity: 0.8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: 'bold',
    color: '#fff',
  },
  commissionValue: {
    color: '#FFD700',
  },
  deductionValue: {
    color: '#FF6B6B',
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: responsive.getResponsivePadding(),
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  transactionsCount: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  transactionDescription: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 4,
  },
  orderIdText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#007AFF',
    fontWeight: '500',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    marginBottom: 4,
  },
  earningAmount: {
    color: '#34C759',
  },
  deductionAmount: {
    color: '#FF3B30',
  },
  commissionInfo: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#FF9500',
    marginBottom: 4,
    textAlign: 'right',
  },
  settlementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  settlementText: {
    fontSize: responsive.getResponsiveFontSize(10),
    color: '#34C759',
    fontWeight: '500',
  },
  transactionDate: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
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

