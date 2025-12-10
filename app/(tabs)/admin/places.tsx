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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { getLocationWithAddress } from '@/lib/locationUtils';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

// استيراد react-native-maps فقط على الموبايل
let MapView: any = null;
let Marker: any = null;

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
  } catch (e) {
    console.warn('react-native-maps not available:', e);
  }
}

interface Place {
  id: string;
  name: string;
  address: string;
  type: 'mall' | 'market' | 'area';
  latitude?: number;
  longitude?: number;
  phone?: string;
  description?: string;
  is_manual?: boolean;
}

export default function AdminPlacesScreen() {
  const router = useRouter();
  const { user } = useAuth();
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
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapLocation, setMapLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    loadPlaces();
  }, [activeTab]);

  // استقبال الرسائل من iframe الخريطة (على الويب)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'MAP_CLICK') {
          const { lat, lon } = event.data;
          handleMapPress({ nativeEvent: { coordinate: { latitude: lat, longitude: lon } } });
        }
      };
      
      window.addEventListener('message', handleMessage);
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    }
  }, []);

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
      // استخدام الدالة المشتركة التي تستخدم WiFi والبحث في الدليل
      const locationData = await getLocationWithAddress(500);

      if (!locationData) {
        throw new Error('فشل جلب الموقع');
      }

      const { lat, lon, address } = locationData;

      setFormData({
        ...formData,
        latitude: lat.toString(),
        longitude: lon.toString(),
        address: address,
      });
    } catch (error: any) {
      console.error('Error getting location:', error);
      Alert.alert('خطأ', error.message || 'فشل جلب الموقع');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleOpenMap = async () => {
    try {
      // جلب الموقع الحالي للخريطة
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('تنبيه', 'يجب السماح بالوصول للموقع لاستخدام الخريطة');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = location.coords.latitude;
      const lon = location.coords.longitude;

      // إذا كان هناك إحداثيات موجودة في النموذج، نستخدمها
      if (formData.latitude && formData.longitude) {
        setMapLocation({
          lat: parseFloat(formData.latitude),
          lon: parseFloat(formData.longitude),
        });
      } else {
        // وإلا نستخدم الموقع الحالي
        setMapLocation({ lat, lon });
      }

      setUserLocation({ lat, lon });
      setShowMapModal(true);
    } catch (error) {
      console.error('Error opening map:', error);
      Alert.alert('خطأ', 'فشل فتح الخريطة');
    }
  };

  const handleMapPress = async (event: any) => {
    let lat: number, lon: number;
    
    // على الموبايل، الإحداثيات في event.nativeEvent.coordinate
    // على الويب، تأتي من postMessage من iframe
    const coordinate = event.nativeEvent?.coordinate || event.nativeEvent;
    if (!coordinate || !coordinate.latitude || !coordinate.longitude) {
      return;
    }
    lat = typeof coordinate.latitude === 'number' ? coordinate.latitude : parseFloat(coordinate.latitude);
    lon = typeof coordinate.longitude === 'number' ? coordinate.longitude : parseFloat(coordinate.longitude);
    
    setMapLocation({ lat, lon });
    
    // تحديث النموذج بالإحداثيات
    setFormData(prev => ({
      ...prev,
      latitude: lat.toString(),
      longitude: lon.toString(),
    }));

    // جلب العنوان من الإحداثيات
    try {
      const data = await reverseGeocode(lat, lon);
      if (data && data.display_name) {
        setFormData(prev => ({
          ...prev,
          latitude: lat.toString(),
          longitude: lon.toString(),
          address: data.display_name,
        }));
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
  };

  const handleConfirmMapLocation = () => {
    if (mapLocation) {
      setFormData({
        ...formData,
        latitude: mapLocation.lat.toString(),
        longitude: mapLocation.lon.toString(),
      });
      setShowMapModal(false);
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
    // على الويب، نستخدم window.confirm
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(`هل أنت متأكد من حذف "${place.name}"؟`);
      if (confirmed) {
        performDelete(place);
      }
      return;
    }
    
    // على الموبايل، نستخدم Alert.alert
    Alert.alert(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف "${place.name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => performDelete(place),
        },
      ]
    );
  };

  const performDelete = async (place: Place) => {
    try {
      console.log('Deleting place:', place.id, place.name);
      
      // التحقق من الجلسة أولاً
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('يجب تسجيل الدخول أولاً');
      }
      
      console.log('Session exists, user:', session.user.id);
      
      // التحقق من أن المستخدم هو admin
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      
      console.log('Profile check:', { profile, profileError });
      
      if (profileError) {
        console.error('Error checking profile:', profileError);
        throw new Error('فشل التحقق من الصلاحيات');
      }
      
      if (!profile || profile.role !== 'admin') {
        console.error('User is not admin. Role:', profile?.role);
        throw new Error('ليس لديك صلاحية للحذف. يجب أن تكون مسؤولاً');
      }
      
      console.log('User is admin, proceeding with delete...');
      
      // التحقق الإضافي من useAuth
      if (!user || user.role !== 'admin') {
        console.error('User from useAuth is not admin. Role:', user?.role);
        throw new Error('ليس لديك صلاحية للحذف. يجب أن تكون مسؤولاً');
      }
      
      // محاولة الحذف
      const { data, error } = await supabase
        .from('places')
        .delete()
        .eq('id', place.id)
        .select();

      console.log('Delete result:', { data, error });

      if (error) {
        console.error('Delete error:', error);
        // عرض رسالة خطأ أوضح
        let errorMessage = 'فشل حذف المكان';
        if (error.code === '42501') {
          errorMessage = 'ليس لديك صلاحية للحذف. تأكد من أنك مسؤول';
        } else if (error.message) {
          errorMessage = error.message;
        }
        throw new Error(errorMessage);
      }
      
      if (!data || data.length === 0) {
        throw new Error('لم يتم العثور على المكان للحذف');
      }
      
      // عرض رسالة نجاح
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('تم حذف المكان بنجاح');
      } else {
        Alert.alert('نجح', 'تم حذف المكان بنجاح');
      }
      
      loadPlaces();
    } catch (error: any) {
      console.error('Error deleting place:', error);
      const errorMessage = error.message || error.code || 'فشل حذف المكان';
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`خطأ: ${errorMessage}`);
      } else {
        Alert.alert('خطأ', errorMessage);
      }
    }
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
            <View style={[styles.placeCard, item.is_manual && styles.placeCardManual]}>
              <View style={styles.placeInfo}>
                <View style={styles.placeNameRow}>
                  <Text style={styles.placeName}>{item.name}</Text>
                  {item.is_manual && (
                    <View style={styles.manualBadge}>
                      <Ionicons name="star" size={14} color="#FFA500" />
                    </View>
                  )}
                </View>
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

              <View style={styles.locationButtonsRow}>
                <TouchableOpacity
                  style={[styles.locationButton, styles.locationButtonHalf]}
                  onPress={handleGetCurrentLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Ionicons name="location" size={20} color="#007AFF" />
                  )}
                  <Text style={styles.locationButtonText}>الموقع الحالي</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.locationButton, styles.locationButtonHalf, styles.mapButton]}
                  onPress={handleOpenMap}
                >
                  <Ionicons name="map" size={20} color="#007AFF" />
                  <Text style={styles.locationButtonText}>اختيار من الخريطة</Text>
                </TouchableOpacity>
              </View>

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

      {/* Modal الخريطة */}
      <Modal
        visible={showMapModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMapModal(false)}
      >
        <View style={styles.mapModalOverlay}>
          <View style={styles.mapModalContent}>
            <View style={styles.mapModalHeader}>
              <Text style={styles.mapModalTitle}>اختر الموقع من الخريطة</Text>
              <TouchableOpacity onPress={() => setShowMapModal(false)}>
                <Ionicons name="close" size={24} color="#1a1a1a" />
              </TouchableOpacity>
            </View>

            <View style={styles.mapContainer}>
              {Platform.OS === 'web' ? (
                // على الويب، نستخدم Leaflet في iframe للتفاعل
                <View style={styles.mapWebView}>
                  {mapLocation && (
                    <iframe
                      // @ts-ignore - srcdoc is valid HTML attribute
                      srcdoc={`
                        <!DOCTYPE html>
                        <html>
                        <head>
                          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                          <style>
                            body { margin: 0; padding: 0; overflow: hidden; }
                            #map { width: 100vw; height: 100vh; }
                          </style>
                        </head>
                        <body>
                          <div id="map"></div>
                          <script>
                            const map = L.map('map').setView([${mapLocation.lat}, ${mapLocation.lon}], 15);
                            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                              attribution: '© OpenStreetMap contributors',
                              maxZoom: 19
                            }).addTo(map);
                            
                            let marker = L.marker([${mapLocation.lat}, ${mapLocation.lon}], {draggable: true}).addTo(map);
                            
                            map.on('click', function(e) {
                              const lat = e.latlng.lat;
                              const lon = e.latlng.lng;
                              marker.setLatLng([lat, lon]);
                              if (window.parent) {
                                window.parent.postMessage({
                                  type: 'MAP_CLICK',
                                  lat: lat,
                                  lon: lon
                                }, '*');
                              }
                            });
                            
                            marker.on('dragend', function(e) {
                              const lat = e.target.getLatLng().lat;
                              const lon = e.target.getLatLng().lng;
                              if (window.parent) {
                                window.parent.postMessage({
                                  type: 'MAP_CLICK',
                                  lat: lat,
                                  lon: lon
                                }, '*');
                              }
                            });
                          </script>
                        </body>
                        </html>
                      `}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                      }}
                      title="Map"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                  )}
                </View>
              ) : Platform.OS === 'ios' || Platform.OS === 'android' ? (
                // على الموبايل، نستخدم react-native-maps
                MapView && mapLocation ? (
                  <MapView
                    style={styles.mapNative}
                    initialRegion={{
                      latitude: mapLocation.lat,
                      longitude: mapLocation.lon,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    onPress={handleMapPress}
                    showsUserLocation={!!userLocation}
                    showsMyLocationButton={true}
                  >
                    {mapLocation && (
                      <Marker
                        coordinate={{
                          latitude: mapLocation.lat,
                          longitude: mapLocation.lon,
                        }}
                        title="الموقع المحدد"
                        draggable
                        onDragEnd={handleMapPress}
                      />
                    )}
                    {userLocation && (
                      <Marker
                        coordinate={{
                          latitude: userLocation.lat,
                          longitude: userLocation.lon,
                        }}
                        title="موقعك الحالي"
                        pinColor="blue"
                      />
                    )}
                  </MapView>
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.mapPlaceholderText}>جارٍ تحميل الخريطة...</Text>
                  </View>
                )
              ) : (
                <View style={styles.mapPlaceholder}>
                  <Ionicons name="map-outline" size={64} color="#ccc" />
                  <Text style={styles.mapPlaceholderText}>الخريطة غير متاحة على هذه المنصة</Text>
                </View>
              )}
            </View>

            {mapLocation && (
              <View style={styles.mapCoordinatesDisplay}>
                <Text style={styles.mapCoordinatesText}>
                  خط العرض: {mapLocation.lat.toFixed(6)}
                </Text>
                <Text style={styles.mapCoordinatesText}>
                  خط الطول: {mapLocation.lon.toFixed(6)}
                </Text>
              </View>
            )}

            <View style={styles.mapModalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowMapModal(false)}
              >
                <Text style={styles.cancelButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleConfirmMapLocation}
                disabled={!mapLocation}
              >
                <Text style={styles.saveButtonText}>تأكيد الموقع</Text>
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
  placeCardManual: {
    backgroundColor: '#FFF9E6',
    borderColor: '#FFE082',
    borderWidth: 1.5,
  },
  placeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
    gap: 8,
  },
  manualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 24,
    minHeight: 24,
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
  locationButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  locationButtonHalf: {
    flex: 1,
  },
  mapButton: {
    backgroundColor: '#e8f5e9',
  },
  locationButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  mapModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
  },
  mapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  mapModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  mapWebView: {
    flex: 1,
    width: '100%',
    position: 'relative' as any,
  },
  webMapInstructions: {
    position: 'absolute' as any,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  webMapInstructionsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center' as any,
    marginBottom: 12,
  },
  webMapLinkButton: {
    flexDirection: 'row' as any,
    alignItems: 'center' as any,
    justifyContent: 'center' as any,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  webMapLinkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapNative: {
    flex: 1,
    width: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  mapPlaceholderText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  mapCoordinatesDisplay: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  mapCoordinatesText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  mapModalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
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

