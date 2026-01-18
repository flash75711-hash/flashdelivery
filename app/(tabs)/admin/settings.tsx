import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import responsive, { getM3CardStyle, getM3ButtonStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import { showSimpleAlert } from '@/lib/alert';

interface Setting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: 'number' | 'text' | 'boolean';
  description: string;
  category: string;
}

export default function AdminSettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  // جلب الإعدادات
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;

      // تصفية max_auto_retry_attempts وإعدادات الطلبات (category === 'orders') لأنها غير مطلوبة
      const filteredData = (data || []).filter(
        setting => setting.setting_key !== 'max_auto_retry_attempts' && setting.category !== 'orders'
      );

      setSettings(filteredData);
      
      // تهيئة القيم المعدلة (مع تصفية max_auto_retry_attempts)
      const initialValues: Record<string, string> = {};
      filteredData.forEach(setting => {
        initialValues[setting.setting_key] = setting.setting_value;
      });
      setEditedValues(initialValues);
    } catch (error: any) {
      console.error('Error loading settings:', error);
      showSimpleAlert('خطأ', `فشل تحميل الإعدادات: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      // حفظ كل إعداد تم تعديله
      const updates = settings.map(async (setting) => {
        const newValue = editedValues[setting.setting_key];
        if (newValue !== setting.setting_value) {
          const { error } = await supabase
            .rpc('update_app_setting', {
              p_key: setting.setting_key,
              p_value: newValue,
              p_user_id: user.id,
            });

          if (error) throw error;
        }
      });

      await Promise.all(updates);

      showSimpleAlert('نجح', '✅ تم حفظ الإعدادات بنجاح', 'success');

      loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      showSimpleAlert('خطأ', error.message || 'فشل حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const initialValues: Record<string, string> = {};
    settings.forEach(setting => {
      initialValues[setting.setting_key] = setting.setting_value;
    });
    setEditedValues(initialValues);
    
    showSimpleAlert('تم', 'تم إعادة تعيين القيم', 'success');
  };

  const handleSettleCommissions = async () => {
    if (!user) return;

    try {
      setSaving(true);

      // استدعاء Edge Function لتوريد العمولات
      const { data, error } = await supabase.functions.invoke('settle-commissions', {
        body: {
          force: true, // فرض التوريد حتى لو لم يكن يوم التوريد
        },
      });

      if (error) {
        throw error;
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'فشل توريد العمولات');
      }

      showSimpleAlert(
        'نجح',
        `✅ تم توريد العمولات بنجاح\nعدد السجلات: ${data.settledCount}\nإجمالي العمولة: ${data.totalCommission?.toFixed(2) || 0} جنيه`,
        'success'
      );
    } catch (error: any) {
      console.error('Error settling commissions:', error);
      showSimpleAlert('خطأ', error.message || 'فشل توريد العمولات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderSetting = (setting: Setting) => {
    const value = editedValues[setting.setting_key] || '';
    const hasChanged = value !== setting.setting_value;

    return (
      <View key={setting.id} style={styles.settingCard}>
        <View style={styles.settingHeader}>
          <Text style={styles.settingLabel}>{setting.description}</Text>
          {hasChanged && (
            <View style={styles.changedBadge}>
              <Text style={styles.changedText}>معدل</Text>
            </View>
          )}
        </View>
        
        <Text style={styles.settingKey}>{setting.setting_key}</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={(text) => {
              setEditedValues(prev => ({
                ...prev,
                [setting.setting_key]: text,
              }));
            }}
            keyboardType={setting.setting_type === 'number' ? 'numeric' : 'default'}
            placeholder={`أدخل ${setting.description}`}
          />
          {setting.setting_type === 'number' && (
            <Text style={styles.inputUnit}>
              {setting.setting_key.includes('timeout') || setting.setting_key.includes('interval') 
                ? 'ثانية' 
                : 'مرة'}
            </Text>
          )}
        </View>

        {setting.setting_key === 'driver_response_timeout' && (
          <Text style={styles.helperText}>
            ⏱️ المدة التي ينتظرها النظام للحصول على رد من السائق قبل إعادة المحاولة
          </Text>
        )}
        {setting.setting_key === 'commission_rate' && (
          <Text style={styles.helperText}>
            💰 نسبة العمولة المئوية التي تأخذها الإدارة من كل تحصيل (10 = 10%)
          </Text>
        )}
        {setting.setting_key === 'settlement_day_of_week' && (
          <Text style={styles.helperText}>
            📅 يوم التوريد من كل أسبوع (0 = الأحد، 1 = الاثنين، 2 = الثلاثاء، 3 = الأربعاء، 4 = الخميس، 5 = الجمعة، 6 = السبت) - اليوم الذي يمكن للسائقين فيه طلب توريد العمولة
          </Text>
        )}
      </View>
    );
  };

  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, Setting[]>);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جاري تحميل الإعدادات...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="settings" size={28} color="#007AFF" />
        <Text style={styles.title}>إعدادات النظام</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#007AFF" />
          <Text style={styles.infoText}>
            يمكنك تعديل إعدادات نظام إعادة المحاولات والبحث عن السائقين من هنا
          </Text>
        </View>

        {Object.entries(groupedSettings).map(([category, categorySettings]) => (
          <View key={category} style={styles.categoryContainer}>
            <Text style={styles.categoryTitle}>
              {category === 'commission' ? '💰 إعدادات العمولة والتوريد' : category}
            </Text>
            {categorySettings.map(renderSetting)}
            {category === 'commission' && (
              <TouchableOpacity
                style={styles.settleButton}
                onPress={handleSettleCommissions}
                disabled={saving}
              >
                <Ionicons name="cash" size={20} color="#fff" />
                <Text style={styles.settleButtonText}>توريد العمولات الآن</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.buttonText}>حفظ التغييرات</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.resetButton]}
            onPress={handleReset}
            disabled={saving}
          >
            <Ionicons name="refresh" size={20} color="#FF9500" />
            <Text style={[styles.buttonText, { color: '#FF9500' }]}>إعادة تعيين</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: responsive.getResponsiveHeaderPadding(),
    backgroundColor: M3Theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: M3Theme.colors.outlineVariant,
  },
  title: {
    ...M3Theme.typography.headlineSmall,
    color: M3Theme.colors.onSurface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: responsive.getResponsivePadding(),
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
    lineHeight: 20,
  },
  categoryContainer: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settingLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  changedBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changedText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#fff',
    fontWeight: '600',
  },
  settingKey: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: responsive.getResponsiveFontSize(16),
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputUnit: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  helperText: {
    fontSize: responsive.getResponsiveFontSize(13),
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
  },
  actionsContainer: {
    gap: 12,
    marginTop: 12,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  resetButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF9500',
  },
  buttonText: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#fff',
  },
  settleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#34C759',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
  },
  settleButtonText: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#fff',
  },
});











