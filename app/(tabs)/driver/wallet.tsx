import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle, getM3CardStyle, getM3ButtonStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import { uploadImageToImgBB } from '@/lib/imgbb';
import { showSimpleAlert, showToast } from '@/lib/alert';

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
  
  const [unpaidCommission, setUnpaidCommission] = useState(0);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [isSettlementDay, setIsSettlementDay] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [settlementDayOfWeek, setSettlementDayOfWeek] = useState(0);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  useEffect(() => {
    if (user) {
      loadWalletData();
      checkSettlementDay();
      checkPendingRequest();
      loadPaymentInfo();
      
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
    checkSettlementDay();
    checkPendingRequest();
  };

  // حساب العمولة المستحقة للتوريد = إجمالي العمولة + إجمالي باقي العملاء
  const calculateUnpaidCommission = () => {
    // إجمالي العمولة من معاملات earning
    const totalCommission = transactions
      .filter(t => t.type === 'earning' && !t.commission_paid && t.commission > 0)
      .reduce((sum, t) => sum + t.commission, 0);
    
    // إجمالي باقي العملاء من معاملات deduction (amount - commission)
    const totalCustomerChange = transactions
      .filter(t => t.type === 'deduction' && !t.commission_paid && t.amount > 0)
      .reduce((sum, t) => {
        // باقي العميل = amount - commission
        const customerChange = t.amount - (t.commission || 0);
        return sum + customerChange;
      }, 0);
    
    setUnpaidCommission(totalCommission + totalCustomerChange);
  };

  // التحقق من يوم التوريد
  const checkSettlementDay = async () => {
    try {
      const { data: setting } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'settlement_day_of_week')
        .maybeSingle();

      const dayOfWeek = setting?.setting_value ? parseInt(setting.setting_value) : 0;
      setSettlementDayOfWeek(dayOfWeek);
      
      const today = new Date();
      const currentDayOfWeek = today.getDay();
      setIsSettlementDay(currentDayOfWeek === dayOfWeek);
    } catch (error) {
      console.error('Error checking settlement day:', error);
    }
  };

  // التحقق من وجود طلب توريد قيد المراجعة
  const checkPendingRequest = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('settlement_requests')
        .select('id, status')
        .eq('driver_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) {
        console.error('Error checking pending request:', error);
        return;
      }

      setHasPendingRequest(!!data);
    } catch (error) {
      console.error('Error checking pending request:', error);
    }
  };

  // جلب معلومات الدفع
  const loadPaymentInfo = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-settlement-payment-info');
      
      if (error) {
        console.error('Error loading payment info:', error);
        return;
      }

      if (data?.success && data.paymentInfo) {
        // تنظيف جميع الحقول من النقطة فقط أو القيم الفارغة
        const cleanedPaymentInfo: any = {};
        Object.keys(data.paymentInfo).forEach(key => {
          const value = data.paymentInfo[key];
          if (typeof value === 'string') {
            const trimmed = value.trim();
            cleanedPaymentInfo[key] = (trimmed === '.' || trimmed === '') ? '' : value;
          } else {
            cleanedPaymentInfo[key] = value;
          }
        });
        setPaymentInfo(cleanedPaymentInfo);
      }
    } catch (error) {
      console.error('Error loading payment info:', error);
    }
  };

  // رفع صورة الوصل
  const handleImagePicker = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;

          setUploadingImage(true);
          try {
            const imageUrl = await uploadImageToImgBB(file);
            setReceiptImage(imageUrl);
            showToast('تم رفع الصورة بنجاح', 'success');
          } catch (error: any) {
            console.error('Error uploading image:', error);
            showSimpleAlert('خطأ', 'فشل رفع الصورة. يرجى المحاولة مرة أخرى.', 'error');
          } finally {
            setUploadingImage(false);
          }
        };
        input.click();
      } else {
        showSimpleAlert('تنبيه', 'رفع الصور متاح على الويب حالياً', 'info');
      }
    } catch (error) {
      console.error('Error in image picker:', error);
    }
  };

  // إرسال طلب التوريد
  const handleSubmitSettlementRequest = async () => {
    // حماية من الضغط المتكرر
    if (submittingRequest) {
      return;
    }

    // حماية من وجود طلب قيد المراجعة
    if (hasPendingRequest) {
      showSimpleAlert('تنبيه', 'يوجد طلب توريد قيد المراجعة بالفعل. يرجى انتظار مراجعة الطلب السابق.', 'warning');
      return;
    }

    if (!receiptImage) {
      showSimpleAlert('تنبيه', 'يرجى رفع صورة الوصل أولاً', 'warning');
      return;
    }

    if (!user?.id) {
      showSimpleAlert('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
      return;
    }

    setSubmittingRequest(true);
    try {
      // استخدام fetch مباشرة لاستخراج رسالة الخطأ من الـ response body
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      const functionUrl = `${supabaseUrl}/functions/v1/create-settlement-request`;
      
      const requestBody = {
        driverId: user.id,
        receiptImageUrl: receiptImage,
      };
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseData: any = {};
      
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('[handleSubmitSettlementRequest] Error parsing response:', parseError);
        console.error('[handleSubmitSettlementRequest] Response text:', responseText);
      }
      
      if (!response.ok) {
        let errorMsg = 'فشل إرسال طلب التوريد';
        if (responseData?.error && typeof responseData.error === 'string' && responseData.error.trim() && responseData.error.trim() !== '.') {
          errorMsg = responseData.error;
        } else if (responseData?.message && typeof responseData.message === 'string' && responseData.message.trim() && responseData.message.trim() !== '.') {
          errorMsg = responseData.message;
        } else if (responseData?.details && typeof responseData.details === 'string' && responseData.details.trim() && responseData.details.trim() !== '.') {
          errorMsg = responseData.details;
        }
        
        // إذا كان الخطأ بسبب وجود طلب قيد المراجعة، نحدث الحالة
        if (errorMsg.includes('قيد المراجعة') || responseData?.existingRequestId) {
          checkPendingRequest();
        }
        
        throw new Error(errorMsg);
      }

      if (responseData?.success) {
        showToast('تم إرسال طلب التوريد بنجاح. سيتم مراجعته من قبل الإدارة.', 'success');
        setShowSettlementModal(false);
        setReceiptImage(null);
        checkPendingRequest();
        loadWalletData();
      } else {
        let errorMessage = responseData?.error || 'فشل إرسال طلب التوريد';
        if (typeof errorMessage === 'string' && errorMessage.trim() === '.') {
          errorMessage = 'فشل إرسال طلب التوريد';
        }
        console.error('Settlement request failed:', responseData);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('Error submitting settlement request:', error);
      console.error('Error stack:', error?.stack);
      
      let errorMessage = 'فشل إرسال طلب التوريد';
      
      // محاولة استخراج رسالة الخطأ من عدة مصادر
      if (error?.message && typeof error.message === 'string' && error.message.trim() && error.message.trim() !== '.') {
        errorMessage = error.message;
      } else if (error?.error && typeof error.error === 'string' && error.error.trim() && error.error.trim() !== '.') {
        errorMessage = error.error;
      }
      
      showSimpleAlert('خطأ', errorMessage, 'error');
    } finally {
      setSubmittingRequest(false);
    }
  };


  // تحديث unpaidCommission عند تغيير transactions
  useEffect(() => {
    calculateUnpaidCommission();
  }, [transactions]);

  // إغلاق الـ modal تلقائياً إذا ظهر طلب قيد المراجعة
  useEffect(() => {
    if (hasPendingRequest && showSettlementModal) {
      setShowSettlementModal(false);
      setReceiptImage(null);
      showSimpleAlert('تنبيه', 'يوجد طلب توريد قيد المراجعة بالفعل. يرجى انتظار مراجعة الطلب السابق.', 'warning');
    }
  }, [hasPendingRequest, showSettlementModal]);

  // تنظيف paymentInfo قبل استخدامه في الـ render
  const cleanedPaymentInfo = useMemo(() => {
    if (!paymentInfo || typeof paymentInfo !== 'object' || Array.isArray(paymentInfo)) {
      return null;
    }
    
    const cleaned: any = {};
    let hasValidData = false;
    
    Object.keys(paymentInfo).forEach(key => {
      const value = paymentInfo[key];
      if (value == null || value === undefined) {
        cleaned[key] = '';
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '.' || trimmed === '') {
          cleaned[key] = '';
        } else {
          cleaned[key] = value;
          hasValidData = true;
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        cleaned[key] = value;
        hasValidData = true;
      } else {
        cleaned[key] = '';
      }
    });
    
    return hasValidData ? cleaned : null;
  }, [paymentInfo]);

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
        {unpaidCommission > 0 && (
          <View style={styles.unpaidCommissionContainer}>
            <Text style={styles.unpaidCommissionLabel}>العمولة المستحقة للتوريد</Text>
            <Text style={styles.unpaidCommissionAmount}>{unpaidCommission.toFixed(2)} ج.م</Text>
          </View>
        )}
        {unpaidCommission > 0 && !hasPendingRequest && (
          <TouchableOpacity
            style={[
              styles.settlementButton,
              !isSettlementDay && styles.settlementButtonNotDay,
            ]}
            onPress={() => {
              // تنبيه إذا لم يكن يوم التوريد
              if (!isSettlementDay) {
                const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                const settlementDayName = days[settlementDayOfWeek] || 'الأحد';
                showSimpleAlert(
                  'تنبيه',
                  `اليوم ليس يوم التوريد المحدد (${settlementDayName}). يمكنك التوريد الآن، لكن يوم التوريد المحدد هو ${settlementDayName} من كل أسبوع.`,
                  'info'
                );
              }
              setShowSettlementModal(true);
            }}
          >
            <Ionicons 
              name="cash-outline" 
              size={20} 
              color="#fff" 
            />
            <Text style={styles.settlementButtonText}>
              {isSettlementDay ? 'توريد العمولة' : 'توريد العمولة (خارج يوم التوريد)'}
            </Text>
          </TouchableOpacity>
        )}
        {unpaidCommission > 0 && hasPendingRequest && (
          <TouchableOpacity
            style={[styles.settlementButton, styles.settlementButtonDisabled]}
            disabled={true}
          >
            <Ionicons name="time-outline" size={20} color="#fff" />
            <Text style={styles.settlementButtonText}>قيد المراجعة</Text>
          </TouchableOpacity>
        )}
        {unpaidCommission > 0 && !isSettlementDay && !hasPendingRequest && (
          <View style={styles.notSettlementDayBadge}>
            <Ionicons name="information-circle-outline" size={16} color="#666" />
            <Text style={styles.notSettlementDayText}>
              يوم التوريد المحدد: {(() => {
                const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                return days[settlementDayOfWeek] || 'الأحد';
              })()} من كل أسبوع - يمكنك التوريد الآن
            </Text>
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
        renderItem={({ item }) => {
          // استخراج باقي العميل والعمولة من description لمعاملات deduction
          let customerChange = 0;
          let deductionCommission = 0;
          
          if (item.type === 'deduction' && item.description) {
            // استخراج باقي العميل من description
            const changeMatch = item.description.match(/باقي العميل \(([\d.]+)/);
            if (changeMatch) {
              customerChange = parseFloat(changeMatch[1]);
            }
            
            // استخراج العمولة من description
            const commissionMatch = item.description.match(/عمولة \(([\d.]+)/);
            if (commissionMatch) {
              deductionCommission = parseFloat(commissionMatch[1]);
            }
            
            // إذا كان commission موجود في الحقل مباشرة، نستخدمه
            if (item.commission && item.commission > 0) {
              deductionCommission = item.commission;
            }
          }
          
          // البحث عن معاملة deduction مرتبطة بنفس order_id (للمعاملات earning)
          const relatedDeduction = item.type === 'earning' && item.order_id
            ? transactions.find(t => 
                t.type === 'deduction' && 
                t.order_id === item.order_id &&
                t.description?.includes('باقي العميل')
              )
            : null;
          
          // استخراج باقي العميل من معاملة deduction مرتبطة
          if (relatedDeduction) {
            const changeMatch = relatedDeduction.description?.match(/باقي العميل \(([\d.]+)/);
            if (changeMatch) {
              customerChange = parseFloat(changeMatch[1]);
            }
          }
          
          return (
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
                    <Text style={styles.transactionDescription} numberOfLines={2}>
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
                {/* عرض تفاصيل معاملات deduction */}
                {item.type === 'deduction' && customerChange > 0 && (
                  <Text style={styles.customerChangeInfo}>
                    باقي العميل: {customerChange.toFixed(2)} ج.م
                  </Text>
                )}
                {item.type === 'deduction' && deductionCommission > 0 && (
                  <Text style={styles.commissionInfo}>
                    عمولة: {deductionCommission.toFixed(2)} ج.م
                  </Text>
                )}
                {/* عرض تفاصيل معاملات earning */}
                {item.type === 'earning' && item.commission > 0 && (
                  <Text style={styles.commissionInfo}>
                    عمولة: {item.commission.toFixed(2)} ج.م
                  </Text>
                )}
                {item.type === 'earning' && customerChange > 0 && (
                  <Text style={styles.customerChangeInfo}>
                    باقي العميل: {customerChange.toFixed(2)} ج.م
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
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد معاملات</Text>
          </View>
        }
      />

      {/* Modal طلب التوريد */}
      <Modal
        visible={showSettlementModal && !hasPendingRequest}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSettlementModal(false);
          // التحقق من وجود طلب قيد المراجعة عند إغلاق الـ modal
          checkPendingRequest();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>طلب توريد العمولة</Text>
              <TouchableOpacity
                onPress={() => setShowSettlementModal(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* معلومات الدفع */}
              {cleanedPaymentInfo && (
                <View style={styles.paymentInfoCard}>
                  <Text style={styles.paymentInfoTitle}>معلومات الدفع</Text>
                  {cleanedPaymentInfo.bankName && typeof cleanedPaymentInfo.bankName === 'string' && cleanedPaymentInfo.bankName.trim() && cleanedPaymentInfo.bankName.trim() !== '.' && (
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>اسم البنك:</Text>
                      <Text style={styles.paymentInfoValue}>{cleanedPaymentInfo.bankName}</Text>
                    </View>
                  )}
                  {cleanedPaymentInfo.accountNumber && typeof cleanedPaymentInfo.accountNumber === 'string' && cleanedPaymentInfo.accountNumber.trim() && cleanedPaymentInfo.accountNumber.trim() !== '.' && (
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>رقم الحساب:</Text>
                      <Text style={styles.paymentInfoValue}>{cleanedPaymentInfo.accountNumber}</Text>
                    </View>
                  )}
                  {cleanedPaymentInfo.accountName && typeof cleanedPaymentInfo.accountName === 'string' && cleanedPaymentInfo.accountName.trim() && cleanedPaymentInfo.accountName.trim() !== '.' && (
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>اسم صاحب الحساب:</Text>
                      <Text style={styles.paymentInfoValue}>{cleanedPaymentInfo.accountName}</Text>
                    </View>
                  )}
                  {cleanedPaymentInfo.phone && typeof cleanedPaymentInfo.phone === 'string' && cleanedPaymentInfo.phone.trim() && cleanedPaymentInfo.phone.trim() !== '.' && (
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>رقم الهاتف:</Text>
                      <Text style={styles.paymentInfoValue}>{cleanedPaymentInfo.phone}</Text>
                    </View>
                  )}
                  {cleanedPaymentInfo.notes && typeof cleanedPaymentInfo.notes === 'string' && cleanedPaymentInfo.notes.trim() && cleanedPaymentInfo.notes.trim() !== '.' && (
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>ملاحظات:</Text>
                      <Text style={styles.paymentInfoValue}>{cleanedPaymentInfo.notes}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* المبلغ المستحق */}
              <View style={styles.amountCard}>
                <Text style={styles.amountLabel}>المبلغ المستحق للتوريد</Text>
                <Text style={styles.amountValue}>{unpaidCommission.toFixed(2)} ج.م</Text>
              </View>

              {/* رفع صورة الوصل */}
              <View style={styles.receiptSection}>
                <Text style={styles.receiptLabel}>صورة الوصل / الريسيت *</Text>
                {receiptImage ? (
                  <View style={styles.receiptImageContainer}>
                    <Image source={{ uri: receiptImage }} style={styles.receiptImage} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setReceiptImage(null)}
                    >
                      <Ionicons name="close-circle" size={24} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={handleImagePicker}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator color="#007AFF" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={24} color="#007AFF" />
                        <Text style={styles.uploadButtonText}>رفع صورة الوصل</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* زر الإرسال */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!receiptImage || submittingRequest || hasPendingRequest) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmitSettlementRequest}
                disabled={!receiptImage || submittingRequest || hasPendingRequest}
              >
                {submittingRequest ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>إرسال طلب التوريد</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
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
    ...M3Theme.typography.headlineMedium,
    color: M3Theme.colors.onSurface,
    textAlign: 'right',
  },
  balanceCard: {
    backgroundColor: M3Theme.colors.primary,
    margin: getM3HorizontalPadding(),
    padding: responsive.isTablet() ? 32 : 24,
    borderRadius: M3Theme.shape.cornerLarge,
    alignItems: 'center',
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth() - (responsive.getResponsivePadding() * 2),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  balanceLabel: {
    ...M3Theme.typography.bodyLarge,
    color: M3Theme.colors.onPrimary,
    opacity: 0.9,
    marginBottom: 8,
  },
  balanceAmount: {
    ...M3Theme.typography.displaySmall,
    fontWeight: 'bold',
    color: M3Theme.colors.onPrimary,
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
  customerChangeInfo: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#007AFF',
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
  unpaidCommissionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  unpaidCommissionLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#fff',
    opacity: 0.8,
    marginBottom: 4,
  },
  unpaidCommissionAmount: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#FFD700',
  },
  settlementButton: {
    ...getM3ButtonStyle(true), // M3: Full-width, 48px min height
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3Theme.colors.success.onContainer,
    borderRadius: M3Theme.shape.cornerLarge,
    marginTop: 16,
    gap: M3Theme.spacing.sm,
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  settlementButtonDisabled: {
    backgroundColor: M3Theme.colors.warning.onContainer,
    opacity: 0.8,
  },
  settlementButtonNotDay: {
    backgroundColor: M3Theme.colors.primary,
    opacity: 0.9,
  },
  settlementButtonText: {
    ...M3Theme.typography.labelLarge,
    color: '#fff',
  },
  pendingRequestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  pendingRequestText: {
    color: '#FF9500',
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '500',
  },
  notSettlementDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  notSettlementDayText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(12),
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: responsive.getResponsivePadding(),
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: responsive.getResponsivePadding(),
  },
  paymentInfoCard: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  paymentInfoTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  paymentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentInfoLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    flex: 1,
  },
  paymentInfoValue: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  amountCard: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#fff',
    opacity: 0.9,
    marginBottom: 8,
  },
  amountValue: {
    fontSize: responsive.getResponsiveFontSize(32),
    fontWeight: 'bold',
    color: '#fff',
  },
  receiptSection: {
    marginBottom: 24,
  },
  receiptLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    gap: 8,
  },
  uploadButtonText: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#007AFF',
    fontWeight: '500',
  },
  receiptImageContainer: {
    position: 'relative',
    marginTop: 12,
  },
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'contain',
    backgroundColor: '#f5f5f5',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});

