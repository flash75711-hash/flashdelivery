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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

interface Vendor {
  id: string;
  name: string;
  address: string;
  phone: string;
}

export default function OutsideOrderScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const [items, setItems] = useState<string[]>(['']);
  const [searchQuery, setSearchQuery] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length > 2) {
      searchVendors();
    } else {
      setVendors([]);
    }
  }, [searchQuery]);

  const searchVendors = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .ilike('name', `%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setVendors(data || []);
    } catch (error) {
      console.error('Error searching vendors:', error);
    } finally {
      setSearching(false);
    }
  };

  const addItem = () => {
    setItems([...items, '']);
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!selectedVendor) {
      Alert.alert('خطأ', 'الرجاء اختيار مزود الخدمة');
      return;
    }

    if (items.every((item) => !item.trim())) {
      Alert.alert('خطأ', 'الرجاء إدخال عنصر واحد على الأقل');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert({
          customer_id: user?.id,
          vendor_id: selectedVendor.id,
          items: items.filter((item) => item.trim()),
          status: 'pending',
          total_fee: 0, // سيتم حسابها لاحقاً
        })
        .select()
        .single();

      if (error) throw error;
      Alert.alert('نجح', 'تم إرسال الطلب بنجاح', [
        { text: 'حسناً', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل إرسال الطلب');
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

      <View style={styles.content}>
        <Text style={styles.label}>{t('customer.selectVendor')}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="ابحث عن متجر..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
          textAlign="right"
        />

        {searching && (
          <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />
        )}

        {vendors.length > 0 && (
          <FlatList
            data={vendors}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.vendorCard,
                  selectedVendor?.id === item.id && styles.vendorCardSelected,
                ]}
                onPress={() => setSelectedVendor(item)}
              >
                <Text style={styles.vendorName}>{item.name}</Text>
                <Text style={styles.vendorAddress}>{item.address}</Text>
              </TouchableOpacity>
            )}
            style={styles.vendorList}
          />
        )}

        <Text style={styles.label}>{t('customer.itemList')}</Text>
        {items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <TextInput
              style={styles.itemInput}
              placeholder={`عنصر ${index + 1}`}
              value={item}
              onChangeText={(value) => updateItem(index, value)}
              placeholderTextColor="#999"
              textAlign="right"
            />
            {items.length > 1 && (
              <TouchableOpacity
                onPress={() => removeItem(index)}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle" size={24} color="#FF3B30" />
              </TouchableOpacity>
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
      </View>
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  removeButton: {
    marginLeft: 8,
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

