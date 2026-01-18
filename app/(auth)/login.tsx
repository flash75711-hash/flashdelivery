/**
 * Login Screen - PIN Authentication
 * شاشة تسجيل الدخول باستخدام رقم الموبايل و PIN
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { loginWithPin, formatPhone, isValidPhone } from '@/lib/pinAuth';
import { showToast } from '@/lib/alert';
import { vibrateError, vibrateSuccess } from '@/lib/vibration';
import PinInput from '@/components/PinInput';
import responsive, { getM3CardStyle, getM3ButtonStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading, loginWithPin: authLogin } = useAuth();
  
  const styles = getStyles();

  // إذا كان المستخدم مسجل دخول بالفعل، نعيد التوجيه
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, authLoading, router]);

  const handlePhoneSubmit = async () => {
    if (!phone.trim()) {
      showToast('الرجاء إدخال رقم الموبايل', 'warning');
      return;
    }

    if (!isValidPhone(phone)) {
      showToast('رقم الموبايل غير صحيح', 'error');
      return;
    }

    setShowPinInput(true);
  };

  const handlePinComplete = async (completedPin: string) => {
    if (completedPin.length !== 6) {
      return;
    }

    await handleLogin(completedPin);
  };

  const handleLogin = async (pinValue?: string) => {
    const pinToUse = pinValue || pin;
    
    if (!phone.trim() || !isValidPhone(phone)) {
      showToast('الرجاء إدخال رقم الموبايل صحيح', 'warning');
      return;
    }

    if (!pinToUse || pinToUse.length !== 6) {
      showToast('الرجاء إدخال رمز PIN مكون من 6 أرقام', 'warning');
      return;
    }

    setLoading(true);

    try {
      const result = await loginWithPin(phone, pinToUse);

      if (result.success && result.user) {
        vibrateSuccess();
        showToast('تم تسجيل الدخول بنجاح', 'success');
        
        // استخدام AuthContext للدخول
        try {
          if (authLogin) {
            // إضافة timeout لـ authLogin
            const authLoginPromise = authLogin(result.user);
            const authLoginTimeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Auth login timeout after 5 seconds')), 5000)
            );
            
            await Promise.race([authLoginPromise, authLoginTimeoutPromise]);
          }
          
          // التنقل بعد تأخير قصير
          setTimeout(() => {
            router.replace('/(tabs)');
          }, 500);
        } catch (authError: any) {
          console.error('Auth login error:', authError);
          // حتى لو فشل authLogin، نستمر في التنقل
          setTimeout(() => {
            router.replace('/(tabs)');
          }, 500);
        }
      } else {
        vibrateError();
        showToast(result.error || 'فشل تسجيل الدخول', 'error');
        
        // إعادة تعيين PIN عند الخطأ
        setPin('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      vibrateError();
      showToast(error.message || 'حدث خطأ أثناء تسجيل الدخول', 'error');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setShowPinInput(false);
    setPin('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Flash Delivery</Text>
        <Text style={styles.subtitle}>
          {showPinInput ? 'أدخل رمز PIN' : 'تسجيل الدخول برقم الموبايل'}
        </Text>

        {!showPinInput ? (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="رقم الموبايل (مثال: 01234567890)"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor="#999"
                textAlign="right"
                autoFocus
                onSubmitEditing={handlePhoneSubmit}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handlePhoneSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>متابعة</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.phoneDisplayContainer}>
              <Text style={styles.phoneDisplayLabel}>رقم الموبايل:</Text>
              <Text style={styles.phoneDisplay}>{formatPhone(phone)}</Text>
              <TouchableOpacity onPress={handleBackToPhone} style={styles.changePhoneButton}>
                <Text style={styles.changePhoneText}>تغيير</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pinContainer}>
              <PinInput
                value={pin}
                onChange={setPin}
                onComplete={handlePinComplete}
                disabled={loading}
                error={false}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.button, (loading || pin.length !== 6) && styles.buttonDisabled]}
              onPress={() => handleLogin()}
              disabled={loading || pin.length !== 6}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>تسجيل الدخول</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          onPress={() => router.push('/(auth)/forgot-pin')}
          style={styles.forgotPinButton}
        >
          <Text style={styles.forgotPinText}>نسيت رمز الدخول؟</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/register')}
          style={styles.registerButton}
        >
          <Text style={styles.registerText}>
            ليس لديك حساب؟ إنشاء حساب جديد
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3Theme.colors.background, // M3 Background
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: getM3HorizontalPadding(), // M3: 16px horizontal padding
    ...(responsive.isLargeScreen() && {
      maxWidth: 500,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  title: {
    ...M3Theme.typography.headlineLarge, // 32px, weight 600
    textAlign: 'center',
    marginBottom: 10,
    color: M3Theme.colors.onBackground,
  },
  subtitle: {
    ...M3Theme.typography.titleLarge, // 22px, weight 500
    textAlign: 'center',
    marginBottom: 40,
    color: M3Theme.colors.onSurfaceVariant,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: M3Theme.colors.surfaceVariant, // M3 Surface Variant
    borderRadius: M3Theme.shape.cornerMedium, // 12px
    padding: M3Theme.spacing.md, // 16px
    fontSize: 16, // M3: 16px minimum for inputs (prevents iOS auto-zoom)
    borderWidth: 1,
    borderColor: M3Theme.colors.outlineVariant,
  },
  phoneDisplayContainer: {
    alignItems: 'center',
    marginBottom: 30,
    padding: M3Theme.spacing.md, // 16px
    backgroundColor: M3Theme.colors.surfaceVariant,
    borderRadius: M3Theme.shape.cornerMedium, // 12px
  },
  phoneDisplayLabel: {
    ...M3Theme.typography.bodyMedium, // 14px base font
    color: M3Theme.colors.onSurfaceVariant,
    marginBottom: 8,
  },
  phoneDisplay: {
    ...M3Theme.typography.titleMedium, // 16px, weight 600
    color: M3Theme.colors.onSurface,
    marginBottom: 12,
  },
  changePhoneButton: {
    paddingVertical: M3Theme.spacing.sm, // 8px
    paddingHorizontal: M3Theme.spacing.md, // 16px
    ...getM3TouchTarget('minimum'), // 44x44px minimum
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  changePhoneText: {
    ...M3Theme.typography.labelLarge, // 14px, weight 600
    color: M3Theme.colors.primary,
  },
  pinContainer: {
    marginVertical: 20,
  },
  button: {
    ...getM3ButtonStyle(true), // M3: Full-width, 48px min height
    backgroundColor: M3Theme.colors.primary, // M3 Primary
    borderRadius: M3Theme.shape.cornerLarge, // 16px
    alignItems: 'center',
    marginTop: 8,
    ...Platform.select({
      web: M3Theme.webViewStyles.button, // user-select: none
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...M3Theme.typography.labelLarge, // 14px, weight 600
    color: M3Theme.colors.onPrimary,
  },
  forgotPinButton: {
    marginTop: 20,
    alignItems: 'center',
    ...getM3TouchTarget('minimum'),
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  forgotPinText: {
    ...M3Theme.typography.labelLarge, // 14px, weight 600
    color: M3Theme.colors.primary,
  },
  registerButton: {
    marginTop: 20,
    alignItems: 'center',
    ...getM3TouchTarget('minimum'),
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  registerText: {
    ...M3Theme.typography.bodyLarge, // 16px
    color: M3Theme.colors.primary,
  },
});
