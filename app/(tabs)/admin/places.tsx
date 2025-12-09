import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

interface Place {
  id: string;
  name: string;
  address: string;
  type: 'mall' | 'market' | 'area';
  latitude?: number;
  longitude?: number;
  phone?: string;
  description?: string;
}

export default function AdminPlacesScreen() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mall' | 'market' | 'area'>('mall');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: 'mall' as 'mall' | 'market' | 'area',
    latitude: '',
    longitude: '',
    phone: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    loadPlaces();
  }, [activeTab]);

  const loadPlaces = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('type', activeTab)
        .order('name');

      if (error) throw error;
      setPlaces(data || []);
    } catch (error: any) {
      console.error('Error loading places:', error);
      Alert.alert('خطأ', 'فشل تحميل الأماكن');
    } finally {
      setLoading(false);
    }
  };

  const handleGetCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('تنبيه', 'يجب السماح بالوصول للموقع');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setFormData({
        ...formData,
        latitude: location.coords.latitude.toString(),
        longitude: location.coords.longitude.toString(),
      });

      // جلب العنوان من الإحداثيات
      const lat = location.coords.latitude;
      const lon = location.coords.longitude;
      
      const data = await reverseGeocode(lat, lon);
      
        if (data && data.display_name) {
          setFormData({
            ...formData,
            latitude: lat.toString(),
            longitude: lon.toString(),
            address: data.display_name,
          });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('خطأ', 'فشل جلب الموقع');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المكان');
      return;
    }

    setSaving(true);
    try {
      const placeData: any = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        type: formData.type,
        phone: formData.phone.trim() || null,
        description: formData.description.trim() || null,
        is_manual: true, // الأماكن اليدوية من المدير
      };

      if (formData.latitude && formData.longitude) {
        placeData.latitude = parseFloat(formData.latitude);
        placeData.longitude = parseFloat(formData.longitude);
      }

      // استخراج المدينة من العنوان إذا أمكن
      if (formData.address) {
        const addressParts = formData.address.split('،');
        if (addressParts.length > 0) {
          placeData.city = addressParts[addressParts.length - 1].trim();
        }
      }

      if (editingPlace) {
        // تحديث
        const { error } = await supabase
          .from('places')
          .update(placeData)
          .eq('id', editingPlace.id);

        if (error) throw error;
        Alert.alert('نجح', 'تم تحديث المكان بنجاح');
      } else {
        // إضافة جديد
        const { error } = await supabase
          .from('places')
          .insert(placeData);

        if (error) throw error;
        Alert.alert('نجح', 'تم إضافة المكان بنجاح');
      }

      setShowAddModal(false);
      resetForm();
      loadPlaces();
    } catch (error: any) {
      console.error('Error saving place:', error);
      Alert.alert('خطأ', error.message || 'فشل حفظ المكان');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (place: Place) => {
    setEditingPlace(place);
    setFormData({
      name: place.name,
      address: place.address || '',
      type: place.type,
      latitude: place.latitude?.toString() || '',
      longitude: place.longitude?.toString() || '',
      phone: '',
      description: '',
    });
    setShowAddModal(true);
  };

  const handleDelete = (place: Place) => {
    Alert.alert(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف "${place.name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('places')
                .delete()
                .eq('id', place.id);

              if (error) throw error;
              Alert.alert('نجح', 'تم حذف المكان بنجاح');
              loadPlaces();
            } catch (error: any) {
              Alert.alert('خطأ', error.message || 'فشل حذف المكان');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      type: activeTab,
      latitude: '',
      longitude: '',
      phone: '',
      description: '',
    });
    setEditingPlace(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/admin/dashboard');
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>إدارة الأماكن</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* التبويبات */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mall' && styles.tabActive]}
          onPress={() => setActiveTab('mall')}
        >
          <Ionicons name="storefront" size={20} color={activeTab === 'mall' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'mall' && styles.tabTextActive]}>المولات</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'market' && styles.tabActive]}
          onPress={() => setActiveTab('market')}
        >
          <Ionicons name="basket" size={20} color={activeTab === 'market' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'market' && styles.tabTextActive]}>الأسواق</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'area' && styles.tabActive]}
          onPress={() => setActiveTab('area')}
        >
          <Ionicons name="location" size={20} color={activeTab === 'area' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'area' && styles.tabTextActive]}>المناطق</Text>
        </TouchableOpacity>
      </View>

      {/* قائمة الأماكن */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : places.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>لا توجد أماكن</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
            <Text style={styles.emptyButtonText}>إضافة مكان جديد</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.placeCard}>
              <View style={styles.placeInfo}>
                <Text style={styles.placeName}>{item.name}</Text>
                {item.address && (
                  <Text style={styles.placeAddress}>{item.address}</Text>
                )}
                {item.latitude && item.longitude && (
                  <Text style={styles.placeCoordinates}>
                    {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                  </Text>
                )}
              </View>
              <View style={styles.placeActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleEdit(item)}
                >
                  <Ionicons name="pencil" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="trash" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Modal إضافة/تعديل */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlace ? 'تعديل مكان' : 'إضافة مكان جديد'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#1a1a1a" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>النوع *</Text>
              <View style={styles.typeButtons}>
                <TouchableOpacity
                  style={[styles.typeButton, formData.type === 'mall' && styles.typeButtonActive]}
                  onPress={() => setFormData({ ...formData, type: 'mall' })}
                >
                  <Text style={[styles.typeButtonText, formData.type === 'mall' && styles.typeButtonTextActive]}>
                    مول
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, formData.type === 'market' && styles.typeButtonActive]}
                  onPress={() => setFormData({ ...formData, type: 'market' })}
                >
                  <Text style={[styles.typeButtonText, formData.type === 'market' && styles.typeButtonTextActive]}>
                    سوق
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, formData.type === 'area' && styles.typeButtonActive]}
                  onPress={() => setFormData({ ...formData, type: 'area' })}
                >
                  <Text style={[styles.typeButtonText, formData.type === 'area' && styles.typeButtonTextActive]}>
                    منطقة
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>اسم المكان *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="مثال: مول مصر"
                placeholderTextColor="#999"
                textAlign="right"
              />

              <Text style={styles.label}>العنوان</Text>
              <TextInput
                style={styles.input}
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                placeholder="مثال: مدينة نصر، القاهرة"
                placeholderTextColor="#999"
                textAlign="right"
                multiline
              />

              <Text style={styles.label}>الإحداثيات</Text>
              <View style={styles.coordinatesRow}>
                <View style={styles.coordinateInput}>
                  <Text style={styles.coordinateLabel}>خط العرض</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.latitude}
                    onChangeText={(text) => setFormData({ ...formData, latitude: text })}
                    placeholder="30.0444"
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={styles.coordinateInput}>
                  <Text style={styles.coordinateLabel}>خط الطول</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.longitude}
                    onChangeText={(text) => setFormData({ ...formData, longitude: text })}
                    placeholder="31.2357"
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.locationButton}
                onPress={handleGetCurrentLocation}
                disabled={gettingLocation}
              >
                {gettingLocation ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Ionicons name="location" size={20} color="#007AFF" />
                )}
                <Text style={styles.locationButtonText}>جلب الموقع الحالي</Text>
              </TouchableOpacity>

              <Text style={styles.label}>رقم الهاتف (اختياري)</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="01234567890"
                keyboardType="phone-pad"
                placeholderTextColor="#999"
                textAlign="right"
              />

              <Text style={styles.label}>الوصف (اختياري)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="وصف إضافي..."
                placeholderTextColor="#999"
                textAlign="right"
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>حفظ</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
  },
  addButton: {
    padding: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#e3f2fd',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  placeAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  placeCoordinates: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  placeActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 12,
  },
  actionButton: {
    padding: 8,
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    marginTop: 16,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'right',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  typeButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#e3f2fd',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#007AFF',
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordinateInput: {
    flex: 1,
  },
  coordinateLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  locationButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
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
  buttonDisabled: {
    opacity: 0.6,
  },
});

