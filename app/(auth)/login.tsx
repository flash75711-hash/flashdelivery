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
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  // رقم هاتف افتراضي للاختبار
  const [phone, setPhone] = useState('01200006637');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  // إذا كان المستخدم مسجل دخول بالفعل، نعيد التوجيه
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, authLoading, router]);

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

  // رقم هاتف للاختبار (في development mode)
  const TEST_PHONE = '+201200006637'; // يمكن تغييره
  const TEST_OTP = '123456'; // OTP ثابت للاختبار

  const handleSendOtp = async () => {
    if (!phone) {
      Alert.alert('تنبيه', 'الرجاء إدخال رقم الهاتف');
      return;
    }

    // التحقق من صحة رقم الهاتف (يجب أن يكون 11 رقم على الأقل)
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      Alert.alert('تنبيه', 'الرجاء إدخال رقم هاتف صحيح');
      return;
    }

    setSendingOtp(true);
    console.log('Login: Sending OTP to phone:', phone);
    
    try {
      const formattedPhone = formatPhoneNumber(phone);
      console.log('Login: Formatted phone:', formattedPhone);
      
      // إرسال OTP فعلياً (حتى لرقم الاختبار)
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) {
        console.error('Login: Error sending OTP:', error);
        
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
      console.error('Login: Error in send OTP:', error);
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
    console.log('Login: Verifying OTP...');
    
    try {
      const formattedPhone = formatPhoneNumber(phone);
      
      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms',
      });

      if (error) {
        console.error('Login: Error verifying OTP:', error);
        Alert.alert('خطأ', error.message || 'رمز التحقق غير صحيح');
      } else if (data.session) {
        console.log('Login: OTP verified successfully, session created');
        // الانتظار قليلاً لضمان تحديث حالة المصادقة
        await new Promise(resolve => setTimeout(resolve, 500));
        router.replace('/(tabs)');
      } else {
        Alert.alert('خطأ', 'فشل إنشاء الجلسة');
      }
    } catch (error: any) {
      console.error('Login: Error in verify OTP:', error);
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Flash Delivery</Text>
        <Text style={styles.subtitle}>تسجيل الدخول برقم الهاتف</Text>

        {/* ملاحظة للاختبار */}
        <View style={styles.testNote}>
          <Text style={styles.testNoteText}>
            ⚠️ مهم: يجب إضافة Test Phone Numbers في Supabase أولاً{'\n'}
            💡 للاختبار: استخدم رقم {TEST_PHONE.replace('+20', '0')} مع OTP: {TEST_OTP}{'\n'}
            📋 في Supabase: Phone settings → Test Phone Numbers → أدخل: +201200006637=123456
          </Text>
        </View>

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
                <Text style={styles.buttonText}>تحقق من الرمز</Text>
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
          onPress={() => router.replace('/(auth)/register')}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            ليس لديك حساب؟ إنشاء حساب جديد
          </Text>
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
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
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
  testNote: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  testNoteText: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'right',
  },
});
