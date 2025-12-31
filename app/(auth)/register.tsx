/**
 * Register Screen - PIN Authentication
 * شاشة التسجيل باستخدام رقم الموبايل و PIN
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { registerWithPin, formatPhone, isValidPhone, checkPhoneExists, type UserRole } from '@/lib/pinAuth';
import { showToast } from '@/lib/alert';
import { vibrateError, vibrateSuccess } from '@/lib/vibration';
import PinInput from '@/components/PinInput';
import responsive from '@/utils/responsive';
import { useAuth } from '@/contexts/AuthContext';

export default function RegisterScreen() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'role' | 'phone' | 'pin' | 'confirmPin'>('role');
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const registrationCompleteRef = useRef(false);
  const isRegisteringRef = useRef(false); // لمنع الاستدعاءات المتعددة
  const router = useRouter();
  const { t } = useTranslation();
  const { loginWithPin } = useAuth();
  
  const styles = getStyles();

  const roles: { value: UserRole; label: string; icon: string }[] = [
    { value: 'customer', label: 'عميل', icon: '👤' },
    { value: 'driver', label: 'سائق', icon: '🚗' },
    { value: 'vendor', label: 'مزود خدمة', icon: '🏪' },
  ];

  // التحقق من وجود رقم الموبايل أثناء الإدخال (debounced)
  // ملاحظة: التحقق من صحة الرقم يتم فقط عند الضغط على "متابعة"
  useEffect(() => {
    console.log('🔍 [useEffect] Phone check effect triggered', {
      phone,
      step,
      registrationComplete,
      registrationCompleteRef: registrationCompleteRef.current,
    });

    // لا نتحقق إذا تم التسجيل بنجاح
    if (registrationComplete) {
      console.log('⏭️ [useEffect] Skipping check - registrationComplete is true');
      return;
    }

    // التحقق فقط عند خطوة phone
    if (step !== 'phone') {
      console.log('⏭️ [useEffect] Skipping check - step is not phone:', step);
      return;
    }

    // إلغاء التحقق السابق إذا كان موجوداً
    if (checkTimeoutRef.current) {
      console.log('🛑 [useEffect] Clearing previous timeout');
      clearTimeout(checkTimeoutRef.current);
    }

    // إعادة تعيين الحالة إذا كان الرقم فارغاً
    if (!phone.trim()) {
      console.log('⏭️ [useEffect] Skipping check - phone is empty');
      setPhoneExists(false);
      setCheckingPhone(false);
      return;
    }

    // التحقق من صحة تنسيق الرقم قبل التحقق من الوجود
    const formatted = formatPhone(phone);
    const isValid = isValidPhone(formatted);

    // إذا كان الرقم غير صحيح، لا نتحقق من الوجود
    if (!isValid) {
      console.log('⏭️ [useEffect] Skipping check - phone format is invalid');
      setPhoneExists(false);
      setCheckingPhone(false);
      return;
    }

    // انتظار 800ms قبل التحقق من الوجود (debounce)
    console.log('⏳ [useEffect] Setting timeout to check phone in 800ms');
    setCheckingPhone(true);
    checkTimeoutRef.current = setTimeout(async () => {
      console.log('⏰ [setTimeout] Timeout executed, checking phone existence', {
        phone,
        registrationCompleteRef: registrationCompleteRef.current,
      });

      // التحقق من أن التسجيل لم يكتمل بعد (لتجنب التحقق بعد التسجيل الناجح)
      // نستخدم ref للتحقق من القيمة الحالية وليس القيمة المقفلة
      if (registrationCompleteRef.current) {
        console.log('✅ [setTimeout] Skipping check - registration completed');
        setCheckingPhone(false);
        return;
      }
      
      try {
        console.log('🔎 [setTimeout] Calling checkPhoneExists...');
        const exists = await checkPhoneExists(phone);
        console.log('📊 [setTimeout] checkPhoneExists result:', exists);
        
        // التحقق مرة أخرى بعد استدعاء checkPhoneExists (قد يكون التسجيل اكتمل أثناء الانتظار)
        if (registrationCompleteRef.current) {
          console.log('✅ [setTimeout] Registration completed during check, skipping result');
          setCheckingPhone(false);
          return;
        }
        
        console.log('📝 [setTimeout] Setting phoneExists to:', exists);
        setPhoneExists(exists);
        if (exists) {
          console.log('❌ [setTimeout] Phone exists, showing error toast');
          vibrateError();
          showToast('رقم الموبايل مسجل بالفعل', 'error');
        } else {
          console.log('✅ [setTimeout] Phone does not exist, registration can proceed');
        }
      } catch (error) {
        console.error('❌ [setTimeout] Error checking phone:', error);
        // لا نحدث الحالة إذا كان التسجيل قد اكتمل
        if (!registrationCompleteRef.current) {
          setPhoneExists(false);
        }
      } finally {
        if (!registrationCompleteRef.current) {
          setCheckingPhone(false);
        }
      }
    }, 800);

    // تنظيف عند إلغاء التحميل
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [phone, step, registrationComplete]);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStep('phone');
  };

  const handlePhoneSubmit = async () => {
    if (!phone.trim()) {
      showToast('الرجاء إدخال رقم الموبايل', 'warning');
      vibrateError();
      return;
    }

    const formatted = formatPhone(phone);
    if (!isValidPhone(formatted)) {
      setPhoneInvalid(true);
      showToast('رقم الموبايل غير صحيح', 'error');
      vibrateError();
      return;
    }

    // التحقق من وجود الرقم قبل المتابعة
    if (checkingPhone) {
      showToast('جاري التحقق من الرقم...', 'info');
      return;
    }

    if (phoneExists) {
      showToast('رقم الموبايل مسجل بالفعل', 'error');
      vibrateError();
      return;
    }

    setPhoneInvalid(false);
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

    // منع الاستدعاء إذا كان التسجيل قيد التنفيذ
    if (isRegisteringRef.current || loading) {
      console.log('⏸️ [handleConfirmPinComplete] Registration already in progress, skipping');
      return;
    }

    await handleRegister();
  };

  const handleRegister = async () => {
    // منع الاستدعاءات المتعددة
    if (isRegisteringRef.current || loading) {
      console.log('⏸️ [handleRegister] Registration already in progress, skipping');
      return;
    }

    if (!phone.trim()) {
      showToast('الرجاء إدخال رقم الموبايل', 'warning');
      return;
    }

    const formatted = formatPhone(phone);
    if (!isValidPhone(formatted)) {
      setPhoneInvalid(true);
      showToast('رقم الموبايل غير صحيح', 'error');
      vibrateError();
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

    console.log('🚀 [handleRegister] Starting registration', {
      phone,
      role: selectedRole,
      registrationCompleteBefore: registrationComplete,
      registrationCompleteRefBefore: registrationCompleteRef.current,
      isRegisteringBefore: isRegisteringRef.current,
    });

    // تعيين flag لمنع الاستدعاءات المتعددة
    isRegisteringRef.current = true;
    setLoading(true);
    // منع التحقق من وجود الرقم بعد بدء التسجيل
    setRegistrationComplete(true);
    registrationCompleteRef.current = true; // تحديث ref أيضاً
    console.log('🔒 [handleRegister] Set registrationComplete to true');

    // إلغاء أي تحقق قيد التنفيذ
    if (checkTimeoutRef.current) {
      console.log('🛑 [handleRegister] Clearing pending phone check timeout');
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }
    setCheckingPhone(false);
    setPhoneExists(false);

    try {
      console.log('📞 [handleRegister] Calling registerWithPin...');
      const result = await registerWithPin(phone, pin, selectedRole);
      console.log('📊 [handleRegister] registerWithPin result:', {
        success: result.success,
        hasUser: !!result.user,
        error: result.error,
      });

      if (result.success && result.user) {
        console.log('✅ [handleRegister] Registration successful, showing success toast');
        vibrateSuccess();
        showToast('تم إنشاء الحساب بنجاح', 'success');
        
        // تسجيل الدخول تلقائياً بعد إنشاء الحساب
        try {
          console.log('🔐 [handleRegister] Attempting auto-login...');
          await loginWithPin({
            id: result.user.id,
            phone: result.user.phone,
            role: result.user.role,
            full_name: result.user.full_name || null,
            email: result.user.email || null,
          });
          console.log('✅ [handleRegister] Auto-login successful, navigating to tabs');
          
          // التنقل للصفحة الرئيسية حسب دور المستخدم
          // لا نعيد تعيين isRegisteringRef هنا لأننا سنترك الصفحة
          setTimeout(() => {
            console.log('🧭 [handleRegister] Navigating to /(tabs)');
            router.replace('/(tabs)');
          }, 500);
          // لا نعيد تعيين isRegisteringRef هنا لأننا سنترك الصفحة
          return; // خروج مبكر بعد النجاح
        } catch (loginError: any) {
          console.error('❌ [handleRegister] Auto-login error:', loginError);
          // إذا فشل تسجيل الدخول التلقائي، نوجه المستخدم لصفحة تسجيل الدخول
          showToast('تم إنشاء الحساب. يرجى تسجيل الدخول', 'info');
          setTimeout(() => {
            router.replace('/(auth)/login');
          }, 1000);
          // لا نعيد تعيين isRegisteringRef هنا لأننا سنترك الصفحة
          return; // خروج مبكر
        }
      } else {
        console.log('❌ [handleRegister] Registration failed:', result.error);
        // إعادة تفعيل التحقق إذا فشل التسجيل
        setRegistrationComplete(false);
        registrationCompleteRef.current = false; // تحديث ref أيضاً
        isRegisteringRef.current = false; // إعادة تعيين flag
        console.log('🔓 [handleRegister] Reset registrationComplete and isRegistering to false');
        vibrateError();
        showToast(result.error || 'فشل إنشاء الحساب', 'error');
      }
    } catch (error: any) {
      console.error('❌ [handleRegister] Registration exception:', error);
      // إعادة تفعيل التحقق إذا فشل التسجيل
      setRegistrationComplete(false);
      registrationCompleteRef.current = false; // تحديث ref أيضاً
      isRegisteringRef.current = false; // إعادة تعيين flag
      console.log('🔓 [handleRegister] Reset registrationComplete and isRegistering to false (exception)');
      vibrateError();
      showToast(error.message || 'حدث خطأ أثناء التسجيل', 'error');
    } finally {
      setLoading(false);
      // لا نعيد تعيين isRegisteringRef هنا إذا كان التسجيل نجح (لأننا سنترك الصفحة)
      // ولكن إذا فشل، نعيد تعيينه في الـ catch/else blocks
    }
  };

  const handleBack = () => {
    if (step === 'phone') {
      console.log('🔙 [handleBack] Resetting phone step, clearing registrationComplete');
      setStep('role');
      setPhone('');
      setPhoneExists(false);
      setPhoneInvalid(false);
      setCheckingPhone(false);
      setRegistrationComplete(false);
      registrationCompleteRef.current = false; // تحديث ref أيضاً
      isRegisteringRef.current = false; // إعادة تعيين flag
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
                style={[
                  styles.input,
                  phoneExists && styles.inputError,
                  checkingPhone && styles.inputChecking,
                  phoneInvalid && styles.inputError,
                ]}
                placeholder="رقم الموبايل (مثال: 01234567890)"
                value={phone}
                onChangeText={(text) => {
                  const cleaned = text.replace(/\D/g, '');
                  setPhone(cleaned);
                  setPhoneExists(false);
                  setPhoneInvalid(false);
                }}
                keyboardType="phone-pad"
                placeholderTextColor="#999"
                textAlign="right"
                autoFocus
                onSubmitEditing={handlePhoneSubmit}
                maxLength={15}
              />
              {checkingPhone && !phoneInvalid && (
                <View style={styles.checkingContainer}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.checkingText}>جاري التحقق...</Text>
                </View>
              )}
              {phoneInvalid && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>⚠️ رقم الموبايل غير صحيح</Text>
                </View>
              )}
              {phoneExists && !checkingPhone && !phoneInvalid && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>⚠️ رقم الموبايل مسجل بالفعل</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                (loading || !phone.trim() || phoneExists || phoneInvalid || checkingPhone) && styles.buttonDisabled,
              ]}
              onPress={handlePhoneSubmit}
              disabled={loading || !phone.trim() || phoneExists || phoneInvalid || checkingPhone}
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
  inputError: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  inputChecking: {
    borderColor: '#007AFF',
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  checkingText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
  },
  errorContainer: {
    marginTop: 8,
  },
  errorText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#FF3B30',
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
