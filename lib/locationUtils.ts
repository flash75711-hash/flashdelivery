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
 * البحث عن أقرب مكان في الدليل مع إعطاء أولوية للأماكن اليدوية
 */
// Cache للأماكن لتجنب الاستعلامات المتكررة
let placesCache: Array<{ id: string; name: string; latitude: number; longitude: number; is_manual: boolean }> | null = null;
let placesCacheTimestamp: number = 0;
const PLACES_CACHE_DURATION = 5 * 60 * 1000; // 5 دقائق

export async function findNearestPlaceInDirectory(
  lat: number, 
  lon: number, 
  maxDistance: number = 1000 // زيادة المسافة المسموحة للبحث عن الأماكن اليدوية
): Promise<{ name: string; distance: number } | null> {
  try {
    console.log(`🔍 findNearestPlaceInDirectory: Starting search for lat=${lat}, lon=${lon}, maxDistance=${maxDistance}`);
    
    // استخدام cache إذا كان موجوداً وحديثاً
    const now = Date.now();
    let places = placesCache;
    
    if (!places || (now - placesCacheTimestamp) > PLACES_CACHE_DURATION) {
      console.log('📦 Cache miss or expired, fetching places from database...');
      // جلب جميع الأماكن من الدليل التي لديها إحداثيات
      const { data: fetchedPlaces, error } = await supabase
        .from('places')
        .select('id, name, latitude, longitude, is_manual')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error) {
        console.error('❌ Error fetching places from directory:', error);
        // استخدام cache القديم إذا كان موجوداً
        if (placesCache) {
          console.log('⚠️ Using stale cache due to error');
          places = placesCache;
        } else {
          return null;
        }
      } else {
        places = fetchedPlaces || [];
        console.log(`✅ Fetched ${places.length} places from database`);
        // تحديث cache
        placesCache = places;
        placesCacheTimestamp = now;
      }
    } else {
      console.log(`✅ Using cached places (${places.length} places, ${Math.round((now - placesCacheTimestamp) / 1000)}s old)`);
    }

    if (!places || places.length === 0) {
      return null;
    }

    // حساب المسافة لكل مكان وإيجاد الأقرب
    // إعطاء أولوية للأماكن اليدوية (المضافة من المدير)
    let nearestManualPlace: { name: string; distance: number } | null = null;
    let nearestAutoPlace: { name: string; distance: number } | null = null;
    let minManualDistance = Infinity;
    let minAutoDistance = Infinity;

    for (const place of places) {
      if (place.latitude && place.longitude) {
        const distance = calculateDistance(lat, lon, place.latitude, place.longitude);
        
        // للأماكن اليدوية: نزيد المسافة المسموحة (مهمة جداً في المدن)
        // للأماكن التلقائية: نستخدم المسافة العادية
        const effectiveMaxDistance = place.is_manual ? maxDistance * 2 : maxDistance;
        
        if (distance <= effectiveMaxDistance) {
          if (place.is_manual && distance < minManualDistance) {
            minManualDistance = distance;
            nearestManualPlace = {
              name: place.name,
              distance: Math.round(distance),
            };
          } else if (!place.is_manual && distance < minAutoDistance) {
            minAutoDistance = distance;
            nearestAutoPlace = {
              name: place.name,
              distance: Math.round(distance),
            };
          }
        }
      }
    }
    
    // إعطاء أولوية للأماكن اليدوية حتى لو كانت أبعد قليلاً
    // (لأنها قد تكون أكثر دقة في المدن)
    const nearestPlace = nearestManualPlace || nearestAutoPlace;
    const minDistance = nearestManualPlace ? minManualDistance : minAutoDistance;

    if (nearestPlace) {
      console.log(`✅ Found nearest place in directory: ${nearestPlace.name} (${nearestPlace.distance}m away)`);
    } else {
      console.log(`ℹ️ No place found in directory within ${maxDistance}m`);
    }

    return nearestPlace;
  } catch (err) {
    console.error('Error finding nearest place:', err);
    // استخدام cache القديم إذا كان موجوداً
    if (placesCache) {
      console.log('⚠️ Using cached places due to error');
    }
    return null;
  }
}

/**
 * جلب الموقع مع تفعيل WiFi و Cellular networks لزيادة الدقة
 * مع آلية إعادة المحاولة للحصول على أفضل دقة ممكنة
 */
export async function getLocationWithHighAccuracy(
  maxRetries: number = 5, // زيادة عدد المحاولات للحصول على دقة أفضل
  minAccuracy: number = 30 // تحسين الدقة المثالية إلى 30 متر
): Promise<Location.LocationObject> {
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
  
  let bestLocation: Location.LocationObject | null = null;
  let bestAccuracy = Infinity;
  
  // محاولة الحصول على أفضل دقة ممكنة مع إعادة المحاولة
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📍 Attempt ${attempt}/${maxRetries} to get high accuracy location...`);
      
      // استخدام أقصى دقة ممكنة (GPS + WiFi + Cellular + Sensors)
      // على جميع المنصات، هذا يطلب أفضل دقة متاحة
      // Location.Accuracy.Highest يستخدم:
      // - Android: GPS + WiFi + Cellular (بعد enableNetworkProviderAsync)
      // - iOS: GPS + WiFi + Cellular (تلقائياً)
      // - Web: GPS + WiFi (عبر Geolocation API مع enableHighAccuracy: true)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest, // أفضل دقة ممكنة (GPS + WiFi + Cellular)
        // زيادة timeout للسماح للـ GPS بالحصول على إشارة أفضل
        // على الويب، هذا لا يؤثر، لكن على Mobile يساعد
      });
      
      const accuracy = location.coords.accuracy ?? Infinity;
      
      // تسجيل معلومات عن الدقة
      if (Platform.OS === 'web') {
        // على الويب، الدقة الجيدة (< 100m) تعني استخدام GPS/WiFi
        // الدقة المتوسطة (100-1000m) تعني استخدام Network (WiFi/Cellular)
        // الدقة السيئة (> 1000m) تعني استخدام IP-based فقط
        if (accuracy < 100) {
          console.log(`✅ High accuracy detected on web (attempt ${attempt}): ${accuracy.toFixed(0)}m - GPS + WiFi is being used`);
        } else if (accuracy < 1000) {
          console.log(`⚠️ Medium accuracy on web (attempt ${attempt}): ${accuracy.toFixed(0)}m - Network (WiFi/Cellular) positioning`);
        } else {
          console.log(`❌ Low accuracy on web (attempt ${attempt}): ${accuracy.toFixed(0)}m - IP-based geolocation only`);
        }
      } else {
        console.log(`📍 Location accuracy (attempt ${attempt}): ${accuracy.toFixed(0)}m`);
      }
      
      // إذا حصلنا على دقة ممتازة (أقل من minAccuracy)، نرجعها مباشرة
      if (accuracy <= minAccuracy) {
        console.log(`✅ Excellent accuracy achieved (${accuracy.toFixed(0)}m ≤ ${minAccuracy}m), returning immediately`);
        return location;
      }
      
      // حفظ أفضل موقع حتى الآن
      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        bestLocation = location;
        console.log(`✅ Better accuracy found: ${accuracy.toFixed(0)}m (best so far)`);
      }
      
      // على الويب، إذا كانت الدقة جيدة (< 150m) ولم تتحسن في المحاولات السابقة،
      // نقبل بالنتيجة الحالية بدلاً من الانتظار أكثر
      const goodAccuracyThreshold = Platform.OS === 'web' ? 150 : 100;
      if (bestAccuracy <= goodAccuracyThreshold && attempt >= 2) {
        // إذا كانت الدقة جيدة ولم تتحسن في المحاولة الثانية، نرجعها
        // (نتحقق من bestAccuracy وليس accuracy لأننا نريد أفضل دقة حتى الآن)
        console.log(`✅ Good accuracy achieved (${bestAccuracy.toFixed(0)}m ≤ ${goodAccuracyThreshold}m), returning after ${attempt} attempts`);
        return bestLocation!;
      }
      
      // إذا لم نحصل على دقة جيدة، ننتظر قليلاً قبل المحاولة التالية
      // لإعطاء GPS وقت للحصول على إشارة أفضل
      // زيادة وقت الانتظار تدريجياً للحصول على دقة أفضل
      if (attempt < maxRetries && accuracy > minAccuracy) {
        // تقليل وقت الانتظار إذا كانت الدقة جيدة بالفعل
        const baseWaitTime = bestAccuracy < 200 ? 800 : 1200; // انتظار أقل إذا كانت الدقة جيدة
        const waitTime = Math.min(attempt * baseWaitTime, 4000); // 0.8-1.2s, 1.6-2.4s, 2.4-3.6s, 3.2-4s, 4s...
        console.log(`⏳ Waiting ${waitTime}ms before next attempt to allow GPS to improve...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error: any) {
      console.error(`❌ Error getting location (attempt ${attempt}/${maxRetries}):`, error);
      // إذا كانت هذه المحاولة الأخيرة، نرجع أفضل موقع حصلنا عليه
      if (attempt === maxRetries && bestLocation) {
        console.log('⚠️ Using best location from previous attempts');
        return bestLocation;
      }
    }
  }
  
  // إذا لم نحصل على موقع، نرمي خطأ
  if (!bestLocation) {
    throw new Error('فشل الحصول على الموقع بعد عدة محاولات');
  }
  
  console.log(`✅ Returning best location with accuracy: ${bestAccuracy.toFixed(0)}m`);
  return bestLocation;
}

/**
 * تحويل الإحداثيات إلى عنوان مع البحث في الدليل أولاً
 */
export async function getAddressFromCoordinates(
  lat: number, 
  lon: number, 
  maxDistance: number = 1000 // زيادة المسافة للبحث عن الأماكن اليدوية
): Promise<string> {
  try {
    console.log(`🔍 getAddressFromCoordinates: Starting for lat=${lat}, lon=${lon}, maxDistance=${maxDistance}`);
    
    // إضافة timeout للبحث في الدليل (5 ثوانٍ)
    const directorySearchPromise = findNearestPlaceInDirectory(lat, lon, maxDistance);
    const directoryTimeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => {
        console.warn('⚠️ Directory search timeout after 5 seconds');
        resolve(null);
      }, 5000)
    );
    
    const nearestPlace = await Promise.race([directorySearchPromise, directoryTimeoutPromise]);
    
    if (nearestPlace) {
      // إذا وُجد مكان قريب في الدليل، نستخدم اسمه
      console.log(`✅ Using place name from directory: ${nearestPlace.name} (${nearestPlace.distance}m away)`);
      return nearestPlace.name;
    } else {
      console.log('ℹ️ No place found in directory, trying reverse geocoding...');
      
      // إضافة timeout لـ reverse geocoding (10 ثوانٍ)
      const reverseGeocodePromise = reverseGeocode(lat, lon);
      const reverseTimeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => {
          console.warn('⚠️ Reverse geocoding timeout after 10 seconds');
          resolve(null);
        }, 10000)
      );
      
      const data = await Promise.race([reverseGeocodePromise, reverseTimeoutPromise]);
      
      if (data && data.display_name) {
        console.log('✅ Using reverse geocoded address:', data.display_name);
        return data.display_name;
      }
      
      console.log('⚠️ No address found, using default');
      return 'موقعي الحالي';
    }
  } catch (error: any) {
    console.error('❌ Error in getAddressFromCoordinates:', error);
    // في حالة الخطأ، نرجع عنوان افتراضي بدلاً من رمي خطأ
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
