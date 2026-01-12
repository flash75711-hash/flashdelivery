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
    borderRadius: 20,
    padding: responsive.isTablet() ? 36 : 28,
    alignItems: 'center',
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 6,
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: 600,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(22),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  description: {
    fontSize: responsive.getResponsiveFontSize(15),
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '400',
  },
});

