/**
 * Web Location Utilities - استخدام Web APIs فقط
 * استبدال expo-location بـ navigator.geolocation
 */

import { 
  getCurrentLocation, 
  requestLocationPermission, 
  watchPosition, 
  clearWatch,
  type LocationCoordinates,
  LocationError 
} from './webUtils';
import { reverseGeocode } from './supabase';

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
  maxDistance: number = 1000
): Promise<{ name: string; distance: number } | null> {
  try {
    const { supabase } = await import('./supabase');
    
    console.log(`🔍 findNearestPlaceInDirectory: Starting search for lat=${lat}, lon=${lon}, maxDistance=${maxDistance}`);
    
    // استخدام cache إذا كان موجوداً وحديثاً
    const now = Date.now();
    let places = placesCache;
    
    if (!places || (now - placesCacheTimestamp) > PLACES_CACHE_DURATION) {
      console.log('📦 Cache miss or expired, fetching places from database...');
      const { data: fetchedPlaces, error } = await supabase
        .from('places')
        .select('id, name, latitude, longitude, is_manual')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error) {
        console.error('❌ Error fetching places from directory:', error);
        if (placesCache) {
          console.log('⚠️ Using stale cache due to error');
          places = placesCache;
        } else {
          return null;
        }
      } else {
        places = fetchedPlaces || [];
        console.log(`✅ Fetched ${places.length} places from database`);
        placesCache = places;
        placesCacheTimestamp = now;
      }
    } else {
      console.log(`✅ Using cached places (${places.length} places, ${Math.round((now - placesCacheTimestamp) / 1000)}s old)`);
    }

    if (!places || places.length === 0) {
      return null;
    }

    let nearestManualPlace: { name: string; distance: number } | null = null;
    let nearestAutoPlace: { name: string; distance: number } | null = null;
    let minManualDistance = Infinity;
    let minAutoDistance = Infinity;

    for (const place of places) {
      if (place.latitude && place.longitude) {
        const distance = calculateDistance(lat, lon, place.latitude, place.longitude);
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
    if (placesCache) {
      console.log('⚠️ Using cached places due to error');
    }
    return null;
  }
}

/**
 * جلب الموقع مع دقة عالية (Web API)
 */
export async function getLocationWithHighAccuracy(
  maxRetries: number = 3, // تقليل المحاولات من 5 إلى 3
  minAccuracy: number = 30
): Promise<LocationCoordinates> {
  let bestLocation: LocationCoordinates | null = null;
  let bestAccuracy = Infinity;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📍 Attempt ${attempt}/${maxRetries} to get high accuracy location...`);
      
      // استخدام maximumAge تدريجياً: محاولة أولى بدون cache، ثم مع cache
      const maximumAge = attempt === 1 ? 0 : 10000; // المحاولة الأولى جديدة، الباقي يمكن استخدام cache
      
      const location = await getCurrentLocation({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge,
      });
      
      const accuracy = location.accuracy ?? Infinity;
      
      if (accuracy < 100) {
        console.log(`✅ High accuracy detected (attempt ${attempt}): ${accuracy.toFixed(0)}m - GPS + WiFi is being used`);
      } else if (accuracy < 1000) {
        console.log(`⚠️ Medium accuracy (attempt ${attempt}): ${accuracy.toFixed(0)}m - Network (WiFi/Cellular) positioning`);
      } else {
        console.log(`❌ Low accuracy (attempt ${attempt}): ${accuracy.toFixed(0)}m - IP-based geolocation only`);
      }
      
      if (accuracy <= minAccuracy) {
        console.log(`✅ Excellent accuracy achieved (${accuracy.toFixed(0)}m ≤ ${minAccuracy}m), returning immediately`);
        return location;
      }
      
      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        bestLocation = location;
        console.log(`✅ Better accuracy found: ${accuracy.toFixed(0)}m (best so far)`);
      }
      
      const goodAccuracyThreshold = 150;
      if (bestAccuracy <= goodAccuracyThreshold && attempt >= 2) {
        console.log(`✅ Good accuracy achieved (${bestAccuracy.toFixed(0)}m ≤ ${goodAccuracyThreshold}m), returning after ${attempt} attempts`);
        return bestLocation!;
      }
      
      if (attempt < maxRetries && accuracy > minAccuracy) {
        // تقليل وقت الانتظار لتسريع العملية
        const baseWaitTime = bestAccuracy < 200 ? 500 : 800;
        const waitTime = Math.min(attempt * baseWaitTime, 2000); // تقليل من 4000 إلى 2000
        console.log(`⏳ Waiting ${waitTime}ms before next attempt to allow GPS to improve...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error: any) {
      console.error(`❌ Error getting location (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt === maxRetries && bestLocation) {
        console.log('⚠️ Using best location from previous attempts');
        return bestLocation;
      }
    }
  }
  
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
  maxDistance: number = 1000
): Promise<string> {
  try {
    console.log(`🔍 getAddressFromCoordinates: Starting for lat=${lat}, lon=${lon}, maxDistance=${maxDistance}`);
    
    const directorySearchPromise = findNearestPlaceInDirectory(lat, lon, maxDistance);
    const directoryTimeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => {
        console.warn('⚠️ Directory search timeout after 5 seconds');
        resolve(null);
      }, 5000)
    );
    
    const nearestPlace = await Promise.race([directorySearchPromise, directoryTimeoutPromise]);
    
    if (nearestPlace) {
      console.log(`✅ Using place name from directory: ${nearestPlace.name} (${nearestPlace.distance}m away)`);
      return nearestPlace.name;
    } else {
      console.log('ℹ️ No place found in directory, trying reverse geocoding...');
      
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
    return 'موقعي الحالي';
  }
}

/**
 * دالة شاملة لجلب الموقع والعنوان
 */
export async function getLocationWithAddress(
  maxDistance: number = 500
): Promise<{ lat: number; lon: number; address: string; accuracy?: number } | null> {
  try {
    // طلب إذن الوصول للموقع
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      throw new Error('لم يتم السماح بالوصول للموقع');
    }

    // جلب الموقع مع دقة عالية
    const location = await getLocationWithHighAccuracy();
    
    const lat = location.latitude;
    const lon = location.longitude;
    const accuracy = location.accuracy;

    console.log('Location Coordinates (using Web Geolocation API):', { 
      lat, 
      lon, 
      accuracy: `${accuracy?.toFixed(0)}m` || 'unknown',
      source: accuracy && accuracy < 100 ? 'GPS/WiFi (High Accuracy)' : accuracy && accuracy < 1000 ? 'Network (WiFi/Cellular)' : 'IP-based (Low Accuracy)',
      note: 'Web uses Geolocation API with enableHighAccuracy: true (GPS + WiFi)',
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

