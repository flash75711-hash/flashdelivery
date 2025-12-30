import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import responsive, { createShadowStyle } from '@/utils/responsive';

export default function OrderTypeCards() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/orders/deliver-package')}
      >
        <View style={styles.icon}>
          <Ionicons name="cube" size={48} color="#007AFF" />
        </View>
        <Text style={styles.title}>{t('customer.deliverPackage')}</Text>
        <Text style={styles.description}>توصيل طرد من موقع إلى آخر</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/orders/outside-order')}
      >
        <View style={styles.icon}>
          <Ionicons name="cart" size={48} color="#34C759" />
        </View>
        <Text style={styles.title}>{t('customer.outsideOrder')}</Text>
        <Text style={styles.description}>طلب شراء من متجر معين</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: responsive.isTablet() ? 32 : 24,
    alignItems: 'center',
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: 600,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'center',
  },
});

