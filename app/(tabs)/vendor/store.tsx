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
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

interface StoreInfo {
  name: string;
  address: string;
  phone: string;
  working_hours: string;
  latitude?: number;
  longitude?: number;
}

export default function VendorStoreScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({
    name: '',
    address: '',
    phone: '',
    working_hours: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStoreInfo();
  }, [user]);

  const loadStoreInfo = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setStoreInfo({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          working_hours: data.working_hours || '',
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    } catch (error) {
      console.error('Error loading store info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!storeInfo.name || !storeInfo.address) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المتجر والعنوان');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('vendors').upsert({
        id: user.id,
        name: storeInfo.name,
        address: storeInfo.address,
        phone: storeInfo.phone,
        working_hours: storeInfo.working_hours,
        latitude: storeInfo.latitude,
        longitude: storeInfo.longitude,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      Alert.alert('نجح', 'تم حفظ معلومات المتجر');
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل حفظ المعلومات');
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
        <Text style={styles.title}>{t('vendor.store')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>اسم المتجر</Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل اسم المتجر"
            value={storeInfo.name}
            onChangeText={(text) => setStoreInfo({ ...storeInfo, name: text })}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>العنوان</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="أدخل عنوان المتجر"
            value={storeInfo.address}
            onChangeText={(text) =>
              setStoreInfo({ ...storeInfo, address: text })
            }
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل رقم الهاتف"
            value={storeInfo.phone}
            onChangeText={(text) => setStoreInfo({ ...storeInfo, phone: text })}
            keyboardType="phone-pad"
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>ساعات العمل</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: 9 صباحاً - 9 مساءً"
            value={storeInfo.working_hours}
            onChangeText={(text) =>
              setStoreInfo({ ...storeInfo, working_hours: text })
            }
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
            <Text style={styles.saveButtonText}>{t('vendor.updateStore')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

