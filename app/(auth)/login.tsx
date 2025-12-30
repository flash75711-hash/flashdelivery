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
import responsive from '@/utils/responsive';

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
        if (authLogin) {
          await authLogin(result.user);
        }
        
        // التنقل بعد تأخير قصير
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 500);
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
  title: {
    fontSize: responsive.getResponsiveFontSize(32),
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: responsive.isTablet() ? 18 : 16,
    fontSize: responsive.getResponsiveFontSize(16),
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  phoneDisplayContainer: {
    alignItems: 'center',
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  phoneDisplayLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    marginBottom: 8,
  },
  phoneDisplay: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  changePhoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changePhoneText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(14),
  },
  pinContainer: {
    marginVertical: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: responsive.isTablet() ? 18 : 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: '600',
  },
  forgotPinButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  forgotPinText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(14),
  },
  registerButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  registerText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(16),
  },
});
