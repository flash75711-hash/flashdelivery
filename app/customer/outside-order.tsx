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
  Alert,
  ScrollView,
  Keyboard,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CurrentLocationDisplay from '@/components/CurrentLocationDisplay';

interface Vendor {
  id: string;
  name: string;
  address: string;
  phone: string;
}

interface OrderItem {
  id: string;
  name: string;
  vendor: Vendor | null;
}

export default function OutsideOrderScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const [items, setItems] = useState<OrderItem[]>([{ id: Date.now().toString(), name: '', vendor: null }]);
  const [searchQuery, setSearchQuery] = useState<{ [key: string]: string }>({});
  const [vendors, setVendors] = useState<{ [key: string]: Vendor[] }>({});
  const [searching, setSearching] = useState<{ [key: string]: boolean }>({});
  const [activeSearchItemId, setActiveSearchItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [maxDeliveryDistance, setMaxDeliveryDistance] = useState<number>(3); // المسافة القصوى بالكيلومتر (افتراضي 3)

  useEffect(() => {
    if (activeSearchItemId && searchQuery[activeSearchItemId] && searchQuery[activeSearchItemId].length > 2) {
      searchVendors(activeSearchItemId);
    } else if (activeSearchItemId) {
      setVendors(prev => ({ ...prev, [activeSearchItemId]: [] }));
    }
  }, [searchQuery, activeSearchItemId]);

  const searchVendors = async (itemId: string) => {
    const query = searchQuery[itemId];
    if (!query || query.length < 3) return;

    setSearching(prev => ({ ...prev, [itemId]: true }));
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .ilike('name', `%${query}%`)
        .limit(10);

      if (error) throw error;
      setVendors(prev => ({ ...prev, [itemId]: data || [] }));
    } catch (error) {
      console.error('Error searching vendors:', error);
    } finally {
      setSearching(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), name: '', vendor: null }]);
  };

  const updateItem = (itemId: string, value: string) => {
    setItems(items.map(item => 
      item.id === itemId ? { ...item, name: value } : item
    ));
  };

  const removeItem = (itemId: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== itemId));
      setSearchQuery(prev => {
        const newQuery = { ...prev };
        delete newQuery[itemId];
        return newQuery;
      });
      setVendors(prev => {
        const newVendors = { ...prev };
        delete newVendors[itemId];
        return newVendors;
      });
      if (activeSearchItemId === itemId) {
        setActiveSearchItemId(null);
      }
    }
  };

  const selectVendor = (itemId: string, vendor: Vendor) => {
    setItems(items.map(item => 
      item.id === itemId ? { ...item, vendor } : item
    ));
    setActiveSearchItemId(null);
    setSearchQuery(prev => {
      const newQuery = { ...prev };
      delete newQuery[itemId];
      return newQuery;
    });
    setVendors(prev => {
      const newVendors = { ...prev };
      delete newVendors[itemId];
      return newVendors;
    });
  };

  const handleSearchFocus = (itemId: string) => {
    setActiveSearchItemId(itemId);
  };

  // جلب المسافة القصوى للتوصيل من الإعدادات (أو استخدام القيمة الافتراضية)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // محاولة جلب الإعدادات من جدول settings (إذا كان موجوداً)
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
        // إذا لم يكن الجدول موجوداً، نستخدم القيمة الافتراضية
        console.log('Using default max delivery distance:', maxDeliveryDistance, 'km');
      }
    };
    loadSettings();
  }, []);

  // الاتصال بمزود الخدمة
  const callVendor = (phone: string) => {
    if (!phone) {
      Alert.alert('خطأ', 'رقم الهاتف غير متوفر');
      return;
    }
    
    const phoneNumber = phone.startsWith('+') ? phone : `+20${phone.replace(/^0/, '')}`;
    const url = `tel:${phoneNumber}`;
    
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          Alert.alert('خطأ', 'لا يمكن فتح تطبيق الهاتف');
        }
      })
      .catch((err) => {
        console.error('Error opening phone:', err);
        Alert.alert('خطأ', 'فشل فتح تطبيق الهاتف');
      });
  };

  // حساب المسافة بين نقطتين (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Geocode عنوان إلى lat/lon باستخدام Nominatim
  const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', مصر')}&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FlashDelivery/1.0',
        },
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  const handleSubmit = async () => {
    // فلترة العناصر الصالحة (لها اسم على الأقل)
    const validItems = items.filter(item => item.name.trim());
    
    if (validItems.length === 0) {
      Alert.alert('خطأ', 'الرجاء إدخال عنصر واحد على الأقل');
      return;
    }

    setLoading(true);
    try {
      // 1. جلب عنوان العميل الافتراضي
      let customerAddress: any = null;
      
      try {
        // جلب العناوين الافتراضية (قد يكون هناك أكثر من واحد)
        const { data: defaultAddresses, error: addressError } = await supabase
          .from('customer_addresses')
          .select('*')
          .eq('customer_id', user?.id)
          .eq('is_default', true)
          .limit(1); // جلب أول عنوان افتراضي فقط

        if (addressError) {
          console.warn('Error fetching default address:', addressError);
        } else if (defaultAddresses && defaultAddresses.length > 0) {
          customerAddress = defaultAddresses[0];
        }
        
        // إذا لم يكن هناك عنوان افتراضي، جرب جلب أي عنوان
        if (!customerAddress) {
          const { data: anyAddresses, error: anyAddressError } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', user?.id)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (anyAddressError) {
            console.warn('Error fetching any address:', anyAddressError);
            throw new Error('الرجاء إضافة عنوان توصيل في ملفك الشخصي أولاً');
          }
          
          if (anyAddresses && anyAddresses.length > 0) {
            customerAddress = anyAddresses[0];
          } else {
            throw new Error('الرجاء إضافة عنوان توصيل في ملفك الشخصي أولاً');
          }
        }
      } catch (error: any) {
        // إذا كان الخطأ متعلق بالعناوين، نرميه
        if (error.message?.includes('عنوان')) {
          throw error;
        }
        // وإلا نستمر بدون عنوان (للطلبات بدون مزود، قد لا نحتاج عنوان)
        console.warn('Could not fetch address, continuing without it:', error);
      }

      // 2. فصل العناصر: مع مزود وبدون مزود
      const itemsWithVendor: { [vendorId: string]: string[] } = {};
      const itemsWithoutVendor: string[] = [];
      
      console.log('Valid items:', validItems);
      
      validItems.forEach(item => {
        if (item.vendor) {
          const vendorId = item.vendor.id;
          if (!itemsWithVendor[vendorId]) {
            itemsWithVendor[vendorId] = [];
          }
          itemsWithVendor[vendorId].push(item.name.trim());
        } else {
          itemsWithoutVendor.push(item.name.trim());
        }
      });
      
      console.log('Items with vendor:', itemsWithVendor);
      console.log('Items without vendor:', itemsWithoutVendor);

      // 3. جلب بيانات المزودين مع مواقعهم (إذا كان هناك عناصر مع مزود)
      let vendorsData: any[] = [];
      if (Object.keys(itemsWithVendor).length > 0) {
        const vendorIds = Object.keys(itemsWithVendor);
        const { data, error: vendorsError } = await supabase
          .from('vendors')
          .select('id, name, latitude, longitude')
          .in('id', vendorIds);

        if (vendorsError) throw vendorsError;
        vendorsData = data || [];
      }

      // 4. حساب أبعد مزود عن العميل (إذا كان هناك مزودين)
      let farthestVendor = vendorsData.length > 0 ? vendorsData[0] : null;
      let maxDistance = 0;
      let customerLocation: { lat: number; lon: number } | null = null;
      
      if (customerAddress && customerAddress.place_name) {
        // Geocode عنوان العميل
        customerLocation = await geocodeAddress(customerAddress.place_name);
        
        if (customerLocation && vendorsData.length > 0) {
          // حساب المسافة من العميل لكل مزود
          vendorsData.forEach(vendor => {
            if (vendor.latitude && vendor.longitude) {
              const distance = calculateDistance(
                customerLocation!.lat,
                customerLocation!.lon,
                vendor.latitude,
                vendor.longitude
              );
              if (distance > maxDistance) {
                maxDistance = distance;
                farthestVendor = vendor;
              }
            }
          });
        }
      }

      // 5. جلب السائقين المتاحين مع مواقعهم
      // أولاً: جلب جميع السائقين
      const { data: allDrivers, error: driversError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'driver')
        .eq('status', 'active');

      let driversData: { driver_id: string; latitude: number; longitude: number }[] = [];
      
      if (!driversError && allDrivers && allDrivers.length > 0) {
        const driverIds = allDrivers.map(d => d.id);
        
        // جلب آخر موقع لكل سائق
        const { data: locationsData, error: locationsError } = await supabase
          .from('driver_locations')
          .select('driver_id, latitude, longitude')
          .in('driver_id', driverIds)
          .order('updated_at', { ascending: false });

        if (!locationsError && locationsData) {
          // أخذ آخر موقع لكل سائق
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

      // 6. اختيار السائق المناسب
      let selectedDriverId: string | null = null;
      
      if (driversData && driversData.length > 0) {
        if (farthestVendor && farthestVendor.latitude && farthestVendor.longitude) {
          // إذا كان هناك مزود: اختيار أقرب سائق لأبعد مزود
          let minDistance = Infinity;
          driversData.forEach(driver => {
            if (driver.latitude && driver.longitude) {
              const distance = calculateDistance(
                driver.latitude,
                driver.longitude,
                farthestVendor.latitude!,
                farthestVendor.longitude!
              );
              if (distance < minDistance) {
                minDistance = distance;
                selectedDriverId = driver.driver_id;
              }
            }
          });
        } else if (customerLocation && itemsWithoutVendor.length > 0) {
          // إذا لم يكن هناك مزود: اختيار سائق في نطاق المسافة القصوى من العميل
          let minDistance = Infinity;
          driversData.forEach(driver => {
            if (driver.latitude && driver.longitude) {
              const distance = calculateDistance(
                customerLocation.lat,
                customerLocation.lon,
                driver.latitude,
                driver.longitude
              );
              // فقط السائقين في النطاق المسموح
              if (distance <= maxDeliveryDistance && distance < minDistance) {
                minDistance = distance;
                selectedDriverId = driver.driver_id;
              }
            }
          });
        }
      }

      // 7. إنشاء الطلبات
      const orders: any[] = [];
      
      // أ. الطلبات مع مزود خدمة (مجمعة حسب المزود)
      Object.entries(itemsWithVendor).forEach(([vendorId, itemsList]) => {
        orders.push({
          customer_id: user?.id,
          vendor_id: vendorId,
          driver_id: selectedDriverId,
          items: itemsList,
          status: selectedDriverId ? 'accepted' : 'pending',
          pickup_address: vendorsData.find(v => v.id === vendorId)?.name || '',
          delivery_address: customerAddress?.full_address || customerAddress?.place_name || '',
          total_fee: 0,
        });
      });
      
      // ب. الطلبات بدون مزود خدمة (طلب واحد لجميع العناصر)
      if (itemsWithoutVendor.length > 0) {
        // للطلبات بدون مزود، نحتاج عنوان للتوصيل
        let deliveryAddr = 'موقع العميل'; // قيمة افتراضية
        
        if (customerAddress) {
          deliveryAddr = customerAddress.full_address || customerAddress.place_name || 'موقع العميل';
        } else {
          // إذا لم يكن هناك عنوان، نستخدم عنوان افتراضي
          console.warn('No customer address found, using default address');
        }
        
        orders.push({
          customer_id: user?.id,
          vendor_id: null, // بدون مزود خدمة
          driver_id: selectedDriverId,
          items: itemsWithoutVendor,
          status: selectedDriverId ? 'accepted' : 'pending',
          pickup_address: deliveryAddr, // للطلبات بدون مزود، نقطة الالتقاط هي موقع العميل
          delivery_address: deliveryAddr,
          total_fee: 0,
        });
      }
      
      // التأكد من وجود طلبات للإرسال
      if (orders.length === 0) {
        throw new Error('لا توجد طلبات للإرسال');
      }

      console.log('Submitting orders:', orders);
      
      const { data, error } = await supabase
        .from('orders')
        .insert(orders)
        .select();

      if (error) {
        console.error('Error inserting orders:', error);
        throw error;
      }
      
      console.log('Orders inserted successfully:', data);
      
      // بناء رسالة النجاح
      let message = '';
      if (orders.length === 1) {
        if (orders[0].vendor_id === null) {
          message = selectedDriverId 
            ? 'تم إرسال طلبك بنجاح! تم تعيين سائق تلقائياً.'
            : `تم إرسال طلبك بنجاح! سيتم إرساله للسائقين في نطاق ${maxDeliveryDistance} كم.`;
        } else {
          message = selectedDriverId 
            ? 'تم إرسال طلبك بنجاح! تم تعيين سائق تلقائياً.'
            : 'تم إرسال طلبك بنجاح! بانتظار قبول السائق.';
        }
      } else {
        message = selectedDriverId 
          ? `تم إرسال ${orders.length} طلب بنجاح! تم تعيين سائق تلقائياً.`
          : `تم إرسال ${orders.length} طلب بنجاح! بانتظار قبول السائق.`;
      }
      
      // توجيه مباشر إلى قائمة الطلبات
      router.replace('/(tabs)/customer/orders');
      
      // عرض رسالة النجاح بعد التوجيه
      setTimeout(() => {
        Alert.alert('✅ نجح', message);
      }, 300);
    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      const errorMessage = error.message || error.code || 'فشل إرسال الطلب';
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      Alert.alert('خطأ', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('customer.outsideOrder')}</Text>
      </View>

      <CurrentLocationDisplay />

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('customer.itemList')}</Text>
        {items.map((item, index) => (
          <View key={item.id} style={styles.itemContainer}>
            <View style={styles.itemRow}>
              {/* حقل إدخال العنصر */}
              <TextInput
                style={styles.itemInput}
                placeholder={`عنصر ${index + 1}`}
                value={item.name}
                onChangeText={(value) => updateItem(item.id, value)}
                placeholderTextColor="#999"
                textAlign="right"
              />
              
              {/* مزود الخدمة المختار أو البحث */}
              {item.vendor ? (
                <View style={styles.vendorBadge}>
                  <Text style={styles.vendorBadgeText} numberOfLines={1}>
                    {item.vendor.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => callVendor(item.vendor!.phone)}
                    style={styles.callButton}
                  >
                    <Ionicons name="call" size={18} color="#34C759" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => selectVendor(item.id, null as any)}
                    style={styles.removeVendorButton}
                  >
                    <Ionicons name="close-circle" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.vendorSearchWrapper}>
                  <TextInput
                    style={styles.vendorSearchInput}
                    placeholder="ابحث..."
                    value={searchQuery[item.id] || ''}
                    onChangeText={(value) => {
                      setSearchQuery(prev => ({ ...prev, [item.id]: value }));
                      setActiveSearchItemId(item.id);
                    }}
                    onFocus={() => handleSearchFocus(item.id)}
                    placeholderTextColor="#999"
                    textAlign="right"
                  />
                  {searching[item.id] && (
                    <ActivityIndicator size="small" color="#007AFF" style={styles.searchLoaderInline} />
                  )}
                </View>
              )}
              
              {items.length > 1 && (
                <TouchableOpacity
                  onPress={() => removeItem(item.id)}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={24} color="#FF3B30" />
                </TouchableOpacity>
              )}
            </View>

            {/* قائمة النتائج المنسدلة */}
            {activeSearchItemId === item.id && vendors[item.id] && vendors[item.id].length > 0 && (
              <View style={styles.vendorDropdown}>
                <FlatList
                  data={vendors[item.id]}
                  keyExtractor={(vendor) => vendor.id}
                  renderItem={({ item: vendor }) => (
                    <TouchableOpacity
                      style={styles.vendorCard}
                      onPress={() => selectVendor(item.id, vendor)}
                    >
                      <Text style={styles.vendorName}>{vendor.name}</Text>
                      <Text style={styles.vendorAddress}>{vendor.address}</Text>
                    </TouchableOpacity>
                  )}
                  nestedScrollEnabled
                />
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addItem}>
          <Ionicons name="add-circle" size={24} color="#007AFF" />
          <Text style={styles.addButtonText}>إضافة عنصر</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('common.submit')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
    textAlign: 'right',
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loader: {
    marginVertical: 12,
  },
  vendorList: {
    maxHeight: 200,
    marginBottom: 24,
  },
  vendorCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  vendorCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  vendorAddress: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
  },
  itemContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 120,
  },
  vendorSearchWrapper: {
    position: 'relative',
    width: 140,
  },
  vendorSearchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'right',
    width: '100%',
  },
  searchLoaderInline: {
    position: 'absolute',
    left: 8,
    top: 12,
  },
  vendorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    maxWidth: 180,
    gap: 6,
  },
  vendorBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    flex: 1,
    textAlign: 'right',
  },
  callButton: {
    padding: 4,
    backgroundColor: '#34C759',
    borderRadius: 8,
  },
  removeButton: {
    marginLeft: 4,
  },
  removeVendorButton: {
    padding: 2,
  },
  vendorDropdown: {
    maxHeight: 200,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    zIndex: 1000,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 24,
  },
  addButtonText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 8,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

