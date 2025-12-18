import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import responsive from '@/utils/responsive';

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

  useEffect(() => {
    loadProfile();
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
      }
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
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
        })
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert('نجح', 'تم تحديث البيانات الشخصية');
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل تحديث البيانات');
    } finally {
      setSaving(false);
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

      <ScrollView style={styles.content}>
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
    flex: 1,
    padding: responsive.getResponsivePadding(),
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
});

