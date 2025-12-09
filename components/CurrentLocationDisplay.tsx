import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { reverseGeocode } from '../lib/supabase';

interface CurrentLocationDisplayProps {
  onLocationUpdate?: (location: { lat: number; lon: number; address: string } | null) => void;
}

export default function CurrentLocationDisplay({ onLocationUpdate }: CurrentLocationDisplayProps) {
  const [location, setLocation] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailedAddress, setDetailedAddress] = useState<string | null>(null);

  const reverseGeocodeAddress = useCallback(async (lat: number, lon: number): Promise<string | null> => {
    try {
      const data = await reverseGeocode(lat, lon);

      if (!data || !data.address) return null;

        const address = data.address;
      const locationParts: string[] = [];
        
      // أولوية: استخدام display_name إذا كان يحتوي على معلومات أكثر تفصيلاً
      // ثم نستخدم address fields كبديل
      let useDisplayName = false;
        
      // التحقق من وجود معلومات تفصيلية في display_name
      if (data.display_name) {
        const displayParts = data.display_name.split(',').map((p: string) => p.trim());
        // إذا كان display_name يحتوي على أكثر من 3 أجزاء، نستخدمه
        if (displayParts.length > 3) {
          useDisplayName = true;
        }
      }
      
      if (useDisplayName && data.display_name) {
        // تنظيف display_name وإزالة المعلومات غير المهمة
        const cleaned = data.display_name
          .split(',')
          .map((part: string) => part.trim())
          .filter((part: string) => {
            // إزالة: مصر، الأرقام فقط، كلمات عامة
            const lower = part.toLowerCase();
            return part !== 'مصر' && 
                   part !== 'Egypt' && 
                   !/^\d+$/.test(part) &&
                   part.length > 2 &&
                   !part.includes('Governorate') &&
                   !part.includes('محافظة');
          })
          .slice(0, 4) // أول 4 أجزاء للحصول على تفاصيل أكثر
          .join('، ');
        
        if (cleaned) return cleaned;
        }
        
      // إذا لم نستخدم display_name، نستخدم address fields
      // 1. رقم المبنى (إن وجد) - للموقع الدقيق جداً
        if (address.house_number) {
        locationParts.push(`مبنى ${address.house_number}`);
        }
        
      // 2. الشارع/الطريق - الأهم للموقع الدقيق
        if (address.road) {
        locationParts.push(`شارع ${address.road}`);
        } else if (address.pedestrian) {
        locationParts.push(`ممر ${address.pedestrian}`);
        } else if (address.path) {
        locationParts.push(`طريق ${address.path}`);
      } else if (address.footway) {
        locationParts.push(`ممر ${address.footway}`);
        }
        
      // 3. الحي/المنطقة داخل المدينة - الأهم للموقع التفصيلي
        if (address.neighbourhood) {
        locationParts.push(`حي ${address.neighbourhood}`);
        } else if (address.suburb) {
        locationParts.push(`منطقة ${address.suburb}`);
      } else if (address.quarter) {
        locationParts.push(`حارة ${address.quarter}`);
      } else if (address.district) {
        locationParts.push(`قطاع ${address.district}`);
      } else if (address.city_district) {
        locationParts.push(`منطقة ${address.city_district}`);
      }
      
      // 4. المدينة
      const cityName = address.city || address.town || address.village;
      if (cityName) {
        locationParts.push(cityName);
        }
        
      // إذا وجدنا معلومات كافية، نرجعها
      if (locationParts.length > 0) {
        return locationParts.join('، ');
        }
        
      // كحل أخير، نستخدم display_name
        if (data.display_name) {
        const cleaned = data.display_name
            .split(',')
          .map((part: string) => part.trim())
          .filter((part: string) => {
            const lower = part.toLowerCase();
            return part !== 'مصر' && 
                   part !== 'Egypt' && 
                   !/^\d+$/.test(part) &&
                   part.length > 2;
          })
          .slice(0, 4)
            .join('، ');
        
        if (cleaned) return cleaned;
      }
      
      return null;
    } catch (error: any) {
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
      const address = await reverseGeocodeAddress(lat, lon);
      
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
  }, [reverseGeocodeAddress, onLocationUpdate, location]);

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
    
    // تحديث الموقع كل 30 ثانية (تقليل الاستدعاءات)
    const interval = setInterval(() => {
      updateLocation();
    }, 30000);
    
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
          <TouchableOpacity 
            style={styles.locationContainer}
            onPress={async () => {
              if (location) {
                // جلب العنوان التفصيلي عند الضغط
                const detailed = await getDetailedAddress(location.lat, location.lon);
                setDetailedAddress(detailed);
                setShowDetails(true);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.text} numberOfLines={2}>
              {location?.address || 'موقعي الحالي'}
            </Text>
            <View style={styles.actionsContainer}>
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation();
                  handleRefresh();
                }} 
                style={styles.refreshButton}
              >
              <Ionicons name="refresh" size={16} color="#007AFF" />
            </TouchableOpacity>
              <Ionicons name="chevron-down" size={16} color="#007AFF" style={styles.chevronIcon} />
          </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal للعرض التفصيلي */}
      <Modal
        visible={showDetails}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDetails(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDetails(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>موقعي الحالي</Text>
              <TouchableOpacity onPress={() => setShowDetails(false)}>
                <Ionicons name="close" size={24} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.detailRow}>
                <Ionicons name="location" size={20} color="#007AFF" />
                <Text style={styles.detailText}>
                  {detailedAddress || location?.address || 'لا توجد معلومات متاحة'}
                </Text>
              </View>
              {location && (
                <View style={styles.detailRow}>
                  <Ionicons name="navigate" size={20} color="#34C759" />
                  <Text style={styles.detailText}>
                    الإحداثيات: {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
                  </Text>
                </View>
              )}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={18} color="#666" />
                <Text style={styles.infoText}>
                  ملاحظة: العنوان قد يختلف قليلاً عن Google Maps لأننا نستخدم OpenStreetMap كمصدر للبيانات.
                </Text>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// دالة للحصول على العنوان التفصيلي
async function getDetailedAddress(lat: number, lon: number): Promise<string | null> {
  try {
    const data = await reverseGeocode(lat, lon);
    if (!data || !data.address) return null;

    const address = data.address;
    const parts: string[] = [];

    // رقم المبنى
    if (address.house_number) {
      parts.push(`مبنى رقم ${address.house_number}`);
    }

    // الشارع/الطريق
    if (address.road) {
      parts.push(`شارع ${address.road}`);
    } else if (address.pedestrian) {
      parts.push(`ممر ${address.pedestrian}`);
    } else if (address.path) {
      parts.push(`طريق ${address.path}`);
    }

    // الحي/المنطقة
    if (address.neighbourhood) {
      parts.push(`حي ${address.neighbourhood}`);
    } else if (address.suburb) {
      parts.push(`منطقة ${address.suburb}`);
    } else if (address.quarter) {
      parts.push(`حارة ${address.quarter}`);
    } else if (address.district) {
      parts.push(`قطاع ${address.district}`);
    }

    // المدينة
    if (address.city) {
      parts.push(`مدينة ${address.city}`);
    } else if (address.town) {
      parts.push(`بلدة ${address.town}`);
    } else if (address.village) {
      parts.push(`قرية ${address.village}`);
    }

    // المحافظة
    if (address.state) {
      parts.push(`محافظة ${address.state}`);
    }

    return parts.length > 0 ? parts.join('، ') : null;
  } catch (error) {
    return null;
  }
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
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chevronIcon: {
    marginLeft: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  detailText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 22,
    textAlign: 'right',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    textAlign: 'right',
  },
});

