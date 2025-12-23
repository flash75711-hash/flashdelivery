import React, { useState, useEffect, useCallback } from 'react';
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
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { getLocationWithHighAccuracy } from '@/lib/locationUtils';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Map Component - react-native-maps for mobile, iframe for web
const MapComponent = ({ 
  userLocation, 
  places,
  onPlaceSelect,
  onMapLocationSelect
}: { 
  userLocation: { lat: number; lon: number } | null;
  places: Place[];
  onPlaceSelect: (place: Place) => void;
  onMapLocationSelect?: (location: { lat: number; lon: number; address: string }) => void;
}) => {
  const placesWithCoords = places.filter(p => p.latitude && p.longitude);
  const [selectedMapLocation, setSelectedMapLocation] = React.useState<{ lat: number; lon: number; address?: string } | null>(null);
  const [loadingAddress, setLoadingAddress] = React.useState(false);
  
  // دالة لجلب العنوان عند اختيار موقع جديد
  const fetchAddressForLocation = async (lat: number, lon: number) => {
    setLoadingAddress(true);
    try {
      const data = await reverseGeocode(lat, lon);
      const address = data?.display_name || `خط العرض: ${lat.toFixed(6)}, خط الطول: ${lon.toFixed(6)}`;
      setSelectedMapLocation(prev => prev ? { ...prev, address } : { lat, lon, address });
    } catch (error) {
      console.error('Error getting address:', error);
      const address = `خط العرض: ${lat.toFixed(6)}, خط الطول: ${lon.toFixed(6)}`;
      setSelectedMapLocation(prev => prev ? { ...prev, address } : { lat, lon, address });
    } finally {
      setLoadingAddress(false);
    }
  };
  
  console.log('MapComponent: places data', {
    totalPlaces: places.length,
    placesWithCoords: placesWithCoords.length,
    samplePlace: places[0] ? {
      id: places[0].id,
      name: places[0].name,
      hasLat: !!places[0].latitude,
      hasLon: !!places[0].longitude
    } : null
  });
  
  if (!userLocation) {
    return (
      <View style={styles.mapPlaceholder}>
        <Ionicons name="location-outline" size={64} color="#ccc" />
        <Text style={styles.mapPlaceholderText}>جارٍ تحميل الخريطة...</Text>
      </View>
    );
  }
  
  // على الويب، نستخدم iframe مع OpenStreetMap
  // @ts-ignore - Platform.OS can be 'web' at runtime
  if (Platform.OS === 'web') {
    // إنشاء markers مع إمكانية النقر عليها
    const placesData = placesWithCoords.map((place, index) => ({
      index,
      lat: place.latitude,
      lon: place.longitude,
      name: (place.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' '),
      address: (place.address || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' '),
      id: place.id
    }));
    
    const placesMarkers = placesData.map(place => {
      const markerVar = `marker_${place.index}`;
      // استخدام JSON.stringify للتأكد من escaping صحيح
      const placeIdJson = JSON.stringify(place.id);
      return `
      var ${markerVar} = L.marker([${place.lat}, ${place.lon}]).addTo(map)
        .bindPopup('<b>${place.name}</b><br>${place.address}<br><button onclick="selectPlace(${placeIdJson})" style="margin-top:8px;padding:6px 12px;background:#007AFF;color:white;border:none;border-radius:6px;cursor:pointer;">اختر هذا المكان</button>', {
          closeOnClick: false,
          autoClose: false,
          closeOnEscapeKey: true
        });
      ${markerVar}.on('click', function(e) {
        ${markerVar}.openPopup();
        selectPlace(${placeIdJson});
      });`;
    }).join('\n    ');
    
    // Marker للموقع المختار من الخريطة
    let selectedMarker: any = null;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; } 
    #map { 
      width: 100%; 
      height: 100vh; 
      cursor: crosshair;
      touch-action: pan-x pan-y !important;
      -ms-touch-action: pan-x pan-y !important;
    }
    #map:active {
      cursor: crosshair;
    }
    .leaflet-marker-icon {
      cursor: pointer !important;
    }
    .leaflet-container {
      touch-action: pan-x pan-y !important;
      -ms-touch-action: pan-x pan-y !important;
    }
    .leaflet-map-pane {
      touch-action: pan-x pan-y !important;
      -ms-touch-action: pan-x pan-y !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${userLocation.lat}, ${userLocation.lon}],
      zoom: 15,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      scrollWheelZoom: true,
      boxZoom: true,
      keyboard: true,
      tap: true,
      zoomControl: true
    });
    
    // التأكد من تفعيل التفاعل
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    
    // فرض touch-action بعد تحميل Leaflet
    map.whenReady(function() {
      var mapEl = document.getElementById('map');
      if (mapEl) {
        mapEl.style.setProperty('touch-action', 'pan-x pan-y', 'important');
        mapEl.style.setProperty('-ms-touch-action', 'pan-x pan-y', 'important');
      }
      var container = document.querySelector('.leaflet-container');
      if (container) {
        container.style.setProperty('touch-action', 'pan-x pan-y', 'important');
        container.style.setProperty('-ms-touch-action', 'pan-x pan-y', 'important');
      }
      var mapPane = document.querySelector('.leaflet-map-pane');
      if (mapPane) {
        mapPane.style.setProperty('touch-action', 'pan-x pan-y', 'important');
        mapPane.style.setProperty('-ms-touch-action', 'pan-x pan-y', 'important');
      }
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    var userIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34]
    });
    L.marker([${userLocation.lat}, ${userLocation.lon}], {icon: userIcon}).addTo(map)
      .bindPopup('موقعك الحالي').openPopup();
    
    // Marker للموقع المختار (أخضر)
    var selectedIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34]
    });
    var selectedMarker = null;
    
    // إضافة event listener للنقر على الخريطة
    map.on('click', function(e) {
      var lat = e.latlng.lat;
      var lon = e.latlng.lng;
      
      // إزالة الـ marker السابق إذا كان موجوداً
      if (selectedMarker) {
        map.removeLayer(selectedMarker);
      }
      
      // إضافة marker جديد في الموقع المختار
      selectedMarker = L.marker([lat, lon], {icon: selectedIcon, draggable: true}).addTo(map)
        .bindPopup('الموقع المختار<br>انقر على Marker لسحبه').openPopup();
      
      // إرسال الإحداثيات للـ parent
      if (window.parent && window.parent !== window) {
        const message = { type: 'MAP_CLICK', lat: lat, lon: lon };
        window.parent.postMessage(message, '*');
      }
      
      // عند سحب الـ marker، تحديث الإحداثيات
      selectedMarker.on('dragend', function(e) {
        var marker = e.target;
        var position = marker.getLatLng();
        if (window.parent && window.parent !== window) {
          const message = { type: 'MAP_CLICK', lat: position.lat, lon: position.lng };
          window.parent.postMessage(message, '*');
        }
      });
    });
    
    ${placesMarkers}
    
    // دالة لاختيار المكان
    function selectPlace(placeId) {
      try {
        console.log('selectPlace called with placeId:', placeId);
        // إرسال رسالة للـ parent window
        if (window.parent && window.parent !== window) {
          const message = { type: 'PLACE_SELECTED', placeId: placeId };
          console.log('Sending message to parent:', message);
          window.parent.postMessage(message, '*');
        } else {
          console.warn('window.parent is not available or same as window');
        }
      } catch (e) {
        console.error('Error sending message:', e);
      }
    }
  </script>
</body>
</html>`;
    
    // إضافة event listener لاستقبال الرسائل من iframe
    React.useEffect(() => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const handleMessage = (event: MessageEvent) => {
          console.log('Message received from iframe:', event.data);
          if (event.data && event.data.type === 'PLACE_SELECTED') {
            const placeId = event.data.placeId;
            console.log('Looking for place with id:', placeId);
            const selectedPlace = places.find(p => p.id === placeId);
            console.log('Found place:', selectedPlace);
            if (selectedPlace) {
              console.log('Calling onPlaceSelect with:', selectedPlace);
              onPlaceSelect(selectedPlace);
            } else {
              console.warn('Place not found with id:', placeId, 'Available places:', places.map(p => p.id));
            }
          } else if (event.data && event.data.type === 'MAP_CLICK') {
            const { lat, lon } = event.data;
            console.log('Map clicked at:', lat, lon);
            setSelectedMapLocation({ lat, lon });
            // جلب العنوان مباشرة عند النقر على الخريطة
            (async () => {
              setLoadingAddress(true);
              try {
                const data = await reverseGeocode(lat, lon);
                const address = data?.display_name || `خط العرض: ${lat.toFixed(6)}, خط الطول: ${lon.toFixed(6)}`;
                setSelectedMapLocation(prev => prev ? { ...prev, address } : { lat, lon, address });
              } catch (error) {
                console.error('Error getting address:', error);
                const address = `خط العرض: ${lat.toFixed(6)}, خط الطول: ${lon.toFixed(6)}`;
                setSelectedMapLocation(prev => prev ? { ...prev, address } : { lat, lon, address });
              } finally {
                setLoadingAddress(false);
              }
            })();
          }
        };
        
        window.addEventListener('message', handleMessage);
        return () => {
          window.removeEventListener('message', handleMessage);
        };
      }
    }, [places, onPlaceSelect]);
    
    const handleConfirmMapLocation = async () => {
      if (!selectedMapLocation || !onMapLocationSelect) return;
      
      try {
        // جلب العنوان من الإحداثيات
        const data = await reverseGeocode(selectedMapLocation.lat, selectedMapLocation.lon);
        const address = data?.display_name || `خط العرض: ${selectedMapLocation.lat}, خط الطول: ${selectedMapLocation.lon}`;
        
        onMapLocationSelect({
          lat: selectedMapLocation.lat,
          lon: selectedMapLocation.lon,
          address: address
        });
        
        setSelectedMapLocation(null);
      } catch (error) {
        console.error('Error getting address:', error);
        // حتى لو فشل reverse geocoding، نستخدم الإحداثيات
        onMapLocationSelect({
          lat: selectedMapLocation.lat,
          lon: selectedMapLocation.lon,
          address: `خط العرض: ${selectedMapLocation.lat}, خط الطول: ${selectedMapLocation.lon}`
        });
        setSelectedMapLocation(null);
      }
    };
    
    return (
      <View style={styles.mapWebView}>
        {/* @ts-ignore - iframe is valid on web, srcdoc is correct HTML attribute */}
        <iframe
          // @ts-ignore
          srcdoc={html}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          title="Map"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock"
          allow="geolocation"
        />
        {selectedMapLocation && onMapLocationSelect && (
          <View style={styles.mapLocationOverlay}>
            <View style={styles.mapLocationCard}>
              <Text style={styles.mapLocationTitle}>الموقع المختار</Text>
              {loadingAddress ? (
                <Text style={styles.mapLocationText}>جارٍ جلب العنوان...</Text>
              ) : selectedMapLocation.address ? (
                <Text style={styles.mapLocationAddress}>{selectedMapLocation.address}</Text>
              ) : null}
              <Text style={styles.mapLocationText}>
                خط العرض: {selectedMapLocation.lat.toFixed(6)}
              </Text>
              <Text style={styles.mapLocationText}>
                خط الطول: {selectedMapLocation.lon.toFixed(6)}
              </Text>
              <View style={styles.mapLocationButtons}>
                <TouchableOpacity
                  style={[styles.mapLocationButton, styles.mapLocationButtonCancel]}
                  onPress={() => setSelectedMapLocation(null)}
                >
                  <Text style={styles.mapLocationButtonText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mapLocationButton, styles.mapLocationButtonConfirm]}
                  onPress={handleConfirmMapLocation}
                >
                  <Text style={[styles.mapLocationButtonText, styles.mapLocationButtonTextConfirm]}>
                    تأكيد الموقع
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }
  
  // على الموبايل، نستخدم react-native-maps
  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
  if (isMobile && MapView && Marker) {
    const handleMapPress = (event: any) => {
      if (!onMapLocationSelect) return;
      
      const coordinate = event.nativeEvent?.coordinate;
      if (!coordinate) return;
      
      setSelectedMapLocation({
        lat: coordinate.latitude,
        lon: coordinate.longitude
      });
      // جلب العنوان مباشرة عند النقر على الخريطة
      fetchAddressForLocation(coordinate.latitude, coordinate.longitude);
    };
    
    const handleConfirmMapLocation = async () => {
      if (!selectedMapLocation || !onMapLocationSelect) return;
      
      try {
        // جلب العنوان من الإحداثيات
        const data = await reverseGeocode(selectedMapLocation.lat, selectedMapLocation.lon);
        const address = data?.display_name || `خط العرض: ${selectedMapLocation.lat}, خط الطول: ${selectedMapLocation.lon}`;
        
        onMapLocationSelect({
          lat: selectedMapLocation.lat,
          lon: selectedMapLocation.lon,
          address: address
        });
        
        setSelectedMapLocation(null);
      } catch (error) {
        console.error('Error getting address:', error);
        // حتى لو فشل reverse geocoding، نستخدم الإحداثيات
        onMapLocationSelect({
          lat: selectedMapLocation.lat,
          lon: selectedMapLocation.lon,
          address: `خط العرض: ${selectedMapLocation.lat}, خط الطول: ${selectedMapLocation.lon}`
        });
        setSelectedMapLocation(null);
      }
    };
    
    return (
      <View style={styles.mapWebView}>
      <MapView
        style={styles.mapWebView}
        initialRegion={{
          latitude: userLocation.lat,
          longitude: userLocation.lon,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        showsUserLocation={true}
        showsMyLocationButton={true}
          onPress={handleMapPress}
      >
        {/* User location marker */}
        <Marker
          coordinate={{
            latitude: userLocation.lat,
            longitude: userLocation.lon,
          }}
          title="موقعك الحالي"
          pinColor="blue"
        />
          
          {/* Selected location marker */}
          {selectedMapLocation && (
            <Marker
              coordinate={{
                latitude: selectedMapLocation.lat,
                longitude: selectedMapLocation.lon,
              }}
              title="الموقع المختار"
              pinColor="green"
              draggable
              onDragEnd={(e: any) => {
                const coordinate = e.nativeEvent.coordinate;
                setSelectedMapLocation({
                  lat: coordinate.latitude,
                  lon: coordinate.longitude
                });
                // جلب العنوان عند سحب الـ marker
                fetchAddressForLocation(coordinate.latitude, coordinate.longitude);
              }}
            />
          )}
        
        {/* Places markers */}
        {placesWithCoords.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude!,
              longitude: place.longitude!,
            }}
            title={place.name}
            description={place.address}
            onPress={() => onPlaceSelect(place)}
          />
        ))}
      </MapView>
        {selectedMapLocation && onMapLocationSelect && (
          <View style={styles.mapLocationOverlay}>
            <View style={styles.mapLocationCard}>
              <Text style={styles.mapLocationTitle}>الموقع المختار</Text>
              {loadingAddress ? (
                <Text style={styles.mapLocationText}>جارٍ جلب العنوان...</Text>
              ) : selectedMapLocation.address ? (
                <Text style={styles.mapLocationAddress}>{selectedMapLocation.address}</Text>
              ) : null}
              <Text style={styles.mapLocationText}>
                خط العرض: {selectedMapLocation.lat.toFixed(6)}
              </Text>
              <Text style={styles.mapLocationText}>
                خط الطول: {selectedMapLocation.lon.toFixed(6)}
              </Text>
              <View style={styles.mapLocationButtons}>
                <TouchableOpacity
                  style={[styles.mapLocationButton, styles.mapLocationButtonCancel]}
                  onPress={() => setSelectedMapLocation(null)}
                >
                  <Text style={styles.mapLocationButtonText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mapLocationButton, styles.mapLocationButtonConfirm]}
                  onPress={handleConfirmMapLocation}
                >
                  <Text style={[styles.mapLocationButtonText, styles.mapLocationButtonTextConfirm]}>
                    تأكيد الموقع
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }
  
  // Fallback إذا لم يكن MapView متاحاً (على الويب أو منصات أخرى)
  return (
    <View style={styles.mapPlaceholder}>
      <Ionicons name="location-outline" size={64} color="#ccc" />
      <Text style={styles.mapPlaceholderText}>الخريطة غير متاحة على هذه المنصة</Text>
    </View>
  );
};

interface Place {
  id: string;
  name: string;
  address: string;
  type: 'mall' | 'market' | 'area';
  latitude?: number;
  longitude?: number;
  is_manual?: boolean;
}

export default function PlacesDirectoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const placeId = (params.placeId || params.itemId) as string; // دعم كلا الاسمين للتوافق
  const addressIndex = params.addressIndex as string | undefined; // معرف العنوان من صفحة الملف الشخصي
  const fromLocationDisplay = params.fromLocationDisplay === 'true'; // فتح من CurrentLocationDisplay
  const [activeTab, setActiveTab] = useState<'malls' | 'markets' | 'areas' | 'map'>('malls');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [mapKey, setMapKey] = useState(0); // لإعادة تحميل الخريطة عند تغيير البيانات

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

  // تحديث الخريطة عند تغيير الأماكن أو الموقع
  useEffect(() => {
    if (activeTab === 'map') {
      setMapKey(prev => prev + 1);
    }
  }, [places, userLocation, activeTab]);

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

      // استخدام الدالة المشتركة التي تستخدم WiFi
      const location = await getLocationWithHighAccuracy();

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
        // ملاحظة: الأماكن اليدوية تظهر دائماً بغض النظر عن المدينة
        if (cityName) {
          cityPlaces = dbPlaces.filter((place: any) => {
            // الأماكن اليدوية تظهر دائماً
            if (place.is_manual) return true;
            
            // الأماكن العادية تُفلتر حسب المدينة
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
            is_manual: p.is_manual || false,
          })));
          setLoading(false);
          return;
        }
        await loadPlaces();
        return;
      }

      // إذا كانت الأماكن موجودة ولا تحتاج تحديث، نستخدمها
      if (!needsApiUpdate && cityPlaces.length > 0) {
        // فصل الأماكن اليدوية عن العادية
        const manualPlaces = cityPlaces.filter((p: any) => p.is_manual);
        const regularPlaces = cityPlaces.filter((p: any) => !p.is_manual);

        // ترتيب الأماكن اليدوية حسب المسافة
        const sortedManualPlaces = sortPlacesByDistance(manualPlaces, userLocation);
        
        // ترتيب الأماكن العادية حسب المسافة
        const sortedRegularPlaces = sortPlacesByDistance(regularPlaces, userLocation);

        // دمج: يدوية أولاً، ثم عادية
        const sortedPlaces = [...sortedManualPlaces, ...sortedRegularPlaces];
        
        setPlaces(sortedPlaces.map((p: any) => ({
          id: p.id,
          name: p.name,
          address: p.address || '',
          type: p.type,
          latitude: p.latitude,
          longitude: p.longitude,
          is_manual: p.is_manual || false,
        })));
        setLoading(false);
        return;
      }

      // إذا لم نجد أماكن في المدينة، نبحث في API
      if (!cityName) {
        if (cityPlaces.length > 0) {
          // فصل الأماكن اليدوية عن العادية
          const manualPlaces = cityPlaces.filter((p: any) => p.is_manual);
          const regularPlaces = cityPlaces.filter((p: any) => !p.is_manual);

          // ترتيب الأماكن اليدوية حسب المسافة
          const sortedManualPlaces = sortPlacesByDistance(manualPlaces, userLocation);
          
          // ترتيب الأماكن العادية حسب المسافة
          const sortedRegularPlaces = sortPlacesByDistance(regularPlaces, userLocation);

          // دمج: يدوية أولاً، ثم عادية
          const sortedPlaces = [...sortedManualPlaces, ...sortedRegularPlaces];
          
          setPlaces(sortedPlaces.map((p: any) => ({
            id: p.id,
            name: p.name,
            address: p.address || '',
            type: p.type,
            latitude: p.latitude,
            longitude: p.longitude,
            is_manual: p.is_manual || false,
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
                  is_manual: false,
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
            is_manual: p.is_manual || false,
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
        is_manual: p.is_manual || false,
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

      const { data, error } = await query;

      if (error) throw error;

      // ترتيب النتائج: الأماكن اليدوية أولاً، ثم حسب المسافة
      let sortedPlaces = data || [];
      
      // فصل الأماكن اليدوية عن العادية
      const manualPlaces = sortedPlaces.filter((p: any) => p.is_manual);
      const regularPlaces = sortedPlaces.filter((p: any) => !p.is_manual);

      // ترتيب الأماكن اليدوية حسب المسافة إذا كان هناك موقع
      let sortedManualPlaces = manualPlaces;
      if (userLocation && manualPlaces.length > 0) {
        sortedManualPlaces = sortPlacesByDistance(manualPlaces, userLocation);
      } else {
        // إذا لم يكن هناك موقع، نرتب حسب الاسم
        sortedManualPlaces = manualPlaces.sort((a: any, b: any) => 
          (a.name || '').localeCompare(b.name || '')
        );
      }

      // ترتيب الأماكن العادية حسب المسافة إذا كان هناك موقع
      let sortedRegularPlaces = regularPlaces;
      if (userLocation && regularPlaces.length > 0) {
        sortedRegularPlaces = sortPlacesByDistance(regularPlaces, userLocation);
      } else {
        // إذا لم يكن هناك موقع، نرتب حسب الاسم
        sortedRegularPlaces = regularPlaces.sort((a: any, b: any) => 
          (a.name || '').localeCompare(b.name || '')
        );
      }

      // دمج: يدوية أولاً، ثم عادية
      setPlaces([...sortedManualPlaces, ...sortedRegularPlaces]);
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
      // البحث في الاسم والعنوان للأماكن اليدوية والعادية
      // ملاحظة: البحث يشمل جميع الأماكن بغض النظر عن المدينة
      // لأن الأماكن اليدوية قد تكون في مدن مختلفة
      let query = supabase
        .from('places')
        .select('*')
        .or(`name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`);

      // فلترة حسب النوع إذا كان محدداً
      if (activeTab === 'malls') {
        query = query.eq('type', 'mall');
      } else if (activeTab === 'markets') {
        query = query.eq('type', 'market');
      } else if (activeTab === 'areas') {
        query = query.eq('type', 'area');
      }

      const { data, error } = await query;

      if (error) throw error;

      // ترتيب النتائج: الأماكن اليدوية أولاً، ثم حسب المسافة
      let sortedPlaces = data || [];
      
      // فصل الأماكن اليدوية عن العادية
      const manualPlaces = sortedPlaces.filter((p: any) => p.is_manual);
      const regularPlaces = sortedPlaces.filter((p: any) => !p.is_manual);

      // ترتيب الأماكن اليدوية حسب المسافة إذا كان هناك موقع
      let sortedManualPlaces = manualPlaces;
      if (userLocation && manualPlaces.length > 0) {
        sortedManualPlaces = sortPlacesByDistance(manualPlaces, userLocation);
      } else {
        // إذا لم يكن هناك موقع، نرتب حسب الاسم
        sortedManualPlaces = manualPlaces.sort((a: any, b: any) => 
          (a.name || '').localeCompare(b.name || '')
        );
      }

      // ترتيب الأماكن العادية حسب المسافة إذا كان هناك موقع
      let sortedRegularPlaces = regularPlaces;
      if (userLocation && regularPlaces.length > 0) {
        sortedRegularPlaces = sortPlacesByDistance(regularPlaces, userLocation);
      } else {
        // إذا لم يكن هناك موقع، نرتب حسب الاسم
        sortedRegularPlaces = regularPlaces.sort((a: any, b: any) => 
          (a.name || '').localeCompare(b.name || '')
        );
      }

      // دمج: يدوية أولاً، ثم عادية
      setPlaces([...sortedManualPlaces, ...sortedRegularPlaces]);
    } catch (error) {
      console.error('Error searching places:', error);
      setPlaces([]);
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
    console.log('handleSelectPlace called with place:', place);
    // حفظ المكان المختار في AsyncStorage
    const currentPlaceId = placeId;
    if (currentPlaceId) {
      await AsyncStorage.setItem(`selected_place_${currentPlaceId}`, JSON.stringify(place));
    } else if (addressIndex !== undefined) {
      // إذا كان هناك addressIndex، نحفظ المكان للعنوان المحدد
      await AsyncStorage.setItem(`selected_place_address_${addressIndex}`, JSON.stringify(place));
    } else if (fromLocationDisplay) {
      // إذا تم فتح الدليل من CurrentLocationDisplay، نحفظ المكان لتحديث الموقع
      await AsyncStorage.setItem('selected_place_for_location', JSON.stringify(place));
    } else {
      // إذا لم يكن هناك placeId محدد، نحفظ المكان كـ "general_selection"
      // لاستخدامه في outside-order عند أول مكان فارغ
      await AsyncStorage.setItem('selected_place_general', JSON.stringify(place));
    }
    
    // التحقق من إمكانية الرجوع قبل استدعاء router.back()
    if (router.canGoBack()) {
      console.log('Navigating back...');
      router.back();
    } else {
      console.log('No back navigation available, going to outside-order');
      // إذا لم يكن هناك screen للرجوع إليه، نذهب إلى outside-order
      router.replace('/orders/outside-order');
    }
  };

  const handleMapLocationSelect = async (location: { lat: number; lon: number; address: string }) => {
    console.log('handleMapLocationSelect called with location:', location);
    
    // إنشاء كائن Place مؤقت من الموقع المختار
    const selectedPlace: Place = {
      id: `map_location_${Date.now()}`,
      name: location.address,
      address: location.address,
      type: 'area',
      latitude: location.lat,
      longitude: location.lon,
      is_manual: false,
    };
    
    // حفظ الموقع المختار في AsyncStorage
    const currentPlaceId = placeId;
    if (currentPlaceId) {
      await AsyncStorage.setItem(`selected_place_${currentPlaceId}`, JSON.stringify(selectedPlace));
    } else if (addressIndex !== undefined) {
      await AsyncStorage.setItem(`selected_place_address_${addressIndex}`, JSON.stringify(selectedPlace));
    } else if (fromLocationDisplay) {
      await AsyncStorage.setItem('selected_place_for_location', JSON.stringify(selectedPlace));
    } else {
      await AsyncStorage.setItem('selected_place_general', JSON.stringify(selectedPlace));
    }
    
    // التحقق من إمكانية الرجوع قبل استدعاء router.back()
    if (router.canGoBack()) {
      console.log('Navigating back...');
      router.back();
    } else {
      console.log('No back navigation available, going to outside-order');
      router.replace('/orders/outside-order');
    }
  };


  const handleMapSearch = () => {
    // لا نحتاج لفتح تطبيق خارجي - الخريطة ستكون داخل التطبيق
    // فقط نغير التبويب للخريطة
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
            router.replace('/orders/outside-order');
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
                  style={[styles.placeCard, item.is_manual && styles.placeCardManual]}
                  onPress={() => handleSelectPlace(item)}
                >
                  <View style={styles.placeInfo}>
                    <View style={styles.placeNameRow}>
                      <Text style={styles.placeName}>{item.name}</Text>
                      {item.is_manual && (
                        <View style={styles.manualBadge}>
                          <Ionicons name="star" size={14} color="#FFA500" />
                        </View>
                      )}
                    </View>
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
          {userLocation ? (
            <MapComponent 
              userLocation={userLocation} 
              places={places}
              onPlaceSelect={handleSelectPlace}
              onMapLocationSelect={handleMapLocationSelect}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="location-outline" size={64} color="#ccc" />
              <Text style={styles.mapPlaceholderText}>
                يرجى السماح بالوصول للموقع لعرض الخريطة
              </Text>
              <TouchableOpacity
                style={styles.enableLocationButton}
                onPress={getUserLocation}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.enableLocationText}>تفعيل الموقع</Text>
              </TouchableOpacity>
            </View>
          )}
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
  placeDistance: {
    fontSize: 12,
    color: '#007AFF',
    textAlign: 'right',
  },
  mapContainer: {
    pointerEvents: 'auto',
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  mapWebView: {
    pointerEvents: 'auto',
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mapLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  enableLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  enableLocationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mapLocationOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
    zIndex: 1000,
  },
  mapLocationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  mapLocationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'right',
  },
  mapLocationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  mapLocationAddress: {
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'right',
    fontWeight: '500',
    lineHeight: 20,
  },
  mapLocationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  mapLocationButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLocationButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  mapLocationButtonConfirm: {
    backgroundColor: '#007AFF',
  },
  mapLocationButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  mapLocationButtonTextConfirm: {
    color: '#fff',
  },
});

