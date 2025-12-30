import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CurrentLocationDisplay from '@/components/CurrentLocationDisplay';
import responsive from '@/utils/responsive';
import NotificationCard from '@/components/NotificationCard';

const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: tabBarBottomPadding,
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
    padding: responsive.getResponsivePadding(),
    gap: 20,
    paddingBottom: responsive.getResponsivePadding() + 20,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: responsive.isTablet() ? 32 : 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    ...(responsive.isLargeScreen() && {
      maxWidth: 600,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  cardIcon: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'center',
  },
});

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('customer.home')}</Text>
      </View>

      <CurrentLocationDisplay />

      <ScrollView contentContainerStyle={styles.content}>
        {/* قسم الإشعارات */}
        <NotificationCard />

      <View>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/orders/deliver-package')}
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
          onPress={() => router.push('/orders/outside-order')}
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
      </ScrollView>
    </SafeAreaView>
  );
}
