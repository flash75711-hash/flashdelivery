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
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Place {
  id: string;
  name: string;
  address: string;
  type: 'mall' | 'market' | 'area';
  latitude?: number;
  longitude?: number;
}

export default function PlacesDirectoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const placeId = (params.placeId || params.itemId) as string; // دعم كلا الاسمين للتوافق
  const [activeTab, setActiveTab] = useState<'malls' | 'markets' | 'areas' | 'map'>('malls');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    getUserLocation();
  }, []);

  useEffect(() => {
    if (userLocation) {
      loadPlacesFromCity();
    } else {
      loadPlaces();
    }
  }, [activeTab, userLocation]);

  useEffect(() => {
    if (searchQuery.length > 2) {
      searchPlaces();
    } else if (userLocation) {
      loadPlacesFromCity();
    } else {
      loadPlaces();
    }
  }, [searchQuery, activeTab, userLocation]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setUserLocation({
        lat: location.coords.latitude,
        lon: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const getCityFromLocation = async (lat: number, lon: number): Promise<string | null> => {
    try {
      const data = await reverseGeocode(lat, lon);
      
      if (data && data.address) {
        return data.address.city || data.address.town || data.address.village || null;
      }
      return null;
    } catch (error: any) {
      console.error('Error getting city:', error);
      return null;
    }
  };

  const loadPlacesFromCity = async () => {
    if (!userLocation) {
      await loadPlaces();
      return;
    }

    setLoading(true);
    try {
      // جلب اسم المدينة
      const cityName = await getCityFromLocation(userLocation.lat, userLocation.lon);
      
      // أولاً: محاولة جلب من قاعدة البيانات
      let query = supabase.from('places').select('*');
      
      if (activeTab === 'malls') {
        query = query.eq('type', 'mall');
      } else if (activeTab === 'markets') {
        query = query.eq('type', 'market');
      } else if (activeTab === 'areas') {
        query = query.eq('type', 'area');
      }

      const { data: dbPlaces, error: dbError } = await query;

      // التحقق من الحاجة للتحديث من API (كل أسبوع)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      let needsApiUpdate = false;
      let cityPlaces: any[] = [];
      
      if (!dbError && dbPlaces && dbPlaces.length > 0) {
        // فلترة الأماكن حسب المدينة
        if (cityName) {
          cityPlaces = dbPlaces.filter((place: any) => {
            const address = (place.address || '').toLowerCase();
            const placeCity = (place.city || '').toLowerCase();
            const cityLower = cityName.toLowerCase();
            return address.includes(cityLower) || placeCity === cityLower;
          });
        } else {
          cityPlaces = dbPlaces;
        }

        // التحقق إذا كانت الأماكن تحتاج تحديث (أكثر من أسبوع)
        const needsUpdate = cityPlaces.some((place: any) => {
          if (place.is_manual) return false; // الأماكن اليدوية لا تحتاج تحديث
          if (!place.last_api_update) return true; // لم يتم تحديثها من قبل
          return new Date(place.last_api_update) < oneWeekAgo;
        });

        needsApiUpdate = cityPlaces.length === 0 || needsUpdate;
      } else {
        needsApiUpdate = true;
      }

      // إذا لم نجد أماكن أو تحتاج تحديث، نبحث في API
      if (!cityName) {
        if (cityPlaces.length > 0) {
          setPlaces(cityPlaces.map((p: any) => ({
            id: p.id,
            name: p.name,
            address: p.address || '',
            type: p.type,
            latitude: p.latitude,
            longitude: p.longitude,
          })));
          setLoading(false);
          return;
        }
        await loadPlaces();
        return;
      }

      // إذا كانت الأماكن موجودة ولا تحتاج تحديث، نستخدمها
      if (!needsApiUpdate && cityPlaces.length > 0) {
        // ترتيب: يدوية أولاً، ثم حسب المسافة
        const sortedPlaces = sortPlacesByDistance(cityPlaces, userLocation);
        setPlaces(sortedPlaces.map((p: any) => ({
          id: p.id,
          name: p.name,
          address: p.address || '',
          type: p.type,
          latitude: p.latitude,
          longitude: p.longitude,
        })));
        setLoading(false);
        return;
      }

      // إذا لم نجد أماكن في المدينة، نبحث في API
      if (!cityName) {
        if (cityPlaces.length > 0) {
          const sortedPlaces = sortPlacesByDistance(cityPlaces, userLocation);
          setPlaces(sortedPlaces.map((p: any) => ({
            id: p.id,
            name: p.name,
            address: p.address || '',
            type: p.type,
            latitude: p.latitude,
            longitude: p.longitude,
          })));
          setLoading(false);
          return;
        }
        await loadPlaces();
        return;
      }

      // البحث عن الأماكن في المدينة باستخدام Edge Function (كل أسبوع)
      const currentType = activeTab === 'malls' ? 'malls' : activeTab === 'markets' ? 'markets' : 'areas';
      let apiPlaces: Place[] = [];

      // استدعاء Edge Function لجلب الأماكن من Nominatim API
      if (cityName) {
        try {
          const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
          if (supabaseUrl) {
            const functionUrl = `${supabaseUrl}/functions/v1/sync-places`;
            const { data: { session } } = await supabase.auth.getSession();
            
            const response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token || ''}`,
              },
              body: JSON.stringify({
                cityName,
                placeType: currentType === 'malls' ? 'mall' : currentType === 'markets' ? 'market' : 'area',
              }),
            });

            if (response.ok) {
              const result = await response.json();
              if (result.places && Array.isArray(result.places)) {
                apiPlaces = result.places.map((p: any) => ({
                  id: p.name + '_' + p.type, // استخدام name+type كـ ID مؤقت
                  name: p.name,
                  address: p.address || '',
                  type: p.type,
                  latitude: p.latitude,
                  longitude: p.longitude,
                }));
                console.log(`Synced ${apiPlaces.length} places via Edge Function`);
              }
            } else {
              // Edge Function غير موجود أو غير منشور - تجاهل الخطأ بصمت
              console.warn('Edge Function sync-places not available (may not be deployed yet)');
            }
          }
        } catch (error: any) {
          // تجاهل أخطاء CORS أو الشبكة بصمت (خاصة إذا لم يكن Edge Function منشوراً)
          if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
            console.warn('Edge Function sync-places not available (CORS/network issue or not deployed)');
          } else {
            console.log('Error syncing places via Edge Function:', error);
          }
          // لا نوقف العملية، فقط نسجل الخطأ
        }
      }

      // دمج الأماكن اليدوية مع الأماكن من API
      const manualPlaces = cityPlaces.filter((p: any) => p.is_manual);
      const allPlacesCombined = [...manualPlaces, ...apiPlaces];

      // إعادة جلب الأماكن من قاعدة البيانات بعد المزامنة
      // (لضمان الحصول على IDs الصحيحة من قاعدة البيانات)
      if (apiPlaces.length > 0) {
        // انتظار قصير لضمان حفظ البيانات
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // إعادة جلب الأماكن من قاعدة البيانات
        let refreshQuery = supabase.from('places').select('*');
        if (activeTab === 'malls') {
          refreshQuery = refreshQuery.eq('type', 'mall');
        } else if (activeTab === 'markets') {
          refreshQuery = refreshQuery.eq('type', 'market');
        } else if (activeTab === 'areas') {
          refreshQuery = refreshQuery.eq('type', 'area');
        }

        const { data: refreshedPlaces } = await refreshQuery;
        
        if (refreshedPlaces && refreshedPlaces.length > 0) {
          // فلترة حسب المدينة
          const refreshedCityPlaces = cityName
            ? refreshedPlaces.filter((place: any) => {
                const address = (place.address || '').toLowerCase();
                const placeCity = (place.city || '').toLowerCase();
                const cityLower = cityName.toLowerCase();
                return address.includes(cityLower) || placeCity === cityLower;
              })
            : refreshedPlaces;

          // دمج الأماكن اليدوية مع المحدثة
          const refreshedManualPlaces = refreshedCityPlaces.filter((p: any) => p.is_manual);
          const refreshedApiPlaces = refreshedCityPlaces.filter((p: any) => !p.is_manual);
          const finalPlaces = [...refreshedManualPlaces, ...refreshedApiPlaces];

          // ترتيب: يدوية أولاً، ثم حسب المسافة
          const sortedPlaces = sortPlacesByDistance(finalPlaces, userLocation);
          setPlaces(sortedPlaces.map((p: any) => ({
            id: p.id,
            name: p.name,
            address: p.address || '',
            type: p.type,
            latitude: p.latitude,
            longitude: p.longitude,
          })));
          setLoading(false);
          return;
        }
      }

      // ترتيب: يدوية أولاً، ثم حسب المسافة
      const sortedPlaces = sortPlacesByDistance(allPlacesCombined, userLocation);
      setPlaces(sortedPlaces.map((p: any) => ({
        id: p.id || (p.name + '_' + p.type),
        name: p.name,
        address: p.address || '',
        type: p.type,
        latitude: p.latitude,
        longitude: p.longitude,
      })));
    } catch (error) {
      console.error('Error loading places from city:', error);
      await loadPlaces();
    } finally {
      setLoading(false);
    }
  };

  const loadPlaces = async () => {
    setLoading(true);
    try {
      let query = supabase.from('places').select('*');

      // فلترة حسب النوع
      if (activeTab === 'malls') {
        query = query.eq('type', 'mall');
      } else if (activeTab === 'markets') {
        query = query.eq('type', 'market');
      } else if (activeTab === 'areas') {
        query = query.eq('type', 'area');
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setPlaces(data || []);
    } catch (error) {
      console.error('Error loading places:', error);
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  };

  const searchPlaces = async () => {
    setLoading(true);
    try {
      let query = supabase.from('places').select('*').ilike('name', `%${searchQuery}%`);

      if (activeTab === 'malls') {
        query = query.eq('type', 'mall');
      } else if (activeTab === 'markets') {
        query = query.eq('type', 'market');
      } else if (activeTab === 'areas') {
        query = query.eq('type', 'area');
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setPlaces(data || []);
    } catch (error) {
      console.error('Error searching places:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const sortPlacesByDistance = (places: any[], userLocation: { lat: number; lon: number }) => {
    return places.sort((a, b) => {
      // الأماكن اليدوية أولاً
      if (a.is_manual && !b.is_manual) return -1;
      if (!a.is_manual && b.is_manual) return 1;
      
      // إذا كانا نفس النوع، نرتب حسب المسافة
      if (a.latitude && a.longitude && b.latitude && b.longitude) {
        const distA = calculateDistance(userLocation.lat, userLocation.lon, a.latitude, a.longitude);
        const distB = calculateDistance(userLocation.lat, userLocation.lon, b.latitude, b.longitude);
        return distA - distB;
      }
      
      // إذا لم تكن هناك إحداثيات، نرتب حسب الاسم
      return a.name.localeCompare(b.name);
    });
  };

  const handleSelectPlace = async (place: Place) => {
    // حفظ المكان المختار في AsyncStorage
    const currentPlaceId = placeId;
    if (currentPlaceId) {
      await AsyncStorage.setItem(`selected_place_${currentPlaceId}`, JSON.stringify(place));
    }
    
    // التحقق من إمكانية الرجوع قبل استدعاء router.back()
    if (router.canGoBack()) {
      router.back();
    } else {
      // إذا لم يكن هناك screen للرجوع إليه، نذهب إلى outside-order
      router.replace('/customer/outside-order');
    }
  };

  const handleMapSearch = () => {
    // فتح الخريطة في تطبيق خارجي
    if (userLocation) {
      const url = `https://www.google.com/maps/search/?api=1&query=${userLocation.lat},${userLocation.lon}`;
      Linking.openURL(url);
    } else {
      const url = 'https://www.google.com/maps';
      Linking.openURL(url);
    }
  };

      // ترتيب الأماكن: يدوية أولاً، ثم حسب المسافة
      const sortedPlaces = sortPlacesByDistance([...places], userLocation || { lat: 0, lon: 0 });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/customer/outside-order');
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>دليل الأماكن</Text>
      </View>

      {/* التبويبات */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'malls' && styles.tabActive]}
          onPress={() => setActiveTab('malls')}
        >
          <Ionicons name="storefront" size={20} color={activeTab === 'malls' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'malls' && styles.tabTextActive]}>المولات</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'markets' && styles.tabActive]}
          onPress={() => setActiveTab('markets')}
        >
          <Ionicons name="basket" size={20} color={activeTab === 'markets' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'markets' && styles.tabTextActive]}>الأسواق</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'areas' && styles.tabActive]}
          onPress={() => setActiveTab('areas')}
        >
          <Ionicons name="location" size={20} color={activeTab === 'areas' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'areas' && styles.tabTextActive]}>المناطق</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'map' && styles.tabActive]}
          onPress={() => {
            setActiveTab('map');
            handleMapSearch();
          }}
        >
          <Ionicons name="map" size={20} color={activeTab === 'map' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'map' && styles.tabTextActive]}>الخريطة</Text>
        </TouchableOpacity>
      </View>

      {/* حقل البحث */}
      {activeTab !== 'map' && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن مكان..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>
      )}

      {/* قائمة الأماكن */}
      {activeTab !== 'map' && (
        <View style={styles.listContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : sortedPlaces.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="location-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد أماكن متاحة</Text>
            </View>
          ) : (
            <FlatList
              data={sortedPlaces}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.placeCard}
                  onPress={() => handleSelectPlace(item)}
                >
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName}>{item.name}</Text>
                    <Text style={styles.placeAddress}>{item.address}</Text>
                    {userLocation && item.latitude && item.longitude && (
                      <Text style={styles.placeDistance}>
                        {calculateDistance(userLocation.lat, userLocation.lon, item.latitude, item.longitude).toFixed(1)} كم
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#999" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {activeTab === 'map' && (
        <View style={styles.mapContainer}>
          <Text style={styles.mapText}>سيتم فتح الخريطة في تطبيق خارجي</Text>
        </View>
      )}
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
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 16,
    color: '#1a1a1a',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  listContainer: {
    flex: 1,
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
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
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
  placeDistance: {
    fontSize: 12,
    color: '#007AFF',
    textAlign: 'right',
  },
  mapContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  mapText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

