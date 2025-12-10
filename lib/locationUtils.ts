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
  // تفعيل استخدام WiFi و Cellular networks لزيادة الدقة
  // على Android: نستخدم enableNetworkProviderAsync() لتفعيل WiFi/Cellular صراحة
  // على iOS: Location.Accuracy.Highest يستخدم GPS + WiFi + Cellular تلقائياً
  // على الويب: Location.Accuracy.Highest يترجم إلى enableHighAccuracy: true في Geolocation API
  //   والذي يستخدم GPS + WiFi تلقائياً إذا كان المتصفح يدعمه
  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      console.log('✅ Network provider (WiFi/Cellular) enabled for better accuracy on Android');
    } catch (err) {
      console.log('⚠️ Could not enable network provider (may already be enabled):', err);
    }
  } else if (Platform.OS === 'web') {
    // على الويب، Location.Accuracy.Highest يترجم إلى enableHighAccuracy: true في Geolocation API
    // هذا يطلب من المتصفح استخدام GPS + WiFi تلقائياً
    // ملاحظة: على الويب، WiFi positioning يعمل تلقائياً مع enableHighAccuracy: true
    console.log('✅ Using Highest accuracy on web - Geolocation API will use GPS + WiFi automatically');
  } else if (Platform.OS === 'ios') {
    // على iOS، Location.Accuracy.Highest يستخدم GPS + WiFi + Cellular تلقائياً
    console.log('✅ Using Highest accuracy on iOS (GPS + WiFi + Cellular enabled automatically)');
  }
  
  // استخدام أقصى دقة ممكنة (GPS + WiFi + Cellular + Sensors)
  // على جميع المنصات، هذا يطلب أفضل دقة متاحة
  // Location.Accuracy.Highest يستخدم:
  // - Android: GPS + WiFi + Cellular (بعد enableNetworkProviderAsync)
  // - iOS: GPS + WiFi + Cellular (تلقائياً)
  // - Web: GPS + WiFi (عبر Geolocation API مع enableHighAccuracy: true)
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest, // أفضل دقة ممكنة (GPS + WiFi + Cellular)
  });
  
  // تسجيل معلومات عن الدقة لتأكيد استخدام WiFi
  const accuracy = location.coords.accuracy;
  if (Platform.OS === 'web') {
    // على الويب، الدقة الجيدة (< 100m) تعني استخدام GPS/WiFi
    // الدقة المتوسطة (100-1000m) تعني استخدام Network (WiFi/Cellular)
    // الدقة السيئة (> 1000m) تعني استخدام IP-based فقط
    if (accuracy && accuracy < 100) {
      console.log('✅ High accuracy detected on web - GPS + WiFi is being used');
    } else if (accuracy && accuracy < 1000) {
      console.log('⚠️ Medium accuracy on web - Network (WiFi/Cellular) positioning');
    } else {
      console.log('❌ Low accuracy on web - IP-based geolocation only (WiFi/GPS not available)');
    }
  }
  
  return location;
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
    // Location.Accuracy.Highest يستخدم:
    // - على Android: GPS + WiFi + Cellular (بعد enableNetworkProviderAsync)
    // - على iOS: GPS + WiFi + Cellular (تلقائياً)
    // - على الويب: GPS + WiFi (عبر Geolocation API مع enableHighAccuracy: true)
    const locationSource = Platform.OS === 'web' 
      ? (accuracy && accuracy < 100 ? 'GPS/WiFi (High Accuracy)' : accuracy && accuracy < 1000 ? 'Network (WiFi/Cellular)' : 'IP-based (Low Accuracy)')
      : Platform.OS === 'android'
      ? 'GPS/WiFi/Cellular (Network Provider Enabled)'
      : 'GPS/WiFi/Cellular (iOS High Accuracy)';
    
    console.log('Location Coordinates (using WiFi + GPS):', { 
      lat, 
      lon, 
      accuracy: `${accuracy?.toFixed(0)}m` || 'unknown',
      source: locationSource,
      platform: Platform.OS,
      note: Platform.OS === 'web' 
        ? 'Web uses Geolocation API with enableHighAccuracy: true (GPS + WiFi)'
        : Platform.OS === 'android'
        ? 'Android uses GPS + WiFi + Cellular (Network Provider enabled)'
        : 'iOS uses GPS + WiFi + Cellular (Highest accuracy)',
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
