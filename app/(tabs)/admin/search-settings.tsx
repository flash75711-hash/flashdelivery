import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { showToast } from '@/lib/alert';

interface SearchSettings {
  searchRadius: string;
  searchDuration: string;
}

export default function SearchSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SearchSettings>({
    searchRadius: '10',
    searchDuration: '60',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('order_search_settings')
        .select('setting_key, setting_value');

      if (error) {
        console.error('Error loading settings:', error);
        return;
      }

      const newSettings: SearchSettings = {
        searchRadius: '10',
        searchDuration: '60',
      };

      data?.forEach((setting) => {
        if (setting.setting_key === 'search_radius_km' || setting.setting_key === 'initial_search_radius_km') {
          newSettings.searchRadius = setting.setting_value;
        } else if (setting.setting_key === 'search_duration_seconds' || setting.setting_key === 'initial_search_duration_seconds') {
          newSettings.searchDuration = setting.setting_value;
        }
      });

      setSettings(newSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    // التحقق من القيم
    const searchRadius = parseFloat(settings.searchRadius);
    const searchDuration = parseFloat(settings.searchDuration);

    if (isNaN(searchRadius) || searchRadius <= 0) {
      showToast('نطاق البحث يجب أن يكون رقماً موجباً', 'error');
      return;
    }

    if (isNaN(searchDuration) || searchDuration <= 0) {
      showToast('مدة البحث يجب أن تكون رقماً موجباً', 'error');
      return;
    }

    setSaving(true);
    try {
      // حفظ الإعدادات الجديدة (النظام الموحد)
      const updates = [
        { key: 'search_radius_km', value: settings.searchRadius },
        { key: 'search_duration_seconds', value: settings.searchDuration },
        // تحديث الإعدادات القديمة للتوافق (اختياري)
        { key: 'initial_search_radius_km', value: settings.searchRadius },
        { key: 'initial_search_duration_seconds', value: settings.searchDuration },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('order_search_settings')
          .upsert({
            setting_key: update.key,
            setting_value: update.value,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'setting_key',
          });

        if (error) {
          throw error;
        }
      }

      showToast('تم حفظ الإعدادات بنجاح', 'success');
      router.back();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      showToast(error.message || 'فشل حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>إعدادات البحث عن السائقين</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>إعدادات البحث عن السائقين</Text>
          <Text style={styles.sectionDescription}>
            النظام الحالي يستخدم مرحلة واحدة للبحث (نطاق واحد ومدة واحدة)
          </Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>نطاق البحث (كم)</Text>
            <Text style={styles.description}>
              النطاق الذي سيتم البحث فيه عن السائقين عند إنشاء طلب جديد
            </Text>
            <TextInput
              style={styles.input}
              value={settings.searchRadius}
              onChangeText={(value) => setSettings({ ...settings, searchRadius: value })}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor="#999"
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>مدة البحث (ثانية)</Text>
            <Text style={styles.description}>
              المدة الزمنية للبحث عن السائقين قبل إيقاف البحث تلقائياً
            </Text>
            <TextInput
              style={styles.input}
              value={settings.searchDuration}
              onChangeText={(value) => setSettings({ ...settings, searchDuration: value })}
              keyboardType="numeric"
              placeholder="60"
              placeholderTextColor="#999"
              textAlign="right"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveSettings}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>حفظ الإعدادات</Text>
            </>
          )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginLeft: 16,
    textAlign: 'right',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  sectionTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'right',
  },
  sectionDescription: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 16,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
    textAlign: 'right',
  },
  description: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: responsive.getResponsiveFontSize(16),
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'right',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 40,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
});



