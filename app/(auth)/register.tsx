import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { UserRole, supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  // رقم هاتف افتراضي للاختبار
  const [phone, setPhone] = useState('01200006637');
  const [otp, setOtp] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const router = useRouter();
  const { t } = useTranslation();

  // عداد تنازلي للانتظار
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds(cooldownSeconds - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  // تنسيق رقم الهاتف
  const formatPhoneNumber = (text: string) => {
    // إزالة جميع الأحرف غير الرقمية
    const cleaned = text.replace(/\D/g, '');
    
    // إذا بدأ بـ 0، نستبدله بـ +20
    if (cleaned.startsWith('0')) {
      return '+20' + cleaned.substring(1);
    }
    
    // إذا لم يبدأ بـ +، نضيف +20
    if (!cleaned.startsWith('20')) {
      return '+20' + cleaned;
    }
    
    return '+' + cleaned;
  };

  const handleSendOtp = async () => {
    if (!phone) {
      Alert.alert('تنبيه', 'الرجاء إدخال رقم الهاتف');
      return;
    }

    // التحقق من صحة رقم الهاتف
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      Alert.alert('تنبيه', 'الرجاء إدخال رقم هاتف صحيح');
      return;
    }

    setSendingOtp(true);
    console.log('Register: Sending OTP to phone:', phone);
    
    try {
      const formattedPhone = formatPhoneNumber(phone);
      console.log('Register: Formatted phone:', formattedPhone);
      
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) {
        console.error('Register: Error sending OTP:', error);
        
        // معالجة خطأ 429 (Too Many Requests)
        if (error.status === 429 || error.message?.includes('40 seconds')) {
          setCooldownSeconds(40);
          Alert.alert(
            'تم تجاوز الحد المسموح',
            'لأسباب أمنية، يرجى الانتظار 40 ثانية قبل المحاولة مرة أخرى.',
            [{ text: 'حسناً' }]
          );
        } else {
          Alert.alert('خطأ', error.message || 'فشل إرسال رمز التحقق');
        }
      } else {
        setOtpSent(true);
        Alert.alert('تم الإرسال', 'تم إرسال رمز التحقق إلى رقم هاتفك');
      }
    } catch (error: any) {
      console.error('Register: Error in send OTP:', error);
      Alert.alert('خطأ', error.message || 'حدث خطأ أثناء إرسال رمز التحقق');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('تنبيه', 'الرجاء إدخال رمز التحقق المكون من 6 أرقام');
      return;
    }

    setLoading(true);
    console.log('Register: Verifying OTP...');
    
    try {
      const formattedPhone = formatPhoneNumber(phone);
      
      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms',
      });

      if (error) {
        console.error('Register: Error verifying OTP:', error);
        Alert.alert('خطأ', error.message || 'رمز التحقق غير صحيح');
      } else if (data.session && data.user) {
        console.log('Register: OTP verified successfully, user:', data.user.id);
        
        // إنشاء أو تحديث ملف المستخدم
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            phone: formattedPhone,
            role,
          }, {
            onConflict: 'id',
          });

        if (profileError) {
          console.error('Register: Error creating/updating profile:', profileError);
          // لا نرمي الخطأ هنا لأن المستخدم تم تسجيل دخوله بالفعل
        }

        // الانتظار قليلاً لضمان تحديث حالة المصادقة
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('Register: Registration successful, navigating to tabs...');
        // للعملاء: التوجيه مباشرة للصفحة الرئيسية (يمكنهم إضافة الاسم والعنوان من الصفحة الشخصية)
        // للباقي: التوجيه لصفحة إكمال التسجيل
        if (role === 'customer') {
          router.replace('/(tabs)');
        } else {
          router.replace(`/(auth)/complete-registration/${role}?phone=${encodeURIComponent(formattedPhone)}`);
        }
      } else {
        Alert.alert('خطأ', 'فشل إنشاء الجلسة');
      }
    } catch (error: any) {
      console.error('Register: Error in verify OTP:', error);
      Alert.alert('خطأ', error.message || 'حدث خطأ أثناء التحقق من رمز التحقق');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpSent(false);
    setOtp('');
    await handleSendOtp();
  };

  const roles: { value: UserRole; label: string }[] = [
    { value: 'customer', label: t('roles.customer') },
    { value: 'driver', label: t('roles.driver') },
    { value: 'vendor', label: t('roles.vendor') },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>إنشاء حساب جديد</Text>

        <Text style={styles.subtitle}>أدخل رقم هاتفك واختر نوع الحساب</Text>

        <TextInput
          style={styles.input}
          placeholder="رقم الهاتف (مثال: 01234567890)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholderTextColor="#999"
          textAlign="right"
          editable={!otpSent}
        />

        <Text style={styles.label}>اختر نوع الحساب:</Text>
        <View style={styles.roleContainer}>
          {roles.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.roleButton,
                role === r.value && styles.roleButtonActive,
              ]}
              onPress={() => setRole(r.value)}
              disabled={otpSent}
            >
              <Text
                style={[
                  styles.roleButtonText,
                  role === r.value && styles.roleButtonTextActive,
                ]}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {otpSent && (
          <>
            <TextInput
              style={styles.input}
              placeholder="رمز التحقق (6 أرقام)"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholderTextColor="#999"
              textAlign="center"
              autoFocus
            />

            <TouchableOpacity
              onPress={handleResendOtp}
              style={styles.resendButton}
              disabled={cooldownSeconds > 0}
            >
              <Text style={[styles.resendText, cooldownSeconds > 0 && styles.resendTextDisabled]}>
                {cooldownSeconds > 0 
                  ? `إعادة الإرسال بعد ${cooldownSeconds} ثانية`
                  : 'إعادة إرسال رمز التحقق'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>تحقق وإنشاء الحساب</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {!otpSent && (
          <TouchableOpacity
            style={[styles.button, (sendingOtp || cooldownSeconds > 0) && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={sendingOtp || cooldownSeconds > 0}
          >
            {sendingOtp ? (
              <ActivityIndicator color="#fff" />
            ) : cooldownSeconds > 0 ? (
              <Text style={styles.buttonText}>انتظر {cooldownSeconds} ثانية</Text>
            ) : (
              <Text style={styles.buttonText}>إرسال رمز التحقق</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>لديك حساب بالفعل؟ تسجيل الدخول</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
    textAlign: 'right',
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  roleButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  roleButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  roleButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
  resendButton: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  resendText: {
    color: '#007AFF',
    fontSize: 14,
  },
  resendTextDisabled: {
    color: '#999',
  },
});
