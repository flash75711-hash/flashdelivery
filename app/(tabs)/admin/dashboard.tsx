import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardStats {
  totalRevenue: number;
  totalTrips: number;
  totalCommissions: number;
  activeDrivers: number;
}

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalTrips: 0,
    totalCommissions: 0,
    activeDrivers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [maxDeliveryDistance, setMaxDeliveryDistance] = useState<string>('3');
  const [editingDistance, setEditingDistance] = useState(false);
  const [savingDistance, setSavingDistance] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    loadStats();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'max_delivery_distance')
        .single();

      if (!error && data) {
        setMaxDeliveryDistance(data.value);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveMaxDeliveryDistance = async () => {
    const distance = parseFloat(maxDeliveryDistance);
    if (isNaN(distance) || distance <= 0) {
      Alert.alert('خطأ', 'الرجاء إدخال رقم صحيح أكبر من صفر');
      return;
    }

    setSavingDistance(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'max_delivery_distance',
          value: distance.toString(),
          description: 'المسافة القصوى للتوصيل بالكيلومتر (للطلبات بدون مزود خدمة)',
        }, {
          onConflict: 'key',
        });

      if (error) throw error;
      
      setEditingDistance(false);
      Alert.alert('نجح', 'تم حفظ المسافة القصوى للتوصيل بنجاح');
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل حفظ الإعدادات');
    } finally {
      setSavingDistance(false);
    }
  };

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

  const handleLogout = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('هل أنت متأكد من تسجيل الخروج؟');
      if (confirmed) {
        performLogout();
      }
    } else {
      Alert.alert('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تسجيل الخروج',
          style: 'destructive',
          onPress: performLogout,
        },
      ]);
    }
  };

  const performLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } catch (error: any) {
      console.error('Error during logout:', error);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } finally {
      setLoggingOut(false);
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
            value={`${stats.totalRevenue.toFixed(2)} ج.م`}
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
            value={`${stats.totalCommissions.toFixed(2)} ج.م`}
          />
          <StatCard
            icon="people"
            iconColor="#AF52DE"
            title={t('admin.activeDrivers')}
            value={stats.activeDrivers}
          />
        </View>

        {/* قسم الإدارة */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>الإدارة</Text>
          
          <TouchableOpacity
            style={styles.managementCard}
            onPress={() => router.push('/(tabs)/admin/places')}
          >
            <View style={styles.managementInfo}>
              <Ionicons name="location" size={24} color="#007AFF" />
              <View style={styles.managementTextContainer}>
                <Text style={styles.managementLabel}>إدارة الأماكن</Text>
                <Text style={styles.managementDescription}>
                  إضافة وتعديل وحذف المولات والأسواق والمناطق في الدليل
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* قسم الإعدادات */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>الإعدادات</Text>
          
          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <View style={styles.settingInfo}>
                <Ionicons name="location" size={24} color="#007AFF" />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>المسافة القصوى للتوصيل</Text>
                  <Text style={styles.settingDescription}>
                    المسافة القصوى بالكيلومتر للطلبات بدون مزود خدمة (افتراضي: 3 كم)
                  </Text>
                </View>
              </View>
            </View>
            
            {editingDistance ? (
              <View style={styles.settingEditContainer}>
                <TextInput
                  style={styles.settingInput}
                  value={maxDeliveryDistance}
                  onChangeText={setMaxDeliveryDistance}
                  keyboardType="numeric"
                  placeholder="المسافة بالكيلومتر"
                  placeholderTextColor="#999"
                />
                <View style={styles.settingButtons}>
                  <TouchableOpacity
                    style={[styles.settingButton, styles.cancelButton]}
                    onPress={() => {
                      setEditingDistance(false);
                      loadSettings(); // إعادة تحميل القيمة الأصلية
                    }}
                  >
                    <Text style={styles.cancelButtonText}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.settingButton, styles.saveButton]}
                    onPress={saveMaxDeliveryDistance}
                    disabled={savingDistance}
                  >
                    <Text style={styles.saveButtonText}>
                      {savingDistance ? 'جاري الحفظ...' : 'حفظ'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.settingValueContainer}>
                <Text style={styles.settingValue}>{maxDeliveryDistance} كم</Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setEditingDistance(true)}
                >
                  <Ionicons name="pencil" size={20} color="#007AFF" />
                  <Text style={styles.editButtonText}>تعديل</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* زر تسجيل الخروج */}
        <View style={styles.logoutSection}>
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={handleLogout}
            disabled={loggingOut}
          >
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
            <Text style={styles.logoutText}>
              {t('auth.logout')}
            </Text>
          </TouchableOpacity>
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
  settingsSection: {
    marginTop: 32,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'right',
  },
  settingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  settingHeader: {
    marginBottom: 16,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  settingValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  settingValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e3f2fd',
  },
  editButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  settingEditContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  settingInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  settingButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  settingButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  managementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  managementInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  managementTextContainer: {
    flex: 1,
  },
  managementLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  managementDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  logoutSection: {
    marginTop: 32,
    marginBottom: 40,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF3B30',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 18,
    fontWeight: '600',
  },
});

