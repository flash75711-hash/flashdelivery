import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { getLocationWithAddress } from '@/lib/webLocationUtils';
import { showConfirm, showSimpleAlert } from '@/lib/alert';
import responsive from '@/utils/responsive';

interface Address {
  id?: string;
  place_name: string;
  building_number: string;
  apartment_number: string;
  floor_number: string;
  is_default: boolean;
}

export default function CustomerProfileScreen() {
  const { user, signOut, loadUser } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);
  
  const [fullName, setFullName] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [gettingLocation, setGettingLocation] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | null>(null);

  // جلب بيانات المستخدم والعناوين
  useEffect(() => {
    if (user) {
      loadProfileData();
      
      // الاشتراك في Realtime لتحديث بيانات المستخدم تلقائياً
      const profileChannel = supabase
        .channel(`customer_profile_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          () => {
            loadProfileData();
          }
        )
        .subscribe();
      
      return () => {
        profileChannel.unsubscribe();
      };
    }
  }, [user]);

  const loadProfileData = async () => {
    if (!user) return;
    
    setLoadingData(true);
    try {
      // جلب الاسم من profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      
      if (profile?.full_name) {
        setFullName(profile.full_name);
      } else if (user.full_name) {
        setFullName(user.full_name);
      }

      // جلب العناوين
      const { data: addressesData, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading addresses:', error);
        // إذا لم يكن هناك عناوين، نضيف عنوان فارغ واحد
        setAddresses([{
          place_name: '',
          building_number: '',
          apartment_number: '',
          floor_number: '',
          is_default: true
        }]);
      } else if (addressesData && addressesData.length > 0) {
        setAddresses(addressesData.map(addr => ({
          id: addr.id,
          place_name: addr.place_name || '',
          building_number: addr.building_number || '',
          apartment_number: addr.apartment_number || '',
          floor_number: addr.floor_number || '',
          is_default: addr.is_default || false,
        })));
      } else {
        // لا توجد عناوين، نضيف عنوان فارغ واحد
        setAddresses([{
          place_name: '',
          building_number: '',
          apartment_number: '',
          floor_number: '',
          is_default: true
        }]);
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
      setAddresses([{
        place_name: '',
        building_number: '',
        apartment_number: '',
        floor_number: '',
        is_default: true
      }]);
    } finally {
      setLoadingData(false);
    }
  };

  const addAddress = () => {
    setAddresses([...addresses, {
      place_name: '',
      building_number: '',
      apartment_number: '',
      floor_number: '',
      is_default: false
    }]);
  };

  const removeAddress = (index: number) => {
    if (addresses.length > 1) {
      const addressToRemove = addresses[index];
      const newAddresses = addresses.filter((_, i) => i !== index);
      
      // إذا كان العنوان المحذوف هو الافتراضي، اجعل الأول افتراضياً
      if (addressToRemove.is_default && newAddresses.length > 0) {
        newAddresses[0].is_default = true;
      }
      
      // إذا كان العنوان له id (موجود في قاعدة البيانات)، نحذفه
      if (addressToRemove.id) {
        deleteAddressFromDB(addressToRemove.id);
      }
      
      setAddresses(newAddresses);
    } else {
      showSimpleAlert('تنبيه', 'يجب أن يكون لديك عنوان واحد على الأقل', 'warning');
    }
  };

  const deleteAddressFromDB = async (addressId: string) => {
    try {
      const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', addressId);
      
      if (error) {
        console.error('Error deleting address:', error);
      }
    } catch (error) {
      console.error('Error deleting address:', error);
    }
  };

  const setDefaultAddress = (index: number) => {
    const newAddresses = addresses.map((addr, i) => ({
      ...addr,
      is_default: i === index
    }));
    setAddresses(newAddresses);
  };

  const updateAddress = (index: number, field: keyof Address, value: string | boolean) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setAddresses(newAddresses);
  };

  // فتح دليل الأماكن لاختيار مكان
  const openPlacesDirectory = (index: number) => {
    setSelectedAddressIndex(index);
    router.push({
      pathname: '/customer/places-directory',
      params: { 
        addressIndex: index.toString(),
        returnPath: '/(tabs)/customer/profile'
      },
    });
  };

  // التحقق من اختيار مكان عند العودة من الدليل
  useFocusEffect(
    useCallback(() => {
      const checkSelectedPlace = async () => {
        if (selectedAddressIndex !== null) {
          const storedPlace = localStorage.getItem(`selected_place_address_${selectedAddressIndex}`);
          if (storedPlace) {
            const place = JSON.parse(storedPlace);
            // تحديث العنوان مباشرة
            setAddresses(prevAddresses => {
              const newAddresses = [...prevAddresses];
              if (newAddresses[selectedAddressIndex]) {
                newAddresses[selectedAddressIndex] = {
                  ...newAddresses[selectedAddressIndex],
                  place_name: place.name
                };
              }
              return newAddresses;
            });
            localStorage.removeItem(`selected_place_address_${selectedAddressIndex}`);
            setSelectedAddressIndex(null);
          }
        }
      };
      checkSelectedPlace();
    }, [selectedAddressIndex])
  );

  const getCurrentLocation = async (index: number) => {
    setGettingLocation(index);
    try {
      // استخدام الدالة المشتركة التي تستخدم WiFi والبحث في الدليل
      const locationData = await getLocationWithAddress(500);

      if (!locationData) {
        throw new Error('فشل جلب الموقع');
      }

      const { lat, lon, address } = locationData;
      
      // استخدام العنوان المسترجع (من الدليل أو reverse geocoding)
      const placeName = address;

        updateAddress(index, 'place_name', placeName);

        showSimpleAlert('نجح', 'تم جلب العنوان بنجاح', 'success');
    } catch (error: any) {
      console.error('Error getting location:', error);
      showSimpleAlert('خطأ', error.message || 'فشل جلب الموقع', 'error');
    } finally {
      setGettingLocation(null);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (addresses.some(addr => !addr.place_name)) {
      showSimpleAlert('خطأ', 'الرجاء إدخال اسم المكان العام لجميع العناوين', 'warning');
      return;
    }

    setSaving(true);
    try {
      // تحديث الاسم في profile
      if (fullName) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: fullName })
          .eq('id', user.id);

        if (profileError) {
          console.error('Error updating profile:', profileError);
          throw profileError;
        }
      }

      // حفظ/تحديث العناوين
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        
        if (address.id) {
          // تحديث عنوان موجود
          const { error: updateError } = await supabase
            .from('customer_addresses')
            .update({
              place_name: address.place_name,
              building_number: address.building_number || null,
              apartment_number: address.apartment_number || null,
              floor_number: address.floor_number || null,
              is_default: address.is_default,
            })
            .eq('id', address.id);

          if (updateError) {
            console.error('Error updating address:', updateError);
            throw updateError;
          }
        } else {
          // إضافة عنوان جديد
          const { error: insertError } = await supabase
            .from('customer_addresses')
            .insert({
              customer_id: user.id,
              place_name: address.place_name,
              building_number: address.building_number || null,
              apartment_number: address.apartment_number || null,
              floor_number: address.floor_number || null,
              is_default: address.is_default,
            });

          if (insertError) {
            console.error('Error inserting address:', insertError);
            throw insertError;
          }
        }
      }

      // إعادة تحميل بيانات المستخدم
      await loadUser();
      await loadProfileData();
      
      setEditingName(false);
      showSimpleAlert('نجح', 'تم حفظ البيانات بنجاح', 'success');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      showSimpleAlert('خطأ', error.message || 'فشل حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    console.log('Profile: handleLogout called');
    
    const confirmed = await showConfirm(
      'تسجيل الخروج',
      'هل أنت متأكد من تسجيل الخروج؟',
      {
        confirmText: 'تسجيل الخروج',
        cancelText: 'إلغاء',
        confirmButtonColor: '#FF3B30',
      }
    );
    
    if (confirmed) {
      performLogout();
    }
  };

  const performLogout = async () => {
    try {
      setLoading(true);
      console.log('Profile: Starting logout...');
      await signOut();
      console.log('Profile: Logout successful, navigating to login...');
      // الانتظار قليلاً لضمان مسح الحالة
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // على الويب، نستخدم window.location لإعادة تحميل الصفحة بالكامل
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } catch (error: any) {
      console.error('Profile: Error during logout:', error);
      // حتى لو فشل، نحاول التنقل لصفحة تسجيل الدخول
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('customer.profile')}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('customer.profile')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={48} color="#007AFF" />
            </View>
            
            <View style={styles.nameContainer}>
              {editingName ? (
                <View style={styles.nameEditContainer}>
                  <TextInput
                    style={styles.nameInput}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="الاسم الكامل"
                    placeholderTextColor="#999"
                    textAlign="center"
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setEditingName(false);
                      if (user?.full_name) {
                        setFullName(user.full_name);
                      }
                    }}
                    style={styles.cancelButton}
                  >
                    <Ionicons name="close" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.name}>{fullName || user?.email || 'بدون اسم'}</Text>
                  <TouchableOpacity
                    onPress={() => setEditingName(true)}
                    style={styles.editNameButton}
                  >
                    <Ionicons name="pencil" size={16} color="#007AFF" />
                    <Text style={styles.editNameText}>تعديل</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            
            <Text style={styles.email}>{user?.phone || user?.email}</Text>
            <Text style={styles.role}>{t(`roles.${user?.role}`)}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>العناوين</Text>
              <TouchableOpacity onPress={addAddress} style={styles.addButton}>
                <Ionicons name="add-circle" size={24} color="#007AFF" />
                <Text style={styles.addButtonText}>إضافة عنوان</Text>
              </TouchableOpacity>
            </View>

            {addresses.map((address, index) => (
              <View key={index} style={styles.addressCard}>
                <View style={styles.addressHeader}>
                  <Text style={styles.addressNumber}>عنوان {index + 1}</Text>
                  {addresses.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeAddress(index)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="trash" size={20} color="#ff3b30" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.locationInputContainer}>
                  <TextInput
                    style={[styles.input, styles.locationInput]}
                    placeholder="اسم المكان العام * (مثل: مول مصر، شارع النيل)"
                    value={address.place_name}
                    onChangeText={(text) => updateAddress(index, 'place_name', text)}
                    placeholderTextColor="#999"
                    textAlign="right"
                  />
                  <View style={styles.locationButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.locationButton, styles.directoryButton]}
                      onPress={() => openPlacesDirectory(index)}
                    >
                      <Ionicons name="list" size={20} color="#34C759" />
                    </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.locationButton, gettingLocation === index && styles.locationButtonLoading]}
                    onPress={() => getCurrentLocation(index)}
                    disabled={gettingLocation === index}
                  >
                    {gettingLocation === index ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Ionicons name="location" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    placeholder="رقم العقار"
                    value={address.building_number}
                    onChangeText={(text) => updateAddress(index, 'building_number', text)}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    textAlign="right"
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    placeholder="رقم الشقة"
                    value={address.apartment_number}
                    onChangeText={(text) => updateAddress(index, 'apartment_number', text)}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    textAlign="right"
                  />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="الدور"
                  value={address.floor_number}
                  onChangeText={(text) => updateAddress(index, 'floor_number', text)}
                  placeholderTextColor="#999"
                  textAlign="right"
                />

                <TouchableOpacity
                  onPress={() => setDefaultAddress(index)}
                  style={[
                    styles.defaultButton,
                    address.is_default && styles.defaultButtonActive
                  ]}
                >
                  <Ionicons
                    name={address.is_default ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={address.is_default ? "#007AFF" : "#999"}
                  />
                  <Text style={[
                    styles.defaultButtonText,
                    address.is_default && styles.defaultButtonTextActive
                  ]}>
                    العنوان الافتراضي
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>حفظ التغييرات</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
            <Text style={[styles.menuText, styles.logoutText]}>
              {t('auth.logout')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: tabBarBottomPadding,
  },
  flex: {
    flex: 1,
  },
  header: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 255, 255, 0.95)' : '#fff',
    padding: responsive.getResponsiveHeaderPadding(),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  nameContainer: {
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  name: {
    fontSize: responsive.getResponsiveFontSize(24),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  nameEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: responsive.isTablet() ? 16 : 12,
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    textAlign: 'center',
    maxWidth: 250,
  },
  cancelButton: {
    padding: 4,
  },
  editNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  editNameText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(14),
  },
  email: {
    fontSize: responsive.getResponsiveFontSize(16),
    color: '#666',
    marginBottom: 4,
  },
  role: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
    fontWeight: '600',
  },
  section: {
    marginBottom: responsive.getResponsivePadding(),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  removeButton: {
    padding: 4,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  locationInput: {
    flex: 1,
    marginBottom: 0,
  },
  locationButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  directoryButton: {
    backgroundColor: '#e8f5e9',
    borderColor: '#34C759',
  },
  locationButtonLoading: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfInput: {
    flex: 1,
    marginBottom: 0,
  },
  defaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  defaultButtonActive: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  defaultButtonText: {
    color: '#999',
    fontSize: 14,
  },
  defaultButtonTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: responsive.isTablet() ? 20 : 16,
    alignItems: 'center',
    marginBottom: responsive.getTabBarBottomPadding() + 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  menuText: {
    fontSize: responsive.getResponsiveFontSize(16),
    marginLeft: 12,
    color: '#1a1a1a',
  },
  logoutText: {
    color: '#FF3B30',
  },
});
