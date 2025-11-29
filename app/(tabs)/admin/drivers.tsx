import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
}

export default function AdminDriversScreen() {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error loading drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const suspendDriver = async (driverId: string) => {
    Alert.alert(
      'تعليق الحساب',
      'هل أنت متأكد من تعليق حساب هذا السائق؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تعليق',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('profiles')
                .update({ status: 'suspended' })
                .eq('id', driverId);

              if (error) throw error;
              Alert.alert('نجح', 'تم تعليق حساب السائق');
              loadDrivers();
            } catch (error: any) {
              Alert.alert('خطأ', error.message || 'فشل تعليق الحساب');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.drivers')}</Text>
      </View>

      <FlatList
        data={drivers}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadDrivers} />
        }
        renderItem={({ item }) => (
          <View style={styles.driverCard}>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{item.full_name || item.email}</Text>
              <Text style={styles.driverEmail}>{item.email}</Text>
              {item.phone && (
                <Text style={styles.driverPhone}>{item.phone}</Text>
              )}
              <View style={styles.statusContainer}>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === 'active'
                      ? styles.statusActive
                      : styles.statusSuspended,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {item.status === 'active' ? 'نشط' : 'معلق'}
                  </Text>
                </View>
              </View>
            </View>
            {item.status === 'active' && (
              <TouchableOpacity
                style={styles.suspendButton}
                onPress={() => suspendDriver(item.id)}
              >
                <Ionicons name="ban" size={20} color="#FF3B30" />
                <Text style={styles.suspendButtonText}>
                  {t('admin.suspendAccount')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا يوجد سائقين</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  driverCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  driverInfo: {
    marginBottom: 12,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  driverEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  driverPhone: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
  },
  statusContainer: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#34C75920',
  },
  statusSuspended: {
    backgroundColor: '#FF3B3020',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  suspendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B3020',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  suspendButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});

