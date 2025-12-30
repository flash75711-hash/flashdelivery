/**
 * Forgot PIN Screen
 * شاشة نسيان رمز PIN - عرض خيارات التواصل فقط
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import responsive from '@/utils/responsive';

export default function ForgotPinScreen() {
  const router = useRouter();
  const styles = getStyles();

  const handleCall = () => {
    const phoneNumber = '+201200006637'; // رقم الدعم
    const url = Platform.OS === 'web' ? `tel:${phoneNumber}` : `tel:${phoneNumber}`;
    Linking.openURL(url).catch((err) => {
      console.error('Error opening phone:', err);
    });
  };

  const handleWhatsApp = () => {
    const phoneNumber = '201200006637'; // رقم الواتساب (بدون +)
    const message = encodeURIComponent('أحتاج إلى إعادة تعيين رمز PIN');
    const url = `https://wa.me/${phoneNumber}?text=${message}`;
    Linking.openURL(url).catch((err) => {
      console.error('Error opening WhatsApp:', err);
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed-outline" size={64} color="#007AFF" />
        </View>

        <Text style={styles.title}>نسيت رمز الدخول؟</Text>
        <Text style={styles.description}>
          للأسف، لا يمكن إعادة تعيين رمز PIN تلقائياً لأسباب أمنية.
          {'\n\n'}
          يرجى التواصل معنا لإعادة تعيين رمز PIN يدوياً من خلال لوحة التحكم.
        </Text>

        <View style={styles.contactOptions}>
          <TouchableOpacity style={styles.contactButton} onPress={handleCall}>
            <Ionicons name="call-outline" size={24} color="#fff" />
            <Text style={styles.contactButtonText}>اتصال</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.contactButton, styles.whatsappButton]} onPress={handleWhatsApp}>
            <Ionicons name="logo-whatsapp" size={24} color="#fff" />
            <Text style={styles.contactButtonText}>واتساب</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>معلومات التواصل:</Text>
          <Text style={styles.infoText}>رقم الهاتف: 01200006637</Text>
          <Text style={styles.infoText}>ساعات العمل: 9 صباحاً - 9 مساءً</Text>
        </View>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← رجوع</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const getStyles = () => StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: 500,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  description: {
    fontSize: responsive.getResponsiveFontSize(16),
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
    lineHeight: 24,
  },
  contactOptions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
    justifyContent: 'center',
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: responsive.isTablet() ? 18 : 16,
    gap: 8,
    maxWidth: 200,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  contactButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  infoText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 8,
  },
  backButton: {
    alignItems: 'center',
    padding: 16,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(16),
  },
});

