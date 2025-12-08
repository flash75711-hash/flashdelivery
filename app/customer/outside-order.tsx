import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
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
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadImageToImgBB } from '@/lib/imgbb';

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
  const [findingPlace, setFindingPlace] = useState<string | null>(null);
  const [uploadingImageForItem, setUploadingImageForItem] = useState<string | null>(null); // itemId الذي يتم رفع صورته
  const [showImageSourceModal, setShowImageSourceModal] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ uri: string; placeId: string; itemId: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  // استقبال الموقع من CurrentLocationDisplay
  const handleLocationUpdate = (location: { lat: number; lon: number; address: string } | null) => {
    if (location) {
      setUserLocation({
        lat: location.lat,
        lon: location.lon,
      });
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
      // لذلك نستخدم الصورة مباشرة أو نحولها إلى base64
      if (Platform.OS === 'web' && imageUri.startsWith('blob:')) {
        // على الويب، نستخدم blob URL مباشرة
        // يمكن تحويلها إلى base64 إذا لزم الأمر
        finalImageUri = imageUri;
      } else {
        // على الموبايل: ضغط الصورة وتحسينها باستخدام ImageManipulator
        try {
          const manipulatedImage = await ImageManipulator.manipulateAsync(
            imageUri,
            [
              // تقليل الحجم إذا كانت الصورة كبيرة (أقصى عرض 1200px)
              { resize: { width: 1200 } },
            ],
            {
              compress: 0.7, // ضغط بنسبة 70%
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );
          finalImageUri = manipulatedImage.uri;
        } catch (manipulatorError: any) {
          console.warn('ImageManipulator failed, using original image:', manipulatorError);
          // إذا فشل ImageManipulator، نستخدم الصورة الأصلية
          finalImageUri = imageUri;
        }
      }

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
      Alert.alert('خطأ', 'فشل معالجة الصورة');
    }
  };

  // فتح الكاميرا لالتقاط صورة
  const openCamera = async (placeId: string, itemId: string) => {
    try {
      console.log('openCamera called:', { placeId, itemId, platform: Platform.OS });
      
      // في Web، الكاميرا قد لا تعمل بشكل صحيح
      if (Platform.OS === 'web') {
        Alert.alert(
          'تنبيه',
          'الكاميرا غير متاحة في المتصفح. يرجى استخدام المعرض لاختيار صورة.',
          [{ text: 'حسناً', onPress: () => openImageLibrary(placeId, itemId) }]
        );
        return;
      }
      
      // طلب أذونات الكاميرا
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      console.log('Camera permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert(
          'تنبيه',
          'يجب السماح بالوصول إلى الكاميرا لالتقاط الصور',
          [
            {
              text: 'إعدادات',
              onPress: () => {
                // يمكن فتح إعدادات التطبيق هنا
                console.log('Open settings');
              },
            },
            {
              text: 'إلغاء',
              style: 'cancel',
            },
          ]
        );
        return;
      }

      console.log('Launching camera...');
      // @ts-ignore - MediaTypeOptions deprecated but still works
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      console.log('Camera result:', { canceled: result.canceled, hasAssets: !!result.assets?.[0] });

      if (!result.canceled && result.assets && result.assets[0]) {
        console.log('Processing image from camera...');
        await processSelectedImage(result.assets[0].uri, placeId, itemId);
      } else {
        console.log('Camera was canceled or no image selected');
      }
    } catch (error: any) {
      console.error('Error opening camera:', error);
      Alert.alert('خطأ', `فشل فتح الكاميرا: ${error.message || 'خطأ غير معروف'}`);
    }
  };

  // فتح المعرض لاختيار صورة
  const openImageLibrary = async (placeId: string, itemId: string) => {
    try {
      console.log('openImageLibrary called:', { placeId, itemId, platform: Platform.OS });
      
      // معالجة خاصة للويب
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        return new Promise<void>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.style.display = 'none';
          
          input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                // إنشاء URL محلي للصورة
                const imageUri = URL.createObjectURL(file);
                console.log('File selected on web:', file.name);
                await processSelectedImage(imageUri, placeId, itemId);
                resolve();
              } catch (error: any) {
                console.error('Error processing file on web:', error);
                Alert.alert('خطأ', `فشل معالجة الصورة: ${error.message || 'خطأ غير معروف'}`);
                resolve();
              }
            } else {
              console.log('No file selected on web');
              resolve();
            }
            if (document.body.contains(input)) {
              document.body.removeChild(input);
            }
          };
          
          input.oncancel = () => {
            console.log('File picker canceled on web');
            if (document.body.contains(input)) {
              document.body.removeChild(input);
            }
            resolve();
          };
          
          document.body.appendChild(input);
          input.click();
        });
      }
      
      // للموبايل: استخدام expo-image-picker
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('Media library permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert(
          'تنبيه',
          'يجب السماح بالوصول إلى الصور لاختيار صورة',
          [
            {
              text: 'إعدادات',
              onPress: () => {
                console.log('Open settings');
              },
            },
            {
              text: 'إلغاء',
              style: 'cancel',
            },
          ]
        );
        return;
      }
    
      console.log('Launching image library...');
      // @ts-ignore - MediaTypeOptions deprecated but still works
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      console.log('Image library result:', { canceled: result.canceled, hasAssets: !!result.assets?.[0] });

      if (!result.canceled && result.assets && result.assets[0]) {
        console.log('Processing image from library...');
        await processSelectedImage(result.assets[0].uri, placeId, itemId);
      } else {
        console.log('Image library was canceled or no image selected');
      }
    } catch (error: any) {
      console.error('Error opening image library:', error);
      Alert.alert('خطأ', `فشل فتح المعرض: ${error.message || 'خطأ غير معروف'}`);
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
      Alert.alert('خطأ', error.message || 'فشل رفع الصورة');
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
      Alert.alert('تنبيه', 'يجب السماح بالوصول للموقع لاستخدام التحديد الذكي');
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
        Alert.alert('تنبيه', 'لا توجد مولات أو أسواق متاحة مع مواقع محددة');
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
        Alert.alert('نجح', `تم اختيار ${placeToSet.name} (${minDistance.toFixed(1)} كم)`);
      } else {
        Alert.alert('تنبيه', 'لم يتم العثور على مكان قريب');
      }
    } catch (error: any) {
      console.error('Error finding nearest place:', error);
      Alert.alert('خطأ', 'فشل البحث عن أقرب مكان');
    } finally {
      setFindingPlace(null);
    }
  };

  const handleOpenDirectory = (placeId: string) => {
    router.push({
      pathname: '/customer/places-directory',
      params: { placeId, itemId: placeId, returnPath: '/customer/outside-order' }, // itemId للتوافق
    });
  };


  // التحقق من اختيار مكان عند العودة من الدليل
  useFocusEffect(
    useCallback(() => {
      const checkSelectedPlaces = async () => {
        const updatedPlaces = [...placesWithItems];
        let hasChanges = false;
        
        for (let i = 0; i < updatedPlaces.length; i++) {
          const placeWithItems = updatedPlaces[i];
          const storedPlace = await AsyncStorage.getItem(`selected_place_${placeWithItems.id}`);
          if (storedPlace) {
            const place = JSON.parse(storedPlace);
            updatedPlaces[i] = { ...placeWithItems, place };
            await AsyncStorage.removeItem(`selected_place_${placeWithItems.id}`);
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          setPlacesWithItems(updatedPlaces);
        }
      };
      checkSelectedPlaces();
    }, [placesWithItems.length])
  );

  const handleSubmit = async () => {
    // التحقق من وجود أماكن محددة
    const placesWithValidData = placesWithItems.filter(p => 
      p.place && p.items.length > 0 && p.items.some(item => item.name.trim())
    );
    
    if (placesWithValidData.length === 0) {
      Alert.alert('خطأ', 'الرجاء تحديد مكان واحد على الأقل وإدخال عنصر واحد على الأقل');
      return;
    }

    // التحقق من وجود أماكن بدون عناصر
    const placesWithoutItems = placesWithItems.filter(p => 
      p.place && (!p.items.length || !p.items.some(item => item.name.trim()))
    );
    if (placesWithoutItems.length > 0) {
      Alert.alert('تنبيه', 'الرجاء إدخال عناصر للأماكن المحددة');
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

      // 1. جلب عنوان العميل الافتراضي
      let customerAddress: any = null;
      
      try {
        const { data: defaultAddresses, error: addressError } = await supabase
          .from('customer_addresses')
          .select('*')
          .eq('customer_id', user?.id)
          .eq('is_default', true)
          .limit(1);

        if (addressError) {
          console.warn('Error fetching default address:', addressError);
        } else if (defaultAddresses && defaultAddresses.length > 0) {
          customerAddress = defaultAddresses[0];
        }
        
        if (!customerAddress) {
          const { data: anyAddresses, error: anyAddressError } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', user?.id)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (anyAddressError) {
            throw new Error('الرجاء إضافة عنوان توصيل في ملفك الشخصي أولاً');
          }
          
          if (anyAddresses && anyAddresses.length > 0) {
            customerAddress = anyAddresses[0];
          } else {
            throw new Error('الرجاء إضافة عنوان توصيل في ملفك الشخصي أولاً');
          }
        }
      } catch (error: any) {
        if (error.message?.includes('عنوان')) {
          throw error;
        }
        console.warn('Could not fetch address, continuing without it:', error);
      }

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

      // 3. جلب السائقين المتاحين
      const { data: allDrivers, error: driversError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'driver')
        .eq('status', 'active');

      let driversData: { driver_id: string; latitude: number; longitude: number }[] = [];
      
      if (!driversError && allDrivers && allDrivers.length > 0) {
        const driverIds = allDrivers.map(d => d.id);
        
        const { data: locationsData, error: locationsError } = await supabase
          .from('driver_locations')
          .select('driver_id, latitude, longitude')
          .in('driver_id', driverIds)
          .order('updated_at', { ascending: false });

        if (!locationsError && locationsData) {
          const latestLocations = new Map<string, { driver_id: string; latitude: number; longitude: number }>();
          locationsData.forEach(loc => {
            if (loc.latitude && loc.longitude && !latestLocations.has(loc.driver_id)) {
              latestLocations.set(loc.driver_id, {
                driver_id: loc.driver_id,
                latitude: loc.latitude,
                longitude: loc.longitude,
              });
            }
          });
          driversData = Array.from(latestLocations.values());
        }
      }

      // 4. اختيار السائق المناسب لكل مكان وإنشاء الطلبات
      const orders: any[] = [];
      
      Object.values(itemsByPlace).forEach(({ place, items: placeItems }) => {
      let selectedDriverId: string | null = null;
      
        if (driversData.length > 0 && place.latitude && place.longitude) {
          let minDistance = Infinity;
          driversData.forEach(driver => {
            if (driver.latitude && driver.longitude) {
              const distance = calculateDistance(
                driver.latitude,
                driver.longitude,
                place.latitude!,
                place.longitude!
              );
              if (distance <= maxDeliveryDistance && distance < minDistance) {
                minDistance = distance;
                selectedDriverId = driver.driver_id;
              }
            }
          });
        }

        const deliveryAddr = customerAddress?.full_address || customerAddress?.place_name || 'موقع العميل';
        
        // استخراج أسماء العناصر وروابط الصور
        const itemNames = placeItems.map(item => item.name);
        const itemImages = placeItems
          .map(item => item.imageUrl)
          .filter((url): url is string => !!url);
        
        orders.push({
          customer_id: user?.id,
          vendor_id: null,
          driver_id: selectedDriverId,
          items: itemNames,
          status: selectedDriverId ? 'accepted' : 'pending',
          pickup_address: place.name + (place.address ? ` - ${place.address}` : ''),
          delivery_address: deliveryAddr,
          total_fee: 0,
          images: itemImages.length > 0 ? itemImages : null,
        });
      });
      
      if (orders.length === 0) {
        throw new Error('لا توجد طلبات للإرسال');
      }
      
      const { data, error } = await supabase
        .from('orders')
        .insert(orders)
        .select();

      if (error) throw error;

      const hasAssignedDriver = orders.some(order => order.driver_id !== null);
      const message = orders.length === 1
        ? hasAssignedDriver 
            ? 'تم إرسال طلبك بنجاح! تم تعيين سائق تلقائياً.'
          : `تم إرسال طلبك بنجاح! سيتم إرساله للسائقين في نطاق ${maxDeliveryDistance} كم.`
        : hasAssignedDriver 
          ? `تم إرسال ${orders.length} طلب بنجاح! تم تعيين سائق تلقائياً.`
          : `تم إرسال ${orders.length} طلب بنجاح! بانتظار قبول السائق.`;
      
      router.replace('/(tabs)/customer/orders');
      
      setTimeout(() => {
        Alert.alert('✅ نجح', message);
      }, 300);
    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      Alert.alert('خطأ', error.message || 'فشل إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/customer/home');
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('customer.outsideOrder')}</Text>
      </View>

      <CurrentLocationDisplay onLocationUpdate={handleLocationUpdate} />

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
            <Text style={styles.submitButtonText}>{t('common.submit')}</Text>
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
