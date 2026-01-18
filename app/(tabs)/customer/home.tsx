import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CurrentLocationDisplay from '@/components/CurrentLocationDisplay';
import responsive, { createShadowStyle, getM3CardStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import NotificationCard from '@/components/NotificationCard';
import { showToast } from '@/lib/alert';

const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3Theme.colors.background, // M3 Background
    paddingBottom: tabBarBottomPadding,
  },
  header: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 251, 254, 0.95)' : M3Theme.colors.surface,
    padding: responsive.getResponsiveHeaderPadding(),
    borderBottomWidth: 1,
    borderBottomColor: M3Theme.colors.outlineVariant, // M3 Outline Variant
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
    ...getM3CardStyle(), // M3: 16px radius, 16px padding, subtle shadow
    backgroundColor: M3Theme.colors.surface,
    padding: responsive.isTablet() ? 36 : 28,
    alignItems: 'center',
    ...(responsive.isLargeScreen() && {
      maxWidth: 600,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  cardIcon: {
    marginBottom: 20,
  },
  cardTitle: {
    ...M3Theme.typography.titleLarge, // 22px, weight 500
    fontWeight: '700', // Override for emphasis
    color: M3Theme.colors.onSurface,
    marginBottom: 10,
    textAlign: 'center',
  },
  cardDescription: {
    ...M3Theme.typography.bodyMedium, // 14px base font
    color: M3Theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
});

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  
  // Calculate tab bar padding for web
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);

  const [refreshKey, setRefreshKey] = useState(0);

  const onRefresh = async () => {
    console.log('🔄 [Pull to Refresh] Customer home refresh started');
    setRefreshing(true);
    
    try {
      // إعادة تحميل الموقع والإشعارات
      // تحديث refreshKey لإجبار المكونات على إعادة التحميل
      setRefreshKey(prev => {
        const newKey = prev + 1;
        console.log('🔄 [Pull to Refresh] Refresh key updated:', newKey);
        return newKey;
      });
      
      // انتظار قليل للسماح للمكونات بالتحديث
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('✅ [Pull to Refresh] Customer home refresh completed');
      showToast('تم تحديث البيانات', 'success');
    } catch (error) {
      console.error('❌ [Pull to Refresh] Error:', error);
      showToast('حدث خطأ أثناء التحديث', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('customer.home')}</Text>
      </View>

      <CurrentLocationDisplay key={`location-${refreshKey}`} onManualRefresh={onRefresh} />

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* قسم الإشعارات */}
        <NotificationCard key={`notifications-${refreshKey}`} />

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
            توصيل طلب من موقع إلى آخر
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
