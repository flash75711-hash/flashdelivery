import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CurrentLocationDisplay from '@/components/CurrentLocationDisplay';

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('customer.home')}</Text>
      </View>

      <CurrentLocationDisplay />

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/customer/deliver-package')}
        >
          <View style={styles.cardIcon}>
            <Ionicons name="cube" size={48} color="#007AFF" />
          </View>
          <Text style={styles.cardTitle}>{t('customer.deliverPackage')}</Text>
          <Text style={styles.cardDescription}>
            توصيل طرد من موقع إلى آخر
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/customer/outside-order')}
        >
          <View style={styles.cardIcon}>
            <Ionicons name="cart" size={48} color="#34C759" />
          </View>
          <Text style={styles.cardTitle}>{t('customer.outsideOrder')}</Text>
          <Text style={styles.cardDescription}>
            طلب شراء من متجر معين
          </Text>
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
  content: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardIcon: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

