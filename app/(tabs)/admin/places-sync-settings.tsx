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
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import responsive from '@/utils/responsive';
import { showSimpleAlert, showConfirm } from '@/lib/alert';
import { createShadowStyle } from '@/utils/responsive';

interface SyncSetting {
  id: string;
  city_name: string;
  auto_sync_enabled: boolean;
  sync_interval_days: number;
  sync_malls: boolean;
  sync_markets: boolean;
  sync_areas: boolean;
  priority: number;
  last_sync_at: string | null;
  next_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function PlacesSyncSettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SyncSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCity, setEditingCity] = useState<string | null>(null);
  const [newCityName, setNewCityName] = useState('');
  const [showAddCity, setShowAddCity] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('places_sync_settings')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;

      setSettings(data || []);
    } catch (error: any) {
      console.error('Error loading sync settings:', error);
      showSimpleAlert('خطأ', `فشل تحميل الإعدادات: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (setting: SyncSetting) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('places_sync_settings')
        .update({
          auto_sync_enabled: setting.auto_sync_enabled,
          sync_interval_days: setting.sync_interval_days,
          sync_malls: setting.sync_malls,
          sync_markets: setting.sync_markets,
          sync_areas: setting.sync_areas,
          priority: setting.priority,
        })
        .eq('id', setting.id);

      if (error) throw error;

      showSimpleAlert('نجح', 'تم حفظ الإعدادات بنجاح', 'success');
      setEditingCity(null);
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving sync settings:', error);
      showSimpleAlert('خطأ', `فشل حفظ الإعدادات: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCity = async () => {
    if (!newCityName.trim()) {
      showSimpleAlert('خطأ', 'يرجى إدخال اسم المدينة', 'error');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('places_sync_settings')
        .insert({
          city_name: newCityName.trim(),
          auto_sync_enabled: true,
          sync_interval_days: 7,
          sync_malls: true,
          sync_markets: true,
          sync_areas: true,
          priority: 0,
        });

      if (error) throw error;

      showSimpleAlert('نجح', 'تم إضافة المدينة بنجاح', 'success');
      setNewCityName('');
      setShowAddCity(false);
      await loadSettings();
    } catch (error: any) {
      console.error('Error adding city:', error);
      showSimpleAlert('خطأ', `فشل إضافة المدينة: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (setting: SyncSetting) => {
    const confirmed = await showConfirm(
      'حذف المدينة',
      `هل أنت متأكد من حذف إعدادات مزامنة مدينة "${setting.city_name}"؟`,
      {
        confirmText: 'نعم، احذف',
        cancelText: 'إلغاء',
        type: 'warning',
      }
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('places_sync_settings')
        .delete()
        .eq('id', setting.id);

      if (error) throw error;

      showSimpleAlert('نجح', 'تم حذف المدينة بنجاح', 'success');
      await loadSettings();
    } catch (error: any) {
      console.error('Error deleting city:', error);
      showSimpleAlert('خطأ', `فشل حذف المدينة: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleManualSync = async (setting: SyncSetting) => {
    const confirmed = await showConfirm(
      'مزامنة يدوية',
      `هل تريد مزامنة الأماكن لمدينة "${setting.city_name}" الآن؟`,
      {
        confirmText: 'نعم، مزامنة',
        cancelText: 'إلغاء',
        type: 'question',
      }
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      // استدعاء Edge Function للمزامنة
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      // مزامنة كل نوع من الأماكن
      const types = [];
      if (setting.sync_malls) types.push('mall');
      if (setting.sync_markets) types.push('market');
      if (setting.sync_areas) types.push('area');

      for (const type of types) {
        const response = await fetch(`${supabaseUrl}/functions/v1/sync-places`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            cityName: setting.city_name,
            placeType: type,
          }),
        });

        if (!response.ok) {
          console.warn(`Failed to sync ${type} for ${setting.city_name}`);
        }
      }

      // تحديث last_sync_at
      await supabase
        .from('places_sync_settings')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', setting.id);

      showSimpleAlert('نجح', `تم مزامنة مدينة "${setting.city_name}" بنجاح`, 'success');
      await loadSettings();
    } catch (error: any) {
      console.error('Error syncing city:', error);
      showSimpleAlert('خطأ', `فشل المزامنة: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (id: string, field: keyof SyncSetting, value: any) => {
    setSettings(prev =>
      prev.map(setting =>
        setting.id === id ? { ...setting, [field]: value } : setting
      )
    );
  };

  const styles = getStyles();

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
        <Ionicons name="sync" size={28} color="#007AFF" />
        <Text style={styles.title}>إعدادات مزامنة الأماكن</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#007AFF" />
          <Text style={styles.infoText}>
            يمكنك التحكم في التحديث التلقائي للأماكن لكل مدينة من هنا
          </Text>
        </View>

        {settings.map(setting => (
          <View key={setting.id} style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <View>
                <Text style={styles.cityName}>{setting.city_name}</Text>
                <Text style={styles.cityInfo}>
                  أولوية: {setting.priority} • تحديث كل {setting.sync_interval_days} يوم
                </Text>
                {setting.last_sync_at && (
                  <Text style={styles.lastSync}>
                    آخر مزامنة: {new Date(setting.last_sync_at).toLocaleDateString('ar-EG')}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleManualSync(setting)}
                style={styles.syncButton}
                disabled={saving}
              >
                <Ionicons name="refresh" size={20} color="#007AFF" />
                <Text style={styles.syncButtonText}>مزامنة</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>التحديث التلقائي</Text>
              <Switch
                value={setting.auto_sync_enabled}
                onValueChange={value => updateSetting(setting.id, 'auto_sync_enabled', value)}
                disabled={editingCity !== setting.id}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>مدة التحديث (أيام)</Text>
              <TextInput
                style={styles.numberInput}
                value={setting.sync_interval_days.toString()}
                onChangeText={text => {
                  const num = parseInt(text) || 7;
                  updateSetting(setting.id, 'sync_interval_days', num);
                }}
                keyboardType="numeric"
                editable={editingCity === setting.id}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>الأولوية</Text>
              <TextInput
                style={styles.numberInput}
                value={setting.priority.toString()}
                onChangeText={text => {
                  const num = parseInt(text) || 0;
                  updateSetting(setting.id, 'priority', num);
                }}
                keyboardType="numeric"
                editable={editingCity === setting.id}
              />
            </View>

            <View style={styles.typesContainer}>
              <Text style={styles.typesLabel}>أنواع الأماكن:</Text>
              <View style={styles.typesRow}>
                <View style={styles.typeSwitch}>
                  <Text style={styles.typeLabel}>مولات</Text>
                  <Switch
                    value={setting.sync_malls}
                    onValueChange={value => updateSetting(setting.id, 'sync_malls', value)}
                    disabled={editingCity !== setting.id}
                  />
                </View>
                <View style={styles.typeSwitch}>
                  <Text style={styles.typeLabel}>أسواق</Text>
                  <Switch
                    value={setting.sync_markets}
                    onValueChange={value => updateSetting(setting.id, 'sync_markets', value)}
                    disabled={editingCity !== setting.id}
                  />
                </View>
                <View style={styles.typeSwitch}>
                  <Text style={styles.typeLabel}>مناطق</Text>
                  <Switch
                    value={setting.sync_areas}
                    onValueChange={value => updateSetting(setting.id, 'sync_areas', value)}
                    disabled={editingCity !== setting.id}
                  />
                </View>
              </View>
            </View>

            <View style={styles.actionsRow}>
              {editingCity === setting.id ? (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.saveButton]}
                    onPress={() => handleSave(setting)}
                    disabled={saving}
                  >
                    <Text style={styles.actionButtonText}>حفظ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => {
                      setEditingCity(null);
                      loadSettings();
                    }}
                    disabled={saving}
                  >
                    <Text style={styles.actionButtonText}>إلغاء</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => setEditingCity(setting.id)}
                  >
                    <Text style={styles.actionButtonText}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(setting)}
                    disabled={saving}
                  >
                    <Text style={styles.actionButtonText}>حذف</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))}

        {showAddCity ? (
          <View style={styles.addCityCard}>
            <Text style={styles.addCityTitle}>إضافة مدينة جديدة</Text>
            <TextInput
              style={styles.cityInput}
              placeholder="اسم المدينة"
              value={newCityName}
              onChangeText={setNewCityName}
            />
            <View style={styles.addCityActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleAddCity}
                disabled={saving}
              >
                <Text style={styles.actionButtonText}>إضافة</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddCity(false);
                  setNewCityName('');
                }}
                disabled={saving}
              >
                <Text style={styles.actionButtonText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddCity(true)}
          >
            <Ionicons name="add-circle" size={24} color="#007AFF" />
            <Text style={styles.addButtonText}>إضافة مدينة جديدة</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles() {
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5F5F5',
      paddingBottom: tabBarBottomPadding,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: responsive.wp(4),
      backgroundColor: '#FFFFFF',
      ...createShadowStyle(2),
      gap: responsive.wp(3),
    },
    title: {
      fontSize: responsive.getResponsiveFontSize(20),
      fontWeight: 'bold',
      color: '#1A1A1A',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: responsive.wp(4),
      gap: responsive.wp(4),
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: responsive.wp(4),
    },
    loadingText: {
      fontSize: responsive.getResponsiveFontSize(16),
      color: '#666',
    },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: responsive.wp(4),
      backgroundColor: '#E3F2FD',
      borderRadius: responsive.wp(3),
      gap: responsive.wp(3),
    },
    infoText: {
      flex: 1,
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#1976D2',
    },
    settingCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: responsive.wp(3),
      padding: responsive.wp(4),
      ...createShadowStyle(2),
      gap: responsive.wp(3),
    },
    settingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: responsive.wp(2),
    },
    cityName: {
      fontSize: responsive.getResponsiveFontSize(18),
      fontWeight: 'bold',
      color: '#1A1A1A',
      marginBottom: responsive.wp(1),
    },
    cityInfo: {
      fontSize: responsive.getResponsiveFontSize(12),
      color: '#666',
      marginBottom: responsive.wp(0.5),
    },
    lastSync: {
      fontSize: responsive.getResponsiveFontSize(12),
      color: '#999',
    },
    syncButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: responsive.wp(3),
      paddingVertical: responsive.wp(1.5),
      backgroundColor: '#E3F2FD',
      borderRadius: responsive.wp(2),
      gap: responsive.wp(1),
    },
    syncButtonText: {
      fontSize: responsive.getResponsiveFontSize(12),
      color: '#007AFF',
      fontWeight: '600',
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: responsive.wp(2),
    },
    settingLabel: {
      fontSize: responsive.getResponsiveFontSize(14),
      color: '#1A1A1A',
      flex: 1,
    },
    numberInput: {
      width: responsive.wp(20),
      padding: responsive.wp(2),
      borderWidth: 1,
      borderColor: '#DDD',
      borderRadius: responsive.wp(2),
      fontSize: responsive.getResponsiveFontSize(14),
      textAlign: 'center',
    },
    typesContainer: {
      marginTop: responsive.wp(2),
      paddingTop: responsive.wp(3),
      borderTopWidth: 1,
      borderTopColor: '#EEE',
    },
    typesLabel: {
      fontSize: responsive.getResponsiveFontSize(14),
      fontWeight: '600',
      color: '#1A1A1A',
      marginBottom: responsive.wp(2),
    },
    typesRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    typeSwitch: {
      alignItems: 'center',
      gap: responsive.wp(1),
    },
    typeLabel: {
      fontSize: responsive.getResponsiveFontSize(12),
      color: '#666',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: responsive.wp(2),
      marginTop: responsive.wp(2),
    },
    actionButton: {
      flex: 1,
      padding: responsive.wp(3),
      borderRadius: responsive.wp(2),
      alignItems: 'center',
    },
    editButton: {
      backgroundColor: '#007AFF',
    },
    saveButton: {
      backgroundColor: '#4CAF50',
    },
    cancelButton: {
      backgroundColor: '#999',
    },
    deleteButton: {
      backgroundColor: '#F44336',
    },
    actionButtonText: {
      color: '#FFFFFF',
      fontSize: responsive.getResponsiveFontSize(14),
      fontWeight: '600',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: responsive.wp(4),
      backgroundColor: '#FFFFFF',
      borderRadius: responsive.wp(3),
      ...createShadowStyle(2),
      gap: responsive.wp(2),
    },
    addButtonText: {
      fontSize: responsive.getResponsiveFontSize(16),
      color: '#007AFF',
      fontWeight: '600',
    },
    addCityCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: responsive.wp(3),
      padding: responsive.wp(4),
      ...createShadowStyle(2),
      gap: responsive.wp(3),
    },
    addCityTitle: {
      fontSize: responsive.getResponsiveFontSize(16),
      fontWeight: 'bold',
      color: '#1A1A1A',
    },
    cityInput: {
      padding: responsive.wp(3),
      borderWidth: 1,
      borderColor: '#DDD',
      borderRadius: responsive.wp(2),
      fontSize: responsive.getResponsiveFontSize(14),
    },
    addCityActions: {
      flexDirection: 'row',
      gap: responsive.wp(2),
    },
  });
}

