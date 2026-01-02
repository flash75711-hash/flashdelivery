import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { reverseGeocode, supabase } from '../lib/supabase';
import { findNearestPlaceInDirectory, getLocationWithHighAccuracy, getAddressFromCoordinates } from '../lib/webLocationUtils';

interface CurrentLocationDisplayProps {
  onLocationUpdate?: (location: { lat: number; lon: number; address: string } | null) => void;
  onOpenPlacesDirectory?: () => void; // دالة اختيارية لفتح دليل الأماكن
  externalLocation?: { lat: number; lon: number; address: string } | null; // موقع خارجي لتحديث العرض
  onManualRefresh?: () => void; // دالة يتم استدعاؤها عند التحديث اليدوي
}

export default function CurrentLocationDisplay({ onLocationUpdate, onOpenPlacesDirectory, externalLocation, onManualRefresh }: CurrentLocationDisplayProps) {
  const router = useRouter();
  const [location, setLocation] = useState<{ lat: number; lon: number; address: string; accuracy?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailedAddress, setDetailedAddress] = useState<string | null>(null);
  // استخدام ref لتتبع externalLocation الحالي في setInterval
  const externalLocationRef = useRef(externalLocation);
  // استخدام ref لتتبع location الحالي في setInterval
  const locationRef = useRef(location);
  // استخدام ref لتتبع updateLocation لتجنب إعادة إنشاء setInterval
  const updateLocationRef = useRef<(() => Promise<void>) | null>(null);
  // استخدام ref لتتبع onLocationUpdate لتجنب dependency
  const onLocationUpdateRef = useRef(onLocationUpdate);
  // استخدام ref لتتبع onManualRefresh
  const onManualRefreshRef = useRef(onManualRefresh);
  // استخدام ref لتتبع ما إذا كان updateLocation قيد التنفيذ حالياً
  const isUpdatingLocationRef = useRef(false);

  // تحديث refs عند تغيير externalLocation أو location
  useEffect(() => {
    externalLocationRef.current = externalLocation;
    // console.log('externalLocationRef updated:', externalLocation); // تعطيل لتقليل الضوضاء
  }, [externalLocation]);

  useEffect(() => {
    locationRef.current = location;
    // console.log('locationRef updated:', location); // تعطيل لتقليل الضوضاء
  }, [location]);

  useEffect(() => {
    onLocationUpdateRef.current = onLocationUpdate;
  }, [onLocationUpdate]);

  useEffect(() => {
    onManualRefreshRef.current = onManualRefresh;
  }, [onManualRefresh]);


  // تحديث الموقع عند تغيير externalLocation
  useEffect(() => {
    if (externalLocation) {
      // التحقق من أن الموقع مختلف عن الموقع الحالي لتجنب التحديثات غير الضرورية
      // نستخدم locationRef للتحقق من القيمة الحالية بدلاً من location في dependency
      const currentLocation = locationRef.current;
      if (!currentLocation || 
          currentLocation.lat !== externalLocation.lat || 
          currentLocation.lon !== externalLocation.lon ||
          currentLocation.address !== externalLocation.address) {
        console.log('Updating location from external source (manual selection):', externalLocation);
        // عند تحديث الموقع من مصدر خارجي (اختيار يدوي)، نضيف accuracy: 0
        // للإشارة إلى أن هذا موقع محدد يدوياً وليس GPS
        setLocation({ ...externalLocation, accuracy: 0 });
        setLoading(false);
        setError(null);
      }
    }
  }, [externalLocation]); // إزالة location من dependency array لتجنب الحلقة اللانهائية

  const reverseGeocodeAddress = useCallback(async (lat: number, lon: number): Promise<string | null> => {
    try {
      console.log('Calling reverseGeocode for:', { lat, lon });
      const data = await reverseGeocode(lat, lon);

      if (!data || !data.address) {
        console.log('No address data returned from reverseGeocode');
        return null;
      }

      console.log('Reverse geocode response:', {
        display_name: data.display_name,
        address: data.address,
        city: data.address.city || data.address.town || data.address.village,
        state: data.address.state,
      });

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
    console.log('🔄 updateLocation called');
    
    // حماية من الاستدعاءات المتعددة المتزامنة
    if (isUpdatingLocationRef.current) {
      console.log('⏭️ Skipping updateLocation - already in progress');
      return;
    }
    
    // إذا كان هناك externalLocation نشط، لا نحدث الموقع تلقائياً
    // لأن externalLocation يعني أن المستخدم اختار موقعاً محدداً
    // نستخدم ref للتحقق من القيمة الحالية
    if (externalLocationRef.current) {
      console.log('⏭️ Skipping auto-update because externalLocation is set:', externalLocationRef.current);
      return;
    }
    
    // إذا كان الموقع الحالي محدد يدوياً (accuracy === 0)، لا نستبدله
    // لأن هذا يعني أن المستخدم اختار موقعاً محدداً من الدليل
    // نستخدم ref للتحقق من القيمة الحالية
    const currentLocation = locationRef.current;
    if (currentLocation && currentLocation.accuracy === 0) {
      console.log('⏭️ Skipping auto-update because location was manually selected (accuracy === 0)');
      return;
    }
    
    // تعيين flag لمنع الاستدعاءات المتعددة
    isUpdatingLocationRef.current = true;
    
    try {
      console.log('📍 Fetching location with high accuracy...');
      // استخدام الدالة المشتركة لجلب الموقع مع WiFi
      const currentLocation = await getLocationWithHighAccuracy();
      
      const lat = currentLocation.latitude;
      const lon = currentLocation.longitude;
      const accuracy = currentLocation.accuracy; // دقة الموقع بالمتر
      
      console.log('✅ Location fetched:', { lat, lon, accuracy });
      
      // تسجيل الإحداثيات الفعلية مع معلومات عن مصدر الموقع
      const locationSource = accuracy && accuracy < 100 
        ? 'GPS/WiFi' 
        : accuracy && accuracy < 1000 
        ? 'Network (WiFi/Cellular)' 
        : 'IP-based';
      
      console.log('Location Coordinates (using Web Geolocation API):', { 
        lat, 
        lon, 
        accuracy: `${accuracy?.toFixed(0)}m` || 'unknown',
        source: locationSource,
        altitude: currentLocation.altitude,
        heading: currentLocation.heading,
        speed: currentLocation.speed,
      });
      
      // التحقق من دقة الموقع - إذا كانت الدقة سيئة جداً (أكثر من 5000 متر = 5 كم)
      if (accuracy && accuracy > 5000) {
        console.warn('⚠️ GPS accuracy is very poor (IP-based geolocation):', accuracy, 'meters. Skipping auto-update to preserve manual selection.');
        if (location) {
          console.log('Keeping existing location instead of updating with inaccurate GPS data');
          return;
        }
        console.warn('No existing location, using inaccurate GPS data as fallback');
      } else if (accuracy && accuracy > 1000) {
        console.warn('⚠️ GPS accuracy is poor:', accuracy, 'meters. Location may be inaccurate.');
      }
      
      console.log('🔍 Getting address from coordinates...');
      // استخدام الدالة المشتركة للحصول على العنوان مع البحث في الدليل
      // زيادة المسافة للبحث عن الأماكن اليدوية (مهمة في المدن)
      // إضافة timeout إضافي كحماية (15 ثانية)
      const addressPromise = getAddressFromCoordinates(lat, lon, 1000);
      const addressTimeoutPromise = new Promise<string>((resolve) => 
        setTimeout(() => {
          console.warn('⚠️ Address retrieval timeout after 15 seconds, using default');
          resolve('موقعي الحالي');
        }, 15000)
      );
      
      const address = await Promise.race([addressPromise, addressTimeoutPromise]);
      console.log('✅ Address retrieved:', address);
      
      const locationData = {
        lat,
        lon,
        address: address || 'موقعي الحالي',
        accuracy: accuracy ?? undefined, // حفظ دقة GPS (تحويل null إلى undefined)
      };
      
      console.log('💾 Setting location state:', locationData);
      setLocation(locationData);
      setLoading(false);
      setError(null);
      console.log('✅ Location state updated successfully');
      
      // لا نحدث onLocationUpdate إذا كان هناك externalLocation نشط
      // لأن هذا سيستبدل الموقع المحدد يدوياً
      if (onLocationUpdateRef.current && !externalLocationRef.current) {
        // إزالة accuracy قبل إرساله لأن الواجهة لا تتوقعها
        const { accuracy: _, ...locationWithoutAccuracy } = locationData;
        console.log('📤 Calling onLocationUpdate:', locationWithoutAccuracy);
        onLocationUpdateRef.current(locationWithoutAccuracy);
      } else {
        console.log('⏭️ Skipping onLocationUpdate - externalLocationRef.current =', externalLocationRef.current);
      }
    } catch (err: any) {
      console.error('❌ Error updating location:', err);
      if (!location) {
        setError('فشل تحديث الموقع');
        setLoading(false);
      }
    } finally {
      // إعادة تعيين flag بعد انتهاء العملية
      isUpdatingLocationRef.current = false;
      console.log('✅ updateLocation completed');
    }
  }, []); // إزالة جميع dependencies لتجنب إعادة إنشاء الدالة

  // تحديث ref لـ updateLocation بعد تعريفه
  useEffect(() => {
    updateLocationRef.current = updateLocation;
  }, [updateLocation]);

  const handleRefresh = useCallback(async () => {
    // عند الضغط على زر التحديث يدوياً، نسمح بالتحديث حتى لو كان هناك externalLocation
    // لأن المستخدم يريد تحديث الموقع بنفسه
    setLoading(true);
    setError(null);
    
    // إعلام الـ parent أن المستخدم قام بتحديث الموقع يدوياً
    if (onManualRefreshRef.current) {
      onManualRefreshRef.current();
    }
    
    try {
      // استخدام الدالة المشتركة لجلب الموقع مع WiFi
      const currentLocation = await getLocationWithHighAccuracy();
      
      const lat = currentLocation.latitude;
      const lon = currentLocation.longitude;
      const accuracy = currentLocation.accuracy;
      
      console.log('Manual refresh GPS Coordinates:', { 
        lat, 
        lon, 
        accuracy: `${accuracy?.toFixed(0)}m` || 'unknown',
      });
      
      // التحقق من دقة الموقع
      if (accuracy && accuracy > 1000) {
        console.warn('GPS accuracy is poor during manual refresh:', accuracy, 'meters');
      }
      
      // استخدام الدالة المشتركة للحصول على العنوان مع البحث في الدليل
      const address = await getAddressFromCoordinates(lat, lon, 500);
      
      const locationData = {
        lat,
        lon,
        address: address || 'موقعي الحالي',
        accuracy: accuracy ?? undefined, // حفظ دقة GPS (تحويل null إلى undefined)
      };
      
      setLocation(locationData);
      setLoading(false);
      setError(null);
      
      if (onLocationUpdateRef.current) {
        // إزالة accuracy قبل إرساله لأن الواجهة لا تتوقعها
        const { accuracy: _, ...locationWithoutAccuracy } = locationData;
        onLocationUpdateRef.current(locationWithoutAccuracy);
      }
    } catch (err: any) {
      console.error('Error refreshing location:', err);
      setError('فشل تحديث الموقع');
      setLoading(false);
    }
  }, []); // إزالة جميع dependencies لتجنب إعادة إنشاء الدالة

  useEffect(() => {
    let mounted = true; // flag لتجنب تحديث state بعد unmount
    
    const startLocationTracking = async () => {
      try {
        console.log('🔄 Starting location tracking...');
        // طلب إذن الوصول للموقع (Web API) - محسّن للتحقق من الإذن أولاً
        const { requestLocationPermission } = await import('../lib/webUtils');
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
          console.error('❌ Location permission denied');
          if (mounted) {
            setError('لم يتم السماح بالوصول للموقع');
            setLoading(false);
          }
          return;
        }

        console.log('✅ Location permission granted');

        // جلب الموقع الأولي فقط إذا لم يكن هناك externalLocation
        // إذا كان هناك externalLocation، نستخدمه مباشرة ولا نطلب GPS
        // نستخدم ref للتحقق من القيمة الحالية
        if (!externalLocationRef.current) {
          console.log('📍 No external location, fetching GPS location...');
          // استخدام updateLocationRef بدلاً من updateLocation مباشرة
          if (mounted && updateLocationRef.current) {
            await updateLocationRef.current();
          }
        } else {
          // إذا كان هناك externalLocation، نستخدمه مباشرة
          console.log('📍 Using externalLocation on mount:', externalLocationRef.current);
          if (mounted) {
            setLocation({ ...externalLocationRef.current, accuracy: 0 });
            setLoading(false);
            setError(null);
          }
        }
      } catch (err: any) {
        console.error('❌ Error starting location tracking:', err);
        if (mounted) {
          setError('فشل جلب الموقع');
          setLoading(false);
        }
      }
    };

    startLocationTracking();
    
    // تحديث الموقع كل 120 ثانية (دقيقتين) فقط إذا لم يكن هناك externalLocation
    // (لأن externalLocation يعني أن الموقع يتم تحديثه من الخارج)
    // نستخدم ref للتحقق من externalLocation الحالي في كل مرة
    const interval = setInterval(() => {
      // التحقق من externalLocation الحالي باستخدام ref
      if (mounted && !externalLocationRef.current && updateLocationRef.current) {
        // استدعاء updateLocation الذي يتحقق من accuracy === 0 داخلياً
        // نستخدم ref لتجنب dependency على updateLocation
        updateLocationRef.current();
      }
    }, 120000); // 120 ثانية (دقيقتين) لتقليل الطلبات
    
    return () => {
      mounted = false; // منع تحديث state بعد unmount
      clearInterval(interval);
    };
  }, []); // إزالة updateLocation من dependency array لتجنب إعادة التشغيل المزدوج

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
              // إذا كانت هناك دالة لفتح دليل الأماكن، نستخدمها
              if (onOpenPlacesDirectory) {
                onOpenPlacesDirectory();
                return;
              }
              
              // وإلا نعرض التفاصيل كما كان
              if (location) {
                // جلب العنوان التفصيلي عند الضغط
                const detailed = await getDetailedAddress(location.lat, location.lon);
                setDetailedAddress(detailed);
                setShowDetails(true);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.textContainer}>
            <Text style={styles.text} numberOfLines={2}>
              {location?.address || 'موقعي الحالي'}
            </Text>
              {location && (
                <Text style={styles.accuracyHint} numberOfLines={1}>
                  {location.accuracy && location.accuracy > 500 ? '⚠️ قد يكون الموقع غير دقيق' : ''}
                </Text>
              )}
            </View>
            <View style={styles.actionsContainer}>
              {onOpenPlacesDirectory && (
                <Ionicons name="list" size={16} color="#007AFF" style={styles.directoryIcon} />
              )}
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation();
                  handleRefresh();
                }} 
                style={styles.refreshButton}
              >
              <Ionicons name="refresh" size={16} color="#007AFF" />
            </TouchableOpacity>
              <Ionicons name={onOpenPlacesDirectory ? "chevron-forward" : "chevron-down"} size={16} color="#007AFF" style={styles.chevronIcon} />
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
  directoryIcon: {
    marginLeft: 4,
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
  textContainer: {
    flex: 1,
  },
  text: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 20,
  },
  accuracyHint: {
    fontSize: 10,
    color: '#FF9500',
    textAlign: 'right',
    marginTop: 2,
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

