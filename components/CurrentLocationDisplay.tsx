import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

interface CurrentLocationDisplayProps {
  onLocationUpdate?: (location: { lat: number; lon: number; address: string } | null) => void;
}

export default function CurrentLocationDisplay({ onLocationUpdate }: CurrentLocationDisplayProps) {
  const [location, setLocation] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lon: number): Promise<string | null> => {
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ar&addressdetails=1`;
      
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'FlashDelivery/1.0',
        },
      });

      if (!response.ok) return null;

      const data = await response.json();

      if (data && data.address) {
        const address = data.address;
        const addressParts: string[] = [];
        
        // رقم المبنى/المنزل
        if (address.house_number) {
          addressParts.push(`مبنى رقم ${address.house_number}`);
        }
        
        // الشارع/الطريق
        if (address.road) {
          addressParts.push(`شارع ${address.road}`);
        } else if (address.pedestrian) {
          addressParts.push(`ممر ${address.pedestrian}`);
        } else if (address.path) {
          addressParts.push(`طريق ${address.path}`);
        }
        
        // الحي/المنطقة
        if (address.neighbourhood) {
          addressParts.push(`حي ${address.neighbourhood}`);
        } else if (address.suburb) {
          addressParts.push(`منطقة ${address.suburb}`);
        }
        
        // الحارة/الزقاق
        if (address.quarter) {
          addressParts.push(`حارة ${address.quarter}`);
        }
        
        // القطاع/المنطقة الإدارية
        if (address.district) {
          addressParts.push(`قطاع ${address.district}`);
        }
        
        // المدينة/البلدة/القرية
        if (address.city) {
          addressParts.push(`مدينة ${address.city}`);
        } else if (address.town) {
          addressParts.push(`بلدة ${address.town}`);
        } else if (address.village) {
          addressParts.push(`قرية ${address.village}`);
        }
        
        // المحافظة/الولاية
        if (address.state) {
          addressParts.push(`محافظة ${address.state}`);
        }
        
        // الرمز البريدي (اختياري)
        if (address.postcode) {
          addressParts.push(`(رمز بريدي: ${address.postcode})`);
        }
        
        // إذا كان هناك أجزاء، نرجعها
        if (addressParts.length > 0) {
          return addressParts.join('، ');
        }
        
        // إذا لم يكن هناك تفاصيل كافية، نستخدم display_name
        if (data.display_name) {
          return data.display_name
            .split(',')
            .filter(part => {
              const trimmed = part.trim();
              return trimmed !== 'مصر' && !/^\d+$/.test(trimmed);
            })
            .map(part => part.trim())
            .join('، ');
        }
      }
      
      return null;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }, []);

  const updateLocation = useCallback(async () => {
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const lat = currentLocation.coords.latitude;
      const lon = currentLocation.coords.longitude;
      const address = await reverseGeocode(lat, lon);
      
      const locationData = {
        lat,
        lon,
        address: address || 'موقعي الحالي',
      };
      
      setLocation(locationData);
      setLoading(false);
      setError(null);
      
      if (onLocationUpdate) {
        onLocationUpdate(locationData);
      }
    } catch (err: any) {
      console.error('Error updating location:', err);
      if (!location) {
        setError('فشل تحديث الموقع');
        setLoading(false);
      }
    }
  }, [reverseGeocode, onLocationUpdate, location]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await updateLocation();
  }, [updateLocation]);

  useEffect(() => {
    const startLocationTracking = async () => {
      try {
        // طلب إذن الوصول للموقع
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('لم يتم السماح بالوصول للموقع');
          setLoading(false);
          return;
        }

        // جلب الموقع الأولي
        await updateLocation();
      } catch (err: any) {
        console.error('Error starting location tracking:', err);
        setError('فشل جلب الموقع');
        setLoading(false);
      }
    };

    startLocationTracking();
    
    // تحديث الموقع كل 10 ثوانٍ
    const interval = setInterval(() => {
      updateLocation();
    }, 10000);
    
    return () => {
      clearInterval(interval);
    };
  }, [updateLocation]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="location" size={20} color="#007AFF" />
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />
            <Text style={styles.text}>جاري تحديد الموقع...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
              <Ionicons name="refresh" size={16} color="#007AFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.locationContainer}>
            <Text style={styles.text} numberOfLines={4}>
              {location?.address || 'موقعي الحالي'}
            </Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
              <Ionicons name="refresh" size={16} color="#007AFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e3f2fd',
    borderBottomWidth: 1,
    borderBottomColor: '#bbdefb',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  loader: {
    marginRight: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'right',
  },
  refreshButton: {
    padding: 4,
  },
});

