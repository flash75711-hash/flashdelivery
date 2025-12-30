/**
 * Register Screen - PIN Authentication
 * شاشة التسجيل باستخدام رقم الموبايل و PIN
 */

import React, { useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { registerWithPin, formatPhone, isValidPhone, type UserRole } from '@/lib/pinAuth';
import { showToast } from '@/lib/alert';
import { vibrateError, vibrateSuccess } from '@/lib/vibration';
import PinInput from '@/components/PinInput';
import responsive from '@/utils/responsive';

export default function RegisterScreen() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'role' | 'phone' | 'pin' | 'confirmPin'>('role');
  const router = useRouter();
  const { t } = useTranslation();
  
  const styles = getStyles();

  const roles: { value: UserRole; label: string; icon: string }[] = [
    { value: 'customer', label: 'عميل', icon: '👤' },
    { value: 'driver', label: 'سائق', icon: '🚗' },
    { value: 'vendor', label: 'مزود خدمة', icon: '🏪' },
  ];

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStep('phone');
  };

  const handlePhoneSubmit = () => {
    if (!phone.trim()) {
      showToast('الرجاء إدخال رقم الموبايل', 'warning');
      return;
    }

    if (!isValidPhone(phone)) {
      showToast('رقم الموبايل غير صحيح', 'error');
      return;
    }

    setStep('pin');
  };

  const handlePinComplete = (completedPin: string) => {
    if (completedPin.length === 6) {
      setStep('confirmPin');
    }
  };

  const handleConfirmPinComplete = async (completedPin: string) => {
    if (completedPin.length !== 6) {
      return;
    }

    if (pin !== completedPin) {
      vibrateError();
      showToast('رمز PIN غير متطابق', 'error');
      setConfirmPin('');
      return;
    }

    await handleRegister();
  };

  const handleRegister = async () => {
    if (!phone.trim() || !isValidPhone(phone)) {
      showToast('الرجاء إدخال رقم الموبايل صحيح', 'warning');
      return;
    }

    if (!pin || pin.length !== 6) {
      showToast('الرجاء إدخال رمز PIN مكون من 6 أرقام', 'warning');
      return;
    }

    if (pin !== confirmPin) {
      vibrateError();
      showToast('رمز PIN غير متطابق', 'error');
      return;
    }

    setLoading(true);

    try {
      const result = await registerWithPin(phone, pin, selectedRole);

      if (result.success && result.user) {
        vibrateSuccess();
        showToast('تم إنشاء الحساب بنجاح', 'success');
        
        // التنقل لصفحة تسجيل الدخول
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 1000);
      } else {
        vibrateError();
        showToast(result.error || 'فشل إنشاء الحساب', 'error');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      vibrateError();
      showToast(error.message || 'حدث خطأ أثناء التسجيل', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'phone') {
      setStep('role');
    } else if (step === 'pin') {
      setStep('phone');
    } else if (step === 'confirmPin') {
      setStep('pin');
      setConfirmPin('');
    }
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
        <Text style={styles.title}>إنشاء حساب جديد</Text>
        <Text style={styles.subtitle}>
          {step === 'role' && 'اختر نوع الحساب'}
          {step === 'phone' && 'أدخل رقم الموبايل'}
          {step === 'pin' && 'أنشئ رمز PIN (6 أرقام)'}
          {step === 'confirmPin' && 'أكد رمز PIN'}
        </Text>

        {step === 'role' && (
          <View style={styles.rolesContainer}>
            {roles.map((role) => (
              <TouchableOpacity
                key={role.value}
                style={[
                  styles.roleCard,
                  selectedRole === role.value && styles.roleCardSelected,
                ]}
                onPress={() => handleRoleSelect(role.value)}
              >
                <Text style={styles.roleIcon}>{role.icon}</Text>
                <Text
                  style={[
                    styles.roleLabel,
                    selectedRole === role.value && styles.roleLabelSelected,
                  ]}
                >
                  {role.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 'phone' && (
          <>
            <View style={styles.selectedRoleContainer}>
              <Text style={styles.selectedRoleText}>
                نوع الحساب: {roles.find((r) => r.value === selectedRole)?.label}
              </Text>
            </View>

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
              <Text style={styles.buttonText}>متابعة</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'pin' && (
          <>
            <View style={styles.phoneDisplayContainer}>
              <Text style={styles.phoneDisplayLabel}>رقم الموبايل:</Text>
              <Text style={styles.phoneDisplay}>{formatPhone(phone)}</Text>
            </View>

            <View style={styles.pinContainer}>
              <Text style={styles.pinLabel}>أنشئ رمز PIN (6 أرقام)</Text>
              <PinInput
                value={pin}
                onChange={setPin}
                onComplete={handlePinComplete}
                disabled={loading}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.button, (loading || pin.length !== 6) && styles.buttonDisabled]}
              onPress={() => {
                if (pin.length === 6) {
                  setStep('confirmPin');
                }
              }}
              disabled={loading || pin.length !== 6}
            >
              <Text style={styles.buttonText}>متابعة</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'confirmPin' && (
          <>
            <View style={styles.pinContainer}>
              <Text style={styles.pinLabel}>أكد رمز PIN</Text>
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                onComplete={handleConfirmPinComplete}
                disabled={loading}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                (loading || confirmPin.length !== 6 || pin !== confirmPin) && styles.buttonDisabled,
              ]}
              onPress={handleRegister}
              disabled={loading || confirmPin.length !== 6 || pin !== confirmPin}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>إنشاء الحساب</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {(step === 'phone' || step === 'pin' || step === 'confirmPin') && (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← رجوع</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={styles.loginButton}
        >
          <Text style={styles.loginText}>
            لديك حساب بالفعل؟ تسجيل الدخول
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
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  roleCard: {
    width: responsive.isTablet() ? 140 : 110,
    height: responsive.isTablet() ? 140 : 110,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  roleCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  roleIcon: {
    fontSize: responsive.getResponsiveFontSize(40),
    marginBottom: 8,
  },
  roleLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#666',
  },
  roleLabelSelected: {
    color: '#007AFF',
  },
  selectedRoleContainer: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  selectedRoleText: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
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
  },
  pinContainer: {
    marginVertical: 20,
  },
  pinLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    textAlign: 'center',
    marginBottom: 16,
    color: '#666',
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
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(14),
  },
  loginButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginText: {
    color: '#007AFF',
    fontSize: responsive.getResponsiveFontSize(16),
  },
});
