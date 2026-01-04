import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import responsive from '@/utils/responsive';
import { showToast } from '@/lib/alert';

export default function VendorProfileScreen() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [instapayNumber, setInstapayNumber] = useState<string>('');
  const [cashNumber, setCashNumber] = useState<string>('');
  const [editingPaymentLinks, setEditingPaymentLinks] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      
      // الاشتراك في Realtime لتحديث بيانات المستخدم تلقائياً
      const profileChannel = supabase
        .channel(`vendor_profile_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          () => {
            loadProfile();
          }
        )
        .subscribe();
      
      return () => {
        profileChannel.unsubscribe();
      };
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
        setInstapayNumber(data.instapay_number || '');
        setCashNumber(data.cash_number || '');
      }

      // جلب رصيد المحفظة (للإدارة قد يكون مختلف)
      // يمكن إضافة منطق خاص بالإدارة هنا
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const updateData: any = {
        full_name: fullName,
        phone: phone,
      };

      if (editingPaymentLinks) {
        updateData.instapay_number = instapayNumber || null;
        updateData.cash_number = cashNumber || null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;
      setEditingPaymentLinks(false);
      showToast('تم تحديث البيانات الشخصية', 'success');
    } catch (error: any) {
      showToast(error.message || 'فشل تحديث البيانات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('vendor.profile')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>{t('auth.fullName')}</Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل الاسم الكامل"
            value={fullName}
            onChangeText={setFullName}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('auth.phone')}</Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل رقم الهاتف"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={[styles.input, styles.disabledInput]}
            value={user?.email || ''}
            editable={false}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        {/* قسم المحفظة وطرق الدفع */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>المحفظة وطرق الدفع</Text>
            <TouchableOpacity
              onPress={() => setEditingPaymentLinks(!editingPaymentLinks)}
              style={styles.editButton}
            >
              <Ionicons 
                name={editingPaymentLinks ? "checkmark" : "pencil"} 
                size={20} 
                color="#007AFF" 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <Ionicons name="wallet" size={24} color="#34C759" />
              <Text style={styles.walletTitle}>رصيد المحفظة</Text>
            </View>
            <Text style={styles.walletBalance}>
              {walletBalance.toFixed(2)} جنيه
            </Text>
            <Text style={styles.walletSubtext}>
              رصيد الإدارة
            </Text>
          </View>

          <View style={styles.socialLinksCard}>
            <View style={styles.socialLinkRow}>
              <View style={styles.socialLinkHeader}>
                <Ionicons name="card" size={20} color="#007AFF" />
                <Text style={styles.socialLinkLabel}>انستاباي</Text>
              </View>
              {editingPaymentLinks ? (
                <TextInput
                  style={styles.socialLinkInput}
                  value={instapayNumber}
                  onChangeText={setInstapayNumber}
                  placeholder="رقم انستاباي"
                  placeholderTextColor="#999"
                  textAlign="right"
                  keyboardType="numeric"
                />
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (instapayNumber && Platform.OS === 'web' && typeof window !== 'undefined') {
                      navigator.clipboard?.writeText(instapayNumber);
                      showToast('تم نسخ رقم انستاباي', 'success');
                    }
                  }}
                  disabled={!instapayNumber}
                >
                  <Text style={[
                    styles.socialLinkValue,
                    !instapayNumber && styles.socialLinkValueEmpty
                  ]}>
                    {instapayNumber || 'غير محدد'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.socialLinkRow}>
              <View style={styles.socialLinkHeader}>
                <Ionicons name="cash" size={20} color="#FF9500" />
                <Text style={styles.socialLinkLabel}>كاش</Text>
              </View>
              {editingPaymentLinks ? (
                <TextInput
                  style={styles.socialLinkInput}
                  value={cashNumber}
                  onChangeText={setCashNumber}
                  placeholder="رقم كاش أو رابط"
                  placeholderTextColor="#999"
                  textAlign="right"
                />
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (cashNumber) {
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        if (cashNumber.startsWith('http')) {
                          window.open(cashNumber, '_blank');
                        } else {
                          // نسخ الرقم
                          navigator.clipboard?.writeText(cashNumber);
                          showToast('تم نسخ الرقم', 'success');
                        }
                      }
                    }
                  }}
                  disabled={!cashNumber}
                >
                  <Text style={[
                    styles.socialLinkValue,
                    !cashNumber && styles.socialLinkValueEmpty
                  ]}>
                    {cashNumber || 'غير محدد'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>

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
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: tabBarBottomPadding,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: responsive.getResponsivePadding(),
    paddingBottom: responsive.getResponsivePadding() + 20,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  section: {
    marginBottom: responsive.isTablet() ? 32 : 24,
  },
  label: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: responsive.isTablet() ? 20 : 16,
    fontSize: responsive.getResponsiveFontSize(16),
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: '#999',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: responsive.isTablet() ? 20 : 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: responsive.getTabBarBottomPadding() + 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: responsive.isTablet() ? 20 : 16,
    marginTop: 16,
    marginBottom: responsive.getTabBarBottomPadding() + 20,
    borderWidth: 1,
    borderColor: '#FF3B30',
    gap: 8,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  editButton: {
    padding: 4,
  },
  walletCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  walletTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  walletBalance: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    color: '#34C759',
    marginBottom: 4,
  },
  walletSubtext: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  socialLinksCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  socialLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  socialLinkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  socialLinkLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  socialLinkValue: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
    fontWeight: '500',
  },
  socialLinkValueEmpty: {
    color: '#999',
    fontStyle: 'italic',
  },
  socialLinkInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    fontSize: responsive.getResponsiveFontSize(14),
    textAlign: 'right',
    marginLeft: 12,
  },
});

