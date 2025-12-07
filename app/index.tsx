import { useEffect, useState } from 'react';
import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isRegistrationComplete, supabase } from '@/lib/supabase';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Platform } from 'react-native';

export default function Index() {
  const { user, loading, loadUser } = useAuth();
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [needsCompletion, setNeedsCompletion] = useState(false);
  const [processingCallback, setProcessingCallback] = useState(false);
  const router = useRouter();
  const searchParams = useLocalSearchParams();

  // معالجة OAuth callback في المتصفح
  // ملاحظة: Supabase مع detectSessionInUrl: true يجب أن يتعامل مع الـ callback تلقائياً
  // لكننا نضيف معالجة يدوية كـ fallback
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !processingCallback) {
      const handleAuthCallback = async () => {
        const code = searchParams.code as string | undefined;
        
        if (code) {
          setProcessingCallback(true);
          console.log('OAuth callback detected with code:', code.substring(0, 20) + '...');
          
          // التحقق من وجود code_verifier في localStorage
          if (typeof window !== 'undefined') {
            const localStorageKeys = Object.keys(window.localStorage);
            const codeVerifierKeys = localStorageKeys.filter(key => 
              key.includes('code-verifier') || key.includes('code_verifier') || key.includes('verifier')
            );
            console.log('Code verifier keys in localStorage:', codeVerifierKeys);
            
            // طباعة جميع مفاتيح Supabase
            const supabaseKeys = localStorageKeys.filter(key => key.includes('supabase') || key.includes('sb-'));
            console.log('All Supabase keys in localStorage:', supabaseKeys);
          }
          
          try {
            // التحقق السريع من وجود session (بدون انتظار طويل)
            console.log('Checking for existing session...');
            const sessionCheckPromise = supabase.auth.getSession();
            const quickTimeout = new Promise((resolve) => 
              setTimeout(() => resolve({ data: { session: null } }), 500)
            );
            const { data: { session: existingSession } } = await Promise.race([
              sessionCheckPromise,
              quickTimeout
            ]) as any;
            
            if (existingSession) {
              console.log('Session already exists, user:', existingSession.user?.id);
              window.history.replaceState({}, '', window.location.pathname);
              await loadUser();
              setProcessingCallback(false);
              return;
            }
            
            // استدعاء exchangeCodeForSession مباشرة
            console.log('Calling exchangeCodeForSession...');
            const exchangePromise = supabase.auth.exchangeCodeForSession(code);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('exchangeCodeForSession timeout after 15 seconds')), 15000)
            );
            
            let data, error;
            try {
              const result = await Promise.race([exchangePromise, timeoutPromise]);
              data = (result as any)?.data;
              error = (result as any)?.error;
            } catch (err: any) {
              console.error('exchangeCodeForSession failed or timed out:', err);
              error = err;
              data = null;
            }
            
            console.log('exchangeCodeForSession result:', { 
              hasData: !!data, 
              hasError: !!error, 
              hasSession: !!data?.session,
              errorMessage: error?.message,
              errorCode: error?.code
            });
            
            // إزالة الـ code من URL
            window.history.replaceState({}, '', window.location.pathname);
            
            if (error) {
              console.error('Error exchanging code for session:', error);
              // ننتظر قليلاً لضمان استدعاء onAuthStateChange
              await new Promise(resolve => setTimeout(resolve, 2000));
              try {
                await loadUser();
              } catch (err) {
                console.error('Error in fallback loadUser:', err);
              }
              setProcessingCallback(false);
              return;
            }
            
            if (data?.session) {
              console.log('Session exchanged successfully, session user:', data.session.user?.id);
              // ننتظر قليلاً لضمان استدعاء onAuthStateChange
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                await loadUser();
                console.log('User loaded after exchangeCodeForSession');
              } catch (error) {
                console.error('Error loading user after exchangeCodeForSession:', error);
              }
              setProcessingCallback(false);
            } else {
              console.warn('No session in exchangeCodeForSession result');
              await new Promise(resolve => setTimeout(resolve, 2000));
              try {
                await loadUser();
              } catch (err) {
                console.error('Error in fallback loadUser:', err);
              }
              setProcessingCallback(false);
            }
          } catch (error) {
            console.error('Error handling auth callback:', error);
            window.history.replaceState({}, '', window.location.pathname);
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
              await loadUser();
            } catch (err) {
              console.error('Error in fallback loadUser:', err);
            }
            setProcessingCallback(false);
          }
        }
      };

      handleAuthCallback();
    }
  }, [searchParams.code, processingCallback, loadUser]);

  useEffect(() => {
    const checkRegistration = async () => {
      if (user && !loading && !checkingRegistration) {
        setCheckingRegistration(true);
        try {
          // للعملاء: لا نحتاج للتحقق من إكمال التسجيل، يمكنهم إضافة البيانات من الصفحة الشخصية
          if (user.role === 'customer') {
            setNeedsCompletion(false);
          } else {
            // للباقي (driver, vendor, admin): نتحقق من إكمال التسجيل
            const isComplete = await isRegistrationComplete(user.id);
            if (!isComplete) {
              setNeedsCompletion(true);
            } else {
              setNeedsCompletion(false);
            }
          }
        } catch (error) {
          console.error('Error checking registration:', error);
          // في حالة الخطأ، للعملاء لا نحتاج لإكمال التسجيل، للباقي نتحقق
          if (user.role === 'customer') {
            setNeedsCompletion(false);
          } else {
            setNeedsCompletion(true);
          }
        } finally {
          setCheckingRegistration(false);
        }
      } else if (!user && !loading) {
        // إذا لم يكن هناك مستخدم، نتأكد من إعادة تعيين الحالة
        setNeedsCompletion(false);
        setCheckingRegistration(false);
      }
    };

    checkRegistration();
  }, [user, loading]);

  // Timeout للتحميل - إذا استمر التحميل لأكثر من 20 ثانية وليس هناك callback قيد المعالجة، نعيد التوجيه
  useEffect(() => {
    if (loading && !processingCallback) {
      const timeout = setTimeout(() => {
        console.warn('Loading timeout - redirecting to login');
        router.replace('/(auth)/login');
      }, 20000); // 20 ثانية

      return () => clearTimeout(timeout);
    }
  }, [loading, router, processingCallback]);

  if (loading || checkingRegistration || processingCallback) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (user && needsCompletion) {
    // استخدام phone إذا كان متوفراً، وإلا email للتوافق مع الحسابات القديمة
    const identifier = user.phone || user.email || '';
    const paramName = user.phone ? 'phone' : 'email';
    return <Redirect href={`/(auth)/complete-registration/${user.role}?${paramName}=${encodeURIComponent(identifier)}`} />;
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

