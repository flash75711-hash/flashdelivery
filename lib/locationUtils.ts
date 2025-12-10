import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase, reverseGeocode } from './supabase';

/**
 * حساب المسافة بين نقطتين (بالمتر) باستخدام Haversine formula
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // نصف قطر الأرض بالمتر
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // المسافة بالمتر
}

/**
 * البحث عن أقرب مكان في الدليل
 */
export async function findNearestPlaceInDirectory(
  lat: number, 
  lon: number, 
  maxDistance: number = 500
): Promise<{ name: string; distance: number } | null> {
  try {
    // جلب جميع الأماكن من الدليل التي لديها إحداثيات
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, is_manual')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.error('Error fetching places from directory:', error);
      return null;
    }

    if (!places || places.length === 0) {
      return null;
    }

    // حساب المسافة لكل مكان وإيجاد الأقرب
    let nearestPlace: { name: string; distance: number } | null = null;
    let minDistance = Infinity;

    for (const place of places) {
      if (place.latitude && place.longitude) {
        const distance = calculateDistance(lat, lon, place.latitude, place.longitude);
        
        // إعطاء أولوية للأماكن اليدوية (المضافة من المدير)
        // إذا كان المكان يدوي، نزيد المسافة المسموحة قليلاً
        const effectiveMaxDistance = place.is_manual ? maxDistance * 1.5 : maxDistance;
        
        if (distance <= effectiveMaxDistance && distance < minDistance) {
          minDistance = distance;
          nearestPlace = {
            name: place.name,
            distance: Math.round(distance),
          };
        }
      }
    }

    if (nearestPlace) {
      console.log(`Found nearest place in directory: ${nearestPlace.name} (${nearestPlace.distance}m away)`);
    } else {
      console.log(`No place found in directory within ${maxDistance}m`);
    }

    return nearestPlace;
  } catch (err) {
    console.error('Error finding nearest place:', err);
    return null;
  }
}

/**
 * جلب الموقع مع تفعيل WiFi و Cellular networks لزيادة الدقة
 */
export async function getLocationWithHighAccuracy(): Promise<Location.LocationObject> {
  // تفعيل استخدام WiFi و Cellular networks لزيادة الدقة (Android فقط)
  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      console.log('Network provider (WiFi/Cellular) enabled for better accuracy');
    } catch (err) {
      console.log('Could not enable network provider (may already be enabled):', err);
    }
  }
  
  // استخدام أقصى دقة ممكنة (GPS + WiFi + Cellular + Sensors)
  return await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest, // أفضل دقة ممكنة (GPS + WiFi + Cellular)
  });
}

/**
 * تحويل الإحداثيات إلى عنوان مع البحث في الدليل أولاً
 */
export async function getAddressFromCoordinates(
  lat: number, 
  lon: number, 
  maxDistance: number = 500
): Promise<string> {
  // البحث عن أقرب مكان في الدليل قبل reverse geocoding
  const nearestPlace = await findNearestPlaceInDirectory(lat, lon, maxDistance);
  
  if (nearestPlace) {
    // إذا وُجد مكان قريب في الدليل، نستخدم اسمه
    console.log(`Using place name from directory: ${nearestPlace.name} (${nearestPlace.distance}m away)`);
    return nearestPlace.name;
  } else {
    // إذا لم يُوجد مكان قريب، نستخدم العنوان من reverse geocoding
    const data = await reverseGeocode(lat, lon);
    if (data && data.display_name) {
      console.log('Using reverse geocoded address:', data.display_name);
      return data.display_name;
    }
    return 'موقعي الحالي';
  }
}

/**
 * دالة شاملة لجلب الموقع والعنوان مع استخدام WiFi والبحث في الدليل
 */
export async function getLocationWithAddress(
  maxDistance: number = 500
): Promise<{ lat: number; lon: number; address: string; accuracy?: number } | null> {
  try {
    // طلب إذن الوصول للموقع
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('لم يتم السماح بالوصول للموقع');
    }

    // جلب الموقع مع WiFi
    const location = await getLocationWithHighAccuracy();
    
    const lat = location.coords.latitude;
    const lon = location.coords.longitude;
    const accuracy = location.coords.accuracy;

    // تسجيل الإحداثيات مع معلومات عن مصدر الموقع
    const locationSource = Platform.OS === 'web' 
      ? (accuracy && accuracy < 100 ? 'GPS/WiFi' : accuracy && accuracy < 1000 ? 'Network (WiFi/Cellular)' : 'IP-based')
      : 'GPS/WiFi/Cellular';
    
    console.log('Location Coordinates (using WiFi + GPS):', { 
      lat, 
      lon, 
      accuracy: `${accuracy?.toFixed(0)}m` || 'unknown',
      source: locationSource,
    });

    // جلب العنوان مع البحث في الدليل
    const address = await getAddressFromCoordinates(lat, lon, maxDistance);

    return {
      lat,
      lon,
      address,
      accuracy: accuracy ?? undefined,
    };
  } catch (error: any) {
    console.error('Error getting location with address:', error);
    throw error;
  }
}
