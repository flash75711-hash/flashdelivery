import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CurrentLocationDisplay from '@/components/CurrentLocationDisplay';
import { pickImage } from '@/lib/webUtils';
import { uploadImageToImgBB } from '@/lib/imgbb';
import { showToast, showSimpleAlert } from '@/lib/alert';
import {
  calculateDeliveryPrice,
  calculateTotalDistance,
  generatePriceSuggestions,
  findFarthestPlaceFromCustomer,
  orderPlacesByDistance,
} from '@/lib/priceCalculation';
import { calculateDistance } from '@/lib/webLocationUtils';
import { createNotifications, notifyAllActiveDrivers } from '@/lib/notifications';

interface Place {
  id: string;
  name: string;
  address: string;
  type: 'mall' | 'market' | 'area';
  latitude?: number;
  longitude?: number;
}

interface ItemWithImage {
  id: string;
  name: string;
  imageUri?: string; // رابط الصورة المحلية
  imageUrl?: string; // رابط الصورة المرفوعة
}

interface PlaceWithItems {
  id: string;
  place: Place | null;
  items: ItemWithImage[]; // قائمة العناصر مع الصور
}

export default function OutsideOrderScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [placesWithItems, setPlacesWithItems] = useState<PlaceWithItems[]>([
    { id: Date.now().toString(), place: null, items: [] }
  ]);
  const [loading, setLoading] = useState(false);
  const [maxDeliveryDistance, setMaxDeliveryDistance] = useState<number>(3);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [currentLocationDisplay, setCurrentLocationDisplay] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const [isManualLocation, setIsManualLocation] = useState(false); // للتحقق من أن الموقع تم اختياره يدوياً
  const [findingPlace, setFindingPlace] = useState<string | null>(null);
  const [uploadingImageForItem, setUploadingImageForItem] = useState<string | null>(null); // itemId الذي يتم رفع صورته
  const [showImageSourceModal, setShowImageSourceModal] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ uri: string; placeId: string; itemId: string } | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  // استقبال الموقع من CurrentLocationDisplay
  const handleLocationUpdate = (location: { lat: number; lon: number; address: string } | null) => {
    // إذا كان الموقع تم اختياره يدوياً، لا نسمح بتحديثه تلقائياً من GPS
    if (isManualLocation) {
      console.log('Skipping location update because location was manually selected (isManualLocation = true)', {
        isManualLocation,
        currentLocationDisplay,
        incomingLocation: location
      });
      return;
    }
    
    // إذا كان هناك currentLocationDisplay موجود بالفعل، نتحقق من أنه ليس محدد يدوياً
    // (عن طريق التحقق من أن العنوان يطابق مكاناً محدداً يدوياً)
    if (currentLocationDisplay && location) {
      // إذا كان العنوان مختلفاً بشكل كبير، قد يكون هذا تحديث GPS غير مرغوب فيه
      // لكننا نسمح به لأن isManualLocation = false
      console.log('Updating location from GPS:', {
        current: currentLocationDisplay.address,
        incoming: location.address,
        isManualLocation
      });
    }
    
    if (location) {
      setUserLocation({
        lat: location.lat,
        lon: location.lon,
      });
      setCurrentLocationDisplay(location);
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'max_delivery_distance')
        .single();
      
      if (!error && data && data.value) {
        const distance = parseFloat(data.value);
        if (!isNaN(distance) && distance > 0) {
          setMaxDeliveryDistance(distance);
        }
      }
    } catch (error) {
      console.log('Using default max delivery distance:', maxDeliveryDistance, 'km');
    }
  };

  // إضافة مكان جديد
  const addPlace = () => {
    setPlacesWithItems([...placesWithItems, { id: Date.now().toString(), place: null, items: [] }]);
  };

  // حذف مكان
  const removePlace = (placeId: string) => {
    if (placesWithItems.length > 1) {
      setPlacesWithItems(placesWithItems.filter(p => p.id !== placeId));
    }
  };

  // إضافة عنصر لمكان معين
  const addItemToPlace = (placeId: string) => {
    setPlacesWithItems(placesWithItems.map(p => 
      p.id === placeId 
        ? { ...p, items: [...p.items, { id: Date.now().toString(), name: '' }] }
        : p
    ));
  };

  // تحديث عنصر في مكان معين
  const updateItemInPlace = (placeId: string, itemId: string, value: string) => {
    setPlacesWithItems(placesWithItems.map(p => 
      p.id === placeId 
        ? { ...p, items: p.items.map(item => item.id === itemId ? { ...item, name: value } : item) }
        : p
    ));
  };

  // حذف عنصر من مكان معين
  const removeItemFromPlace = (placeId: string, itemId: string) => {
    setPlacesWithItems(placesWithItems.map(p => 
      p.id === placeId 
        ? { ...p, items: p.items.filter(item => item.id !== itemId) }
        : p
    ));
  };

  // معالجة الصورة بعد اختيارها (من الكاميرا أو المعرض)
  const processSelectedImage = async (imageUri: string, placeId: string, itemId: string) => {
    try {
      let finalImageUri = imageUri;
      
      // على الويب، ImageManipulator قد لا يعمل بشكل صحيح مع blob URLs
      // على الويب، نستخدم blob URL أو data URL مباشرة
      // يمكن تحويلها إلى base64 إذا لزم الأمر عند الرفع
      finalImageUri = imageUri;

      setPlacesWithItems(placesWithItems.map(p => 
        p.id === placeId 
          ? { 
              ...p, 
              items: p.items.map(item => 
                item.id === itemId ? { ...item, imageUri: finalImageUri } : item
              )
            }
          : p
      ));
    } catch (error: any) {
      console.error('Error processing image:', error);
      showToast('فشل معالجة الصورة', 'error');
    }
  };

  // فتح الكاميرا لالتقاط صورة (Web: استخدام file input مع capture)
  const openCamera = async (placeId: string, itemId: string) => {
    try {
      console.log('openCamera called:', { placeId, itemId });
      
      // على الويب، نستخدم file input مع capture attribute
      const images = await pickImage({
        multiple: false,
        accept: 'image/*',
        maxSize: 10 * 1024 * 1024, // 10MB
      });

      if (images.length > 0) {
        await processSelectedImage(images[0].uri, placeId, itemId);
      }
    } catch (error: any) {
      console.error('Error opening camera:', error);
      showToast(`فشل فتح الكاميرا: ${error.message || 'خطأ غير معروف'}`, 'error');
    }
  };

  // فتح المعرض لاختيار صورة
  const openImageLibrary = async (placeId: string, itemId: string) => {
    try {
      console.log('openImageLibrary called:', { placeId, itemId });
      
      const images = await pickImage({
        multiple: false,
        accept: 'image/*',
        maxSize: 10 * 1024 * 1024, // 10MB
      });

      if (images.length > 0) {
        await processSelectedImage(images[0].uri, placeId, itemId);
      }
    } catch (error: any) {
      console.error('Error opening image library:', error);
      showToast(`فشل فتح المعرض: ${error.message || 'خطأ غير معروف'}`, 'error');
    }
  };

  // اختيار صورة لعنصر معين (إظهار خيارات)
  const pickImageForItem = (placeId: string, itemId: string) => {
    console.log('pickImageForItem called:', { placeId, itemId, platform: Platform.OS });
    
    // في Web، نفتح المعرض مباشرة (لأن الكاميرا لا تعمل)
    if (Platform.OS === 'web') {
      openImageLibrary(placeId, itemId);
      return;
    }
    
    // في الموبايل، نعرض الخيارات
    setSelectedPlaceId(placeId);
    setSelectedItemId(itemId);
    setShowImageSourceModal(true);
  };

  // إغلاق Modal وفتح الكاميرا
  const handleOpenCamera = () => {
    if (selectedPlaceId && selectedItemId) {
      setShowImageSourceModal(false);
      openCamera(selectedPlaceId, selectedItemId);
      setSelectedPlaceId(null);
      setSelectedItemId(null);
    }
  };

  // إغلاق Modal وفتح المعرض
  const handleOpenImageLibrary = () => {
    if (selectedPlaceId && selectedItemId) {
      setShowImageSourceModal(false);
      openImageLibrary(selectedPlaceId, selectedItemId);
      setSelectedPlaceId(null);
      setSelectedItemId(null);
    }
  };

  // حذف صورة من عنصر
  const removeImageFromItem = (placeId: string, itemId: string) => {
    setPlacesWithItems(placesWithItems.map(p => 
      p.id === placeId 
        ? { 
            ...p, 
            items: p.items.map(item => 
              item.id === itemId ? { ...item, imageUri: undefined, imageUrl: undefined } : item
            )
          }
        : p
    ));
  };

  // رفع صورة لعنصر معين
  const uploadImageForItem = async (placeId: string, itemId: string, imageUri: string): Promise<string | null> => {
    setUploadingImageForItem(itemId);
    try {
      const imageUrl = await uploadImageToImgBB(imageUri);
      setPlacesWithItems(placesWithItems.map(p => 
        p.id === placeId 
          ? { 
              ...p, 
              items: p.items.map(item => 
                item.id === itemId ? { ...item, imageUrl } : item
              )
            }
          : p
      ));
      return imageUrl;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      showToast(error.message || 'فشل رفع الصورة', 'error');
      return null;
    } finally {
      setUploadingImageForItem(null);
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

  const handleSmartSelection = async (placeId: string) => {
    if (!userLocation) {
      showToast('يجب السماح بالوصول للموقع لاستخدام التحديد الذكي', 'warning');
      return;
    }

    setFindingPlace(placeId);
    try {
      // جلب اسم المدينة من الموقع الحالي
      const cityName = await getCityFromLocation(userLocation.lat, userLocation.lon);
      console.log('Customer city:', cityName);

      // البحث عن أقرب مول أو سوق
      let query = supabase
        .from('places')
        .select('*')
        .in('type', ['mall', 'market'])
        .limit(100);

      const { data: malls, error: mallsError } = await query;

      if (mallsError) {
        console.error('Error fetching places:', mallsError);
        throw mallsError;
      }

      // فلترة الأماكن التي لديها إحداثيات
      let placesWithLocation = (malls || []).filter((place: any) => 
        place.latitude != null && place.longitude != null
      );

      // إذا كان لدينا اسم المدينة، نفلتر الأماكن حسب المدينة
      if (cityName && placesWithLocation.length > 0) {
        // نبحث في العنوان عن اسم المدينة
        const cityPlaces = placesWithLocation.filter((place: any) => {
          const address = (place.address || '').toLowerCase();
          const name = (place.name || '').toLowerCase();
          const cityLower = cityName.toLowerCase();
          
          // البحث عن اسم المدينة في العنوان أو الاسم
          return address.includes(cityLower) || name.includes(cityLower);
        });

        // إذا وجدنا أماكن في المدينة، نستخدمها
        if (cityPlaces.length > 0) {
          placesWithLocation = cityPlaces;
        } else {
          // إذا لم نجد أماكن في المدينة، نستخدم جميع الأماكن من قاعدة البيانات
          console.log(`No places found in ${cityName}, using all places from database`);
          placesWithLocation = (malls || []).filter((place: any) => 
            place.latitude != null && place.longitude != null
          );
        }
      }

      if (placesWithLocation.length === 0) {
        showToast('لا توجد مولات أو أسواق متاحة مع مواقع محددة', 'warning');
        return;
      }

      // حساب المسافة لكل مكان واختيار الأقرب
      let nearestPlace: Place | null = null;
      let minDistance = Infinity;

      placesWithLocation.forEach((place: any) => {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lon,
          place.latitude,
          place.longitude
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestPlace = {
            id: place.id,
            name: place.name,
            address: place.address || '',
            type: place.type,
            latitude: place.latitude,
            longitude: place.longitude,
          };
        }
      });

      if (nearestPlace) {
        const placeToSet: Place = nearestPlace;
        setPlacesWithItems(placesWithItems.map(p => 
          p.id === placeId ? { ...p, place: placeToSet } : p
        ));
        showToast(`تم اختيار ${placeToSet.name} (${minDistance.toFixed(1)} كم)`, 'success');
      } else {
        showToast('لم يتم العثور على مكان قريب', 'warning');
      }
    } catch (error: any) {
      console.error('Error finding nearest place:', error);
      showToast('فشل البحث عن أقرب مكان', 'error');
    } finally {
      setFindingPlace(null);
    }
  };

  const handleOpenDirectory = (placeId: string) => {
    router.push({
      pathname: '/customer/places-directory',
      params: { placeId, itemId: placeId, returnPath: '/orders/outside-order' }, // itemId للتوافق
    });
  };


  // التحقق من اختيار مكان عند العودة من الدليل
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      
      const checkSelectedPlaces = async () => {
        if (!isMounted) return;
        
        const updatedPlaces = [...placesWithItems];
        let hasChanges = false;
        
        // أولاً: التحقق من المكان المختار لتحديث الموقع (من CurrentLocationDisplay)
        const locationPlace = localStorage.getItem('selected_place_for_location');
        if (locationPlace) {
          const place = JSON.parse(locationPlace);
          console.log('Found selected_place_for_location:', place);
          // تحديث الموقع الحالي بالإحداثيات من المكان المختار
          if (place.latitude && place.longitude) {
            console.log('Updating location to:', place.latitude, place.longitude);
            if (isMounted) {
              const newLocation = {
                lat: place.latitude,
                lon: place.longitude,
              };
              const newLocationDisplay = {
                lat: place.latitude,
                lon: place.longitude,
                address: place.name || place.address,
              };
              setUserLocation(newLocation);
              setCurrentLocationDisplay(newLocationDisplay);
              setIsManualLocation(true); // تحديد أن الموقع تم اختياره يدوياً
              console.log('Set isManualLocation = true and currentLocationDisplay =', newLocationDisplay);
              // لا نستدعي handleLocationUpdate هنا لأننا لا نريد أن يتم استبداله لاحقاً
            }
          }
          localStorage.removeItem('selected_place_for_location');
        }
        
        if (!isMounted) return;
        
        // ثانياً: التحقق من الأماكن المحددة لكل placeId
        for (let i = 0; i < updatedPlaces.length; i++) {
          const placeWithItems = updatedPlaces[i];
          const storedPlace = localStorage.getItem(`selected_place_${placeWithItems.id}`);
          if (storedPlace) {
            const place = JSON.parse(storedPlace);
            updatedPlaces[i] = { ...placeWithItems, place };
            localStorage.removeItem(`selected_place_${placeWithItems.id}`);
            hasChanges = true;
          }
        }
        
        // ثالثاً: التحقق من الاختيار العام (من أزرار اختيار المكان في القائمة)
        const generalPlace = localStorage.getItem('selected_place_general');
        if (generalPlace) {
          const place = JSON.parse(generalPlace);
          // إضافة المكان إلى أول مكان فارغ
          const firstEmptyIndex = updatedPlaces.findIndex(p => !p.place);
          if (firstEmptyIndex !== -1) {
            updatedPlaces[firstEmptyIndex] = { ...updatedPlaces[firstEmptyIndex], place };
            hasChanges = true;
          } else {
            // إذا لم يكن هناك مكان فارغ، نضيف مكان جديد
            updatedPlaces.push({ 
              id: Date.now().toString(), 
              place, 
              items: [] 
            });
            hasChanges = true;
          }
          localStorage.removeItem('selected_place_general');
        }
        
        if (hasChanges && isMounted) {
          setPlacesWithItems(updatedPlaces);
        }
      };
      
      checkSelectedPlaces();
      
      return () => {
        isMounted = false;
      };
    }, [placesWithItems.length]) // نستخدم length فقط لتجنب re-render غير ضروري
  );

  const handleSubmit = async () => {
    // التحقق من وجود أماكن محددة
    const placesWithValidData = placesWithItems.filter(p => 
      p.place && p.items.length > 0 && p.items.some(item => item.name.trim())
    );
    
    if (placesWithValidData.length === 0) {
      showToast('الرجاء تحديد مكان واحد على الأقل وإدخال عنصر واحد على الأقل', 'error');
      return;
    }

    // التحقق من وجود أماكن بدون عناصر
    const placesWithoutItems = placesWithItems.filter(p => 
      p.place && (!p.items.length || !p.items.some(item => item.name.trim()))
    );
    if (placesWithoutItems.length > 0) {
      showToast('الرجاء إدخال عناصر للأماكن المحددة', 'warning');
      return;
    }

    setLoading(true);
    try {
      // 0. رفع الصور لكل عنصر (إذا لم تكن مرفوعة بالفعل)
      const uploadPromises: Array<Promise<{ placeId: string; itemId: string; imageUrl: string | null }>> = [];
      
      placesWithValidData.forEach(placeWithItems => {
        placeWithItems.items.forEach(item => {
          if (item.imageUri && !item.imageUrl) {
            uploadPromises.push(
              uploadImageForItem(placeWithItems.id, item.id, item.imageUri)
                .then(imageUrl => ({ placeId: placeWithItems.id, itemId: item.id, imageUrl }))
                .catch(() => ({ placeId: placeWithItems.id, itemId: item.id, imageUrl: null }))
            );
          }
        });
      });

      // انتظار رفع جميع الصور وتحديث state
      if (uploadPromises.length > 0) {
        const uploadResults = await Promise.all(uploadPromises);
        uploadResults.forEach(({ placeId, itemId, imageUrl }) => {
          if (imageUrl) {
            setPlacesWithItems(prev => prev.map(p => 
              p.id === placeId 
                ? { 
                    ...p, 
                    items: p.items.map(item => 
                      item.id === itemId ? { ...item, imageUrl } : item
                    )
                  }
                : p
            ));
          }
        });
        // انتظار قصير لضمان تحديث state
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // تحديث placesWithValidData بعد رفع الصور
      const updatedPlacesWithItems = placesWithItems.filter(p => 
        p.place && p.items.length > 0 && p.items.some(item => item.name.trim())
      );

      // 1. استخدام الموقع من أعلى الصفحة (CurrentLocationDisplay)
      // إذا لم يكن متاحاً، نستخدم userLocation
      const customerLocation = currentLocationDisplay 
        ? { lat: currentLocationDisplay.lat, lon: currentLocationDisplay.lon, address: currentLocationDisplay.address }
        : userLocation 
        ? { lat: userLocation.lat, lon: userLocation.lon, address: 'موقعي الحالي' }
        : null;
      
      if (!customerLocation) {
        throw new Error('الرجاء السماح بالوصول للموقع أولاً');
      }
      
      // جلب عنوان نصي للعميل (لحفظه في قاعدة البيانات)
      const customerAddressText = customerLocation.address || 'موقع العميل';

      // 2. تجميع العناصر حسب مكان الالتقاط (مع الصور)
      const itemsByPlace: { [placeId: string]: { place: Place; items: { name: string; imageUrl?: string }[] } } = {};
      
      updatedPlacesWithItems.forEach(placeWithItems => {
        if (placeWithItems.place) {
          const placeId = placeWithItems.place.id;
          const validItems = placeWithItems.items
            .filter(item => item.name.trim())
            .map(item => ({
              name: item.name.trim(),
              imageUrl: item.imageUrl || undefined,
            }));
          
          if (validItems.length > 0) {
            itemsByPlace[placeId] = {
              place: placeWithItems.place,
              items: validItems,
            };
          }
        }
      });

      // 3. ترتيب الأماكن من الأبعد للأقرب
      const placesArray = Object.values(itemsByPlace).map(({ place }) => place);
      console.log(`📍 عدد الأماكن المختارة: ${placesArray.length}`);
      
      // ترتيب الأماكن من الأبعد للأقرب
      const placesOrdered = orderPlacesByDistance(placesArray, customerLocation);
      console.log(`📍 الأماكن مرتبة من الأبعد للأقرب: ${placesOrdered.length} مكان`);
      
      // إيجاد أبعد مكان (للبحث عن السائقين بجانبه)
      const farthestPlace = findFarthestPlaceFromCustomer(placesArray, customerLocation);
      
      if (farthestPlace) {
        console.log(`📍 أبعد مكان تم إيجاده: (${farthestPlace.lat.toFixed(6)}, ${farthestPlace.lon.toFixed(6)})`);
      } else {
        console.log('⚠️ لم يتم إيجاد أبعد مكان');
      }
      
      // حساب السعر بناءً على القواعد الجديدة
      // المسافة = من أبعد مكان → المكان التالي → ... → مكان العميل
      // حساب إجمالي عدد العناصر (كل عنصر = طلب واحد)
      const totalItemsCount = Object.values(itemsByPlace).reduce(
        (total, { items }) => total + items.length,
        0
      );
      console.log(`📦 إجمالي عدد العناصر (الطلبات): ${totalItemsCount}`);
      
      let basePrice = 0;
      if (placesOrdered.length > 0 && customerLocation) {
        const totalDistance = calculateTotalDistance(
          placesOrdered,
          { lat: customerLocation.lat, lon: customerLocation.lon }
        );
        basePrice = calculateDeliveryPrice(totalItemsCount, totalDistance);
      } else {
        // إذا لم تكن هناك إحداثيات، نستخدم سعر افتراضي
        basePrice = calculateDeliveryPrice(totalItemsCount, 3);
      }
      
      // استخدام السعر المحسوب مباشرة (بدون تفاوض)
      setSelectedPrice(basePrice);
      
      // إرسال الطلب مباشرة - تمرير السعر مباشرة
      await handleConfirmPriceAndSubmit(basePrice);
    } catch (error: any) {
      console.error('❌ Error in handleSubmit:', error);
      setLoading(false);
      showToast(error.message || 'فشل إرسال الطلب', 'error');
    }
  };

  // دالة لإرسال الطلبات بعد اختيار السعر
  const handleConfirmPriceAndSubmit = async (price?: number) => {
    const finalPrice = price || selectedPrice;
    
    if (!finalPrice) {
      showToast('الرجاء اختيار سعر', 'error');
      setLoading(false);
      return;
    }

    setLoading(true);
    
    try {
      // إعادة حساب كل شيء (نفس الكود من handleSubmit)
      const updatedPlacesWithItems = placesWithItems.filter(p => 
        p.place && p.items.length > 0 && p.items.some(item => item.name.trim())
      );

      // استخدام الموقع من أعلى الصفحة (CurrentLocationDisplay)
      const customerLocation = currentLocationDisplay 
        ? { lat: currentLocationDisplay.lat, lon: currentLocationDisplay.lon, address: currentLocationDisplay.address }
        : userLocation 
        ? { lat: userLocation.lat, lon: userLocation.lon, address: 'موقعي الحالي' }
        : null;
      
      if (!customerLocation) {
        throw new Error('الرجاء السماح بالوصول للموقع أولاً');
      }
      
      const customerAddressText = customerLocation.address || 'موقع العميل';

      const itemsByPlace: { [placeId: string]: { place: Place; items: { name: string; imageUrl?: string }[] } } = {};
      updatedPlacesWithItems.forEach(placeWithItems => {
        if (placeWithItems.place) {
          const placeId = placeWithItems.place.id;
          const validItems = placeWithItems.items
            .filter(item => item.name.trim())
            .map(item => ({
              name: item.name.trim(),
              imageUrl: item.imageUrl || undefined,
            }));
          
          if (validItems.length > 0) {
            itemsByPlace[placeId] = {
              place: placeWithItems.place,
              items: validItems,
            };
          }
        }
      });

      // 3. ترتيب الأماكن من الأبعد للأقرب
      const placesArray = Object.values(itemsByPlace).map(({ place }) => place);
      console.log(`📍 عدد الأماكن المختارة: ${placesArray.length}`);
      
      // ترتيب الأماكن من الأبعد للأقرب
      const placesOrdered = orderPlacesByDistance(placesArray, customerLocation);
      console.log(`📍 الأماكن مرتبة من الأبعد للأقرب: ${placesOrdered.length} مكان`);
      
      // إيجاد أبعد مكان (للبحث عن السائقين بجانبه)
      const farthestPlace = findFarthestPlaceFromCustomer(placesArray, customerLocation);
      
      if (farthestPlace) {
        console.log(`📍 أبعد مكان تم إيجاده: (${farthestPlace.lat.toFixed(6)}, ${farthestPlace.lon.toFixed(6)})`);
      } else {
        console.log('⚠️ لم يتم إيجاد أبعد مكان');
      }

      // 5. إنشاء طلب واحد يحتوي على جميع الأماكن كمسار متعدد النقاط
      // ترتيب الأماكن حسب المسافة من العميل (من الأبعد للأقرب)
      // استخدام placesArray وترتيبها بنفس ترتيب placesOrdered
      const placesWithDistance = placesArray
        .filter(p => p.latitude && p.longitude)
        .map(place => ({
          place,
          distance: calculateDistance(
            customerLocation.lat,
            customerLocation.lon,
            place.latitude!,
            place.longitude!
          )
        }));
      
      placesWithDistance.sort((a, b) => b.distance - a.distance); // ترتيب تنازلي (من الأبعد للأقرب)
      
      const routePoints = placesWithDistance
        .map(({ place }) => {
          const placeData = itemsByPlace[place.id];
          if (!placeData) return null;
          
          const itemNames = placeData.items.map(item => item.name);
          const itemImages = placeData.items
            .map(item => item.imageUrl)
            .filter((url): url is string => !!url);
          
          return {
            address: place.name + (place.address ? ` - ${place.address}` : ''),
            description: itemNames.join(', '), // أسماء العناصر مفصولة بفواصل
            items: itemNames, // حفظ أسماء العناصر أيضاً
            images: itemImages.length > 0 ? itemImages : null,
          };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null);
      
      if (routePoints.length === 0) {
        throw new Error('لا توجد أماكن صالحة لإنشاء الطلب');
      }
      
      // إضافة عنوان العميل كنقطة وصول نهائية
      routePoints.push({
        address: customerAddressText,
        description: 'عنوان التوصيل',
        items: [],
        images: null,
      });
      
      // جمع جميع الصور من جميع الأماكن
      const allImages = routePoints
        .map(point => point.images)
        .filter((images): images is string[] => images !== null)
        .flat();
      
      // استخدام Edge Function لإنشاء الطلب (لتجاوز RLS)
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('create-order', {
        body: {
          customerId: user?.id,
          vendorId: null,
          driverId: null, // سيتم البحث عن سائق تلقائياً
          items: routePoints, // حفظ المسار الكامل في items
          status: 'pending', // دائماً pending حتى يظهر في قائمة الطلبات الجديدة ويتلقى السائق الإشعار
          pickupAddress: routePoints[0]?.address || 'نقطة الانطلاق', // أول نقطة
          deliveryAddress: routePoints[routePoints.length - 1]?.address || customerAddressText, // آخر نقطة (عنوان العميل)
          totalFee: finalPrice, // استخدام السعر المختار
          images: allImages.length > 0 ? allImages : null,
          orderType: 'outside', // تحديد نوع الطلب كطلب من خارج
          createdByRole: user?.role || 'customer', // من أنشأ الطلب
        },
      });

      if (edgeFunctionError) {
        console.error('❌ Error creating order via Edge Function:', edgeFunctionError);
        throw edgeFunctionError;
      }

      if (!edgeFunctionData || !edgeFunctionData.success) {
        console.error('❌ Edge Function returned error:', edgeFunctionData?.error);
        throw new Error(edgeFunctionData?.error || 'فشل إنشاء الطلب');
      }

      console.log('✅ Order created successfully:', edgeFunctionData.order?.id);

      const message = 'تم إرسال طلبك بنجاح! سيظهر الطلب للسائقين قريباً.';
      
      // إيقاف loading قبل التوجيه
      setLoading(false);
      
      // التوجيه حسب دور المستخدم
      try {
      if (user?.role === 'driver') {
          router.replace('/(tabs)/driver/trips');
      } else if (user?.role === 'admin') {
        router.replace('/(tabs)/admin/my-orders');
      } else {
        router.replace('/(tabs)/customer/my-orders');
      }
      
        // عرض رسالة النجاح بعد التوجيه
      setTimeout(() => {
        showToast(message, 'success');
      }, 300);
      } catch (navError) {
        console.error('❌ Navigation error:', navError);
        showToast(message, 'success');
      }
    } catch (error: any) {
      console.error('❌ Error in handleConfirmPriceAndSubmit:', error);
      setLoading(false);
      showToast(error.message || 'فشل إرسال الطلب', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            // التوجيه حسب دور المستخدم
            if (user?.role === 'driver') {
              router.replace('/(tabs)/driver/dashboard');
            } else if (user?.role === 'admin') {
              router.replace('/(tabs)/admin/dashboard');
            } else {
              router.replace('/(tabs)/customer/home');
            }
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('customer.outsideOrder')}</Text>
      </View>

      <CurrentLocationDisplay 
        onLocationUpdate={(location) => {
          // إذا كان الموقع تم اختياره يدوياً، لا نحدثه تلقائياً
          console.log('onLocationUpdate called in outside-order:', {
            isManualLocation,
            currentLocationDisplay,
            incomingLocation: location
          });
          if (!isManualLocation) {
            handleLocationUpdate(location);
          } else {
            console.log('Skipping handleLocationUpdate because isManualLocation = true');
          }
        }}
        externalLocation={currentLocationDisplay}
        onOpenPlacesDirectory={() => {
          // فتح دليل الأماكن لتحديث الموقع الحالي
          router.push({
            pathname: '/customer/places-directory',
            params: { 
              returnPath: '/orders/outside-order',
              fromLocationDisplay: 'true' // معرف خاص للتمييز
            },
          });
        }}
        onManualRefresh={() => {
          // عند التحديث اليدوي، نعيد تعيين isManualLocation إلى false
          // حتى يتم السماح بالتحديثات التلقائية مرة أخرى
          setIsManualLocation(false);
        }}
      />

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {placesWithItems.map((placeWithItems, placeIndex) => (
          <View key={placeWithItems.id} style={styles.placeContainer}>
            {/* عنوان المكان */}
            <View style={styles.placeHeader}>
              <Text style={styles.placeTitle}>
                {placeWithItems.place ? placeWithItems.place.name : `مكان ${placeIndex + 1}`}
              </Text>
              {placesWithItems.length > 1 && (
                <TouchableOpacity
                  onPress={() => removePlace(placeWithItems.id)}
                  style={styles.removePlaceButton}
                >
                  <Ionicons name="close-circle" size={24} color="#FF3B30" />
                </TouchableOpacity>
              )}
            </View>

            {/* اختيار المكان */}
            <View style={styles.pickupSection}>
              {placeWithItems.place ? (
                <View style={styles.selectedPlaceCard}>
                  <View style={styles.selectedPlaceInfo}>
                    <Text style={styles.selectedPlaceName}>{placeWithItems.place.name}</Text>
                    <Text style={styles.selectedPlaceAddress}>{placeWithItems.place.address}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPlacesWithItems(placesWithItems.map(p => 
                      p.id === placeWithItems.id ? { ...p, place: null, items: [] } : p
                    ))}
                    style={styles.removePlaceButton}
                  >
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.placeButtonsRow}>
                  <TouchableOpacity
                    style={[styles.placeButton, styles.smartButton]}
                    onPress={() => handleSmartSelection(placeWithItems.id)}
                    disabled={findingPlace === placeWithItems.id}
                  >
                    {findingPlace === placeWithItems.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={18} color="#fff" />
                        <Text style={styles.placeButtonText}>التحديد الذكي</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.placeButton, styles.directoryButton]}
                    onPress={() => handleOpenDirectory(placeWithItems.id)}
                  >
                    <Ionicons name="list" size={18} color="#fff" />
                    <Text style={styles.placeButtonText}>الدليل</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* قائمة العناصر للمكان */}
            {placeWithItems.place && (
              <View style={styles.itemsSection}>
                <Text style={styles.itemsLabel}>العناصر من {placeWithItems.place.name}</Text>
                {placeWithItems.items.map((item) => (
          <View key={item.id} style={styles.itemContainer}>
            <View style={styles.itemRow}>
              <TextInput
                style={styles.itemInput}
                        placeholder="اسم العنصر"
                value={item.name}
                        onChangeText={(value) => updateItemInPlace(placeWithItems.id, item.id, value)}
                placeholderTextColor="#999"
                textAlign="right"
              />
              
                      {/* صورة العنصر بجانب حقل النص */}
                      {item.imageUri || item.imageUrl ? (
                  <TouchableOpacity
                          style={styles.itemImageButton}
                          onPress={() => {
                            console.log('Image preview pressed:', { placeId: placeWithItems.id, itemId: item.id });
                            setPreviewImage({
                              uri: item.imageUrl || item.imageUri || '',
                              placeId: placeWithItems.id,
                              itemId: item.id,
                            });
                          }}
                          disabled={uploadingImageForItem === item.id}
                          activeOpacity={0.7}
                        >
                          <View style={styles.itemImageContainer}>
                            <Image 
                              source={{ uri: item.imageUrl || item.imageUri }} 
                              style={styles.itemImagePreview} 
                            />
                  <TouchableOpacity
                              style={styles.removeImageButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                removeImageFromItem(placeWithItems.id, item.id);
                              }}
                  >
                    <Ionicons name="close-circle" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                            {item.imageUri && !item.imageUrl && uploadingImageForItem === item.id && (
                              <View style={styles.uploadingOverlay}>
                                <ActivityIndicator size="small" color="#007AFF" />
                </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.addImageButtonSmall}
                          onPress={() => {
                            console.log('Camera button pressed:', { placeId: placeWithItems.id, itemId: item.id });
                            pickImageForItem(placeWithItems.id, item.id);
                          }}
                          disabled={uploadingImageForItem === item.id}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="camera" size={24} color="#007AFF" />
                        </TouchableOpacity>
                      )}
                      
                <TouchableOpacity
                        onPress={() => removeItemFromPlace(placeWithItems.id, item.id)}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={24} color="#FF3B30" />
                </TouchableOpacity>
            </View>
                  </View>
                ))}
                    <TouchableOpacity
                  style={styles.addItemButton}
                  onPress={() => addItemToPlace(placeWithItems.id)}
                    >
                  <Ionicons name="add-circle" size={20} color="#007AFF" />
                  <Text style={styles.addItemButtonText}>إضافة عنصر</Text>
                    </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addPlace}>
          <Ionicons name="add-circle" size={24} color="#007AFF" />
          <Text style={styles.addButtonText}>إضافة مكان آخر</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading || uploadingImageForItem !== null}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>إرسال الطلب</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal لاختيار مصدر الصورة */}
      <Modal
        visible={showImageSourceModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowImageSourceModal(false);
          setSelectedPlaceId(null);
          setSelectedItemId(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowImageSourceModal(false);
            setSelectedPlaceId(null);
            setSelectedItemId(null);
          }}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>اختر مصدر الصورة</Text>
            <Text style={styles.modalSubtitle}>من أين تريد اختيار الصورة؟</Text>
            
            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleOpenCamera}
            >
              <Ionicons name="camera" size={24} color="#007AFF" />
              <Text style={styles.modalOptionText}>الكاميرا</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleOpenImageLibrary}
            >
              <Ionicons name="images" size={24} color="#007AFF" />
              <Text style={styles.modalOptionText}>المعرض</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setShowImageSourceModal(false);
                setSelectedPlaceId(null);
                setSelectedItemId(null);
              }}
            >
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal لعرض الصورة بشكل كبير */}
      <Modal
        visible={previewImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.imagePreviewModal}>
          <TouchableOpacity
            style={styles.imagePreviewCloseButton}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          {previewImage && (
            <>
              <Image 
                source={{ uri: previewImage.uri }} 
                style={styles.imagePreviewImage}
                resizeMode="contain"
              />
              
              <View style={styles.imagePreviewActions}>
                <TouchableOpacity
                  style={styles.imagePreviewActionButton}
                  onPress={() => {
                    if (previewImage) {
                      setPreviewImage(null);
                      pickImageForItem(previewImage.placeId, previewImage.itemId);
                    }
                  }}
                >
                  <Ionicons name="camera" size={20} color="#fff" />
                  <Text style={styles.imagePreviewActionText}>تغيير الصورة</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.imagePreviewActionButton, styles.imagePreviewDeleteButton]}
                  onPress={() => {
                    if (previewImage) {
                      removeImageFromItem(previewImage.placeId, previewImage.itemId);
                      setPreviewImage(null);
                    }
                  }}
                >
                  <Ionicons name="trash" size={20} color="#fff" />
                  <Text style={styles.imagePreviewActionText}>حذف</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

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
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#1a1a1a',
  },
  content: {
    flex: 1,
    padding: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
    textAlign: 'right',
  },
  placeContainer: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  placeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  itemsSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  itemsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    textAlign: 'right',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    marginTop: 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  addItemButtonText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  addImageButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  itemContainer: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 0,
  },
  itemInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  removeButton: {
    marginLeft: 2,
  },
  pickupSection: {
    marginTop: 4,
  },
  placeButtonsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  placeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  smartButton: {
    backgroundColor: '#007AFF',
  },
  directoryButton: {
    backgroundColor: '#34C759',
  },
  placeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedPlaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  selectedPlaceInfo: {
    flex: 1,
  },
  selectedPlaceName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
    textAlign: 'right',
  },
  selectedPlaceAddress: {
    fontSize: 11,
    color: '#666',
    textAlign: 'right',
  },
  removePlaceButton: {
    marginLeft: 6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    marginBottom: 12,
  },
  addButtonText: {
    fontSize: 15,
    color: '#007AFF',
    marginLeft: 6,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  itemImageButton: {
    marginLeft: 4,
  },
  itemImageContainer: {
    position: 'relative',
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  itemImagePreview: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  addImageButtonSmall: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 12,
    zIndex: 10,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
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
    padding: 16,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
  },
  modalOptionText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  modalCancelButton: {
    marginTop: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    color: '#FF3B30',
    fontWeight: '600',
  },
  imagePreviewModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
  imagePreviewImage: {
    width: '100%',
    height: '70%',
  },
  imagePreviewActions: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  imagePreviewActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
  },
  imagePreviewDeleteButton: {
    backgroundColor: '#FF3B30',
  },
  imagePreviewActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
