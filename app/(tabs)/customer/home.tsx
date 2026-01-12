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
import responsive, { createShadowStyle } from '@/utils/responsive';
import NotificationCard from '@/components/NotificationCard';
import { showToast } from '@/lib/alert';

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
    borderRadius: 20,
    padding: responsive.isTablet() ? 36 : 28,
    alignItems: 'center',
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
  cardIcon: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: responsive.getResponsiveFontSize(22),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  cardDescription: {
    fontSize: responsive.getResponsiveFontSize(15),
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '400',
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
