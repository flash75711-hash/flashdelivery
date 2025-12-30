import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';

interface SearchSettings {
  initialRadius: string;
  expandedRadius: string;
  initialDuration: string;
  expandedDuration: string;
}

export default function SearchSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SearchSettings>({
    initialRadius: '3',
    expandedRadius: '6',
    initialDuration: '10',
    expandedDuration: '10',
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
        initialRadius: '3',
        expandedRadius: '6',
        initialDuration: '10',
        expandedDuration: '10',
      };

      data?.forEach((setting) => {
        switch (setting.setting_key) {
          case 'initial_search_radius_km':
            newSettings.initialRadius = setting.setting_value;
            break;
          case 'expanded_search_radius_km':
            newSettings.expandedRadius = setting.setting_value;
            break;
          case 'initial_search_duration_seconds':
            newSettings.initialDuration = setting.setting_value;
            break;
          case 'expanded_search_duration_seconds':
            newSettings.expandedDuration = setting.setting_value;
            break;
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
    const initialRadius = parseFloat(settings.initialRadius);
    const expandedRadius = parseFloat(settings.expandedRadius);
    const initialDuration = parseFloat(settings.initialDuration);
    const expandedDuration = parseFloat(settings.expandedDuration);

    if (isNaN(initialRadius) || initialRadius <= 0) {
      Alert.alert('خطأ', 'نطاق البحث الأولي يجب أن يكون رقماً موجباً');
      return;
    }

    if (isNaN(expandedRadius) || expandedRadius <= 0) {
      Alert.alert('خطأ', 'نطاق البحث الموسع يجب أن يكون رقماً موجباً');
      return;
    }

    if (expandedRadius <= initialRadius) {
      Alert.alert('خطأ', 'نطاق البحث الموسع يجب أن يكون أكبر من النطاق الأولي');
      return;
    }

    if (isNaN(initialDuration) || initialDuration <= 0) {
      Alert.alert('خطأ', 'مدة البحث الأولي يجب أن تكون رقماً موجباً');
      return;
    }

    if (isNaN(expandedDuration) || expandedDuration <= 0) {
      Alert.alert('خطأ', 'مدة البحث الموسع يجب أن تكون رقماً موجباً');
      return;
    }

    setSaving(true);
    try {
      const updates = [
        { key: 'initial_search_radius_km', value: settings.initialRadius },
        { key: 'expanded_search_radius_km', value: settings.expandedRadius },
        { key: 'initial_search_duration_seconds', value: settings.initialDuration },
        { key: 'expanded_search_duration_seconds', value: settings.expandedDuration },
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

      Alert.alert('نجح', 'تم حفظ الإعدادات بنجاح');
      router.back();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      Alert.alert('خطأ', error.message || 'فشل حفظ الإعدادات');
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
          <Text style={styles.sectionTitle}>نطاق البحث</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>نطاق البحث الأولي (كم)</Text>
            <Text style={styles.description}>
              النطاق الأولي للبحث عن السائقين عند إنشاء طلب جديد
            </Text>
            <TextInput
              style={styles.input}
              value={settings.initialRadius}
              onChangeText={(value) => setSettings({ ...settings, initialRadius: value })}
              keyboardType="numeric"
              placeholder="3"
              placeholderTextColor="#999"
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>نطاق البحث الموسع (كم)</Text>
            <Text style={styles.description}>
              النطاق الموسع للبحث إذا لم يتم العثور على سائق في النطاق الأولي
            </Text>
            <TextInput
              style={styles.input}
              value={settings.expandedRadius}
              onChangeText={(value) => setSettings({ ...settings, expandedRadius: value })}
              keyboardType="numeric"
              placeholder="6"
              placeholderTextColor="#999"
              textAlign="right"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>مدة البحث</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>مدة البحث الأولي (ثانية)</Text>
            <Text style={styles.description}>
              المدة الزمنية للبحث في النطاق الأولي قبل التوسع
            </Text>
            <TextInput
              style={styles.input}
              value={settings.initialDuration}
              onChangeText={(value) => setSettings({ ...settings, initialDuration: value })}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor="#999"
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>مدة البحث الموسع (ثانية)</Text>
            <Text style={styles.description}>
              المدة الزمنية للبحث في النطاق الموسع قبل إيقاف البحث
            </Text>
            <TextInput
              style={styles.input}
              value={settings.expandedDuration}
              onChangeText={(value) => setSettings({ ...settings, expandedDuration: value })}
              keyboardType="numeric"
              placeholder="10"
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
    marginBottom: 16,
    textAlign: 'right',
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



