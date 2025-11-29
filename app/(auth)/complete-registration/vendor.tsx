import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
}

export default function CompleteVendorRegistration() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  
  const [placeName, setPlaceName] = useState('');
  const [placeNumber, setPlaceNumber] = useState('');
  const [locationSource, setLocationSource] = useState<'auto' | 'manual'>('auto');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    if (locationSource === 'auto') {
      getCurrentLocation();
    }
  }, [locationSource]);

  const getCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('خطأ', 'نحتاج إلى إذن الوصول إلى الموقع');
        setLocationSource('manual');
        return;
      }

      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
      });

      // الحصول على العنوان من الإحداثيات
      const [address] = await Location.reverseGeocodeAsync({
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
      });

      if (address) {
        const fullAddress = `${address.street || ''} ${address.name || ''} ${address.city || ''}`.trim();
        setLocation(prev => prev ? { ...prev, address: fullAddress } : null);
      }
    } catch (error: any) {
      Alert.alert('خطأ', 'فشل الحصول على الموقع. يمكنك تحديده يدوياً');
      setLocationSource('manual');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleMapSelection = () => {
    // TODO: فتح خريطة لاختيار الموقع يدوياً
    Alert.alert('قريباً', 'سيتم إضافة خريطة لاختيار الموقع يدوياً');
  };

  const handleComplete = async () => {
    if (!placeName) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المكان');
      return;
    }

    if (!location) {
      Alert.alert('خطأ', 'الرجاء تحديد موقع المكان');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('المستخدم غير موجود');
      }

      // إنشاء/تحديث بيانات مزود الخدمة
      const { error: vendorError } = await supabase
        .from('vendors')
        .upsert({
          id: user.id,
          name: placeName,
          place_number: placeNumber || null,
          latitude: location.latitude,
          longitude: location.longitude,
          location_source: locationSource,
          address: location.address || null,
        });

      if (vendorError) throw vendorError;

      Alert.alert('نجح', 'تم إكمال التسجيل بنجاح', [
        { text: 'حسناً', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل إكمال التسجيل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>إكمال التسجيل - مزود خدمة</Text>
        <Text style={styles.subtitle}>أكمل بيانات متجرك</Text>

        <TextInput
          style={styles.input}
          placeholder="اسم المكان *"
          value={placeName}
          onChangeText={setPlaceName}
          placeholderTextColor="#999"
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          placeholder="رقم المكان (اختياري)"
          value={placeNumber}
          onChangeText={setPlaceNumber}
          keyboardType="numeric"
          placeholderTextColor="#999"
          textAlign="right"
        />

        <View style={styles.locationSection}>
          <Text style={styles.sectionTitle}>موقع المكان</Text>

          <View style={styles.locationOptions}>
            <TouchableOpacity
              onPress={() => setLocationSource('auto')}
              style={[
                styles.optionButton,
                locationSource === 'auto' && styles.optionButtonActive
              ]}
            >
              <Ionicons
                name="location"
                size={24}
                color={locationSource === 'auto' ? '#007AFF' : '#999'}
              />
              <Text style={[
                styles.optionText,
                locationSource === 'auto' && styles.optionTextActive
              ]}>
                تلقائي (من GPS)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setLocationSource('manual')}
              style={[
                styles.optionButton,
                locationSource === 'manual' && styles.optionButtonActive
              ]}
            >
              <Ionicons
                name="map"
                size={24}
                color={locationSource === 'manual' ? '#007AFF' : '#999'}
              />
              <Text style={[
                styles.optionText,
                locationSource === 'manual' && styles.optionTextActive
              ]}>
                يدوي (اختر على الخريطة)
              </Text>
            </TouchableOpacity>
          </View>

          {locationSource === 'auto' && (
            <View style={styles.locationInfo}>
              {gettingLocation ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.loadingText}>جاري الحصول على الموقع...</Text>
                </View>
              ) : location ? (
                <View style={styles.locationCard}>
                  <Ionicons name="checkmark-circle" size={24} color="#34c759" />
                  <View style={styles.locationDetails}>
                    <Text style={styles.locationLabel}>الموقع:</Text>
                    <Text style={styles.locationValue}>
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </Text>
                    {location.address && (
                      <Text style={styles.locationAddress}>{location.address}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={getCurrentLocation}
                    style={styles.refreshButton}
                  >
                    <Ionicons name="refresh" size={20} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={getCurrentLocation}
                  style={styles.getLocationButton}
                >
                  <Ionicons name="location" size={24} color="#007AFF" />
                  <Text style={styles.getLocationText}>الحصول على الموقع الحالي</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {locationSource === 'manual' && (
            <TouchableOpacity
              onPress={handleMapSelection}
              style={styles.mapButton}
            >
              <Ionicons name="map" size={24} color="#007AFF" />
              <Text style={styles.mapButtonText}>اختر الموقع على الخريطة</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>إكمال التسجيل</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  locationSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  locationOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  optionButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#e3f2fd',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#007AFF',
  },
  locationInfo: {
    marginTop: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
  loadingText: {
    color: '#007AFF',
    fontSize: 14,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  locationDetails: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  locationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 12,
    color: '#666',
  },
  refreshButton: {
    padding: 8,
  },
  getLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  getLocationText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
  },
  mapButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

