import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, getUserWithRole, getUserWithRoleFromSession, isRegistrationComplete, User, UserRole, getUserFromLocalStorage } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// TypeScript interface لـ AndroidBridge
declare global {
  interface Window {
    AndroidBridge?: {
      getFCMToken: () => string | null | Promise<string | null>;
    };
  }
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  loadUser: () => Promise<void>;
  loginWithPin: (userData: { id: string; phone: string; role: UserRole; full_name?: string | null; email?: string | null }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUser, setLoadingUser] = useState(false);

  const loadUser = useCallback(async () => {
    // تجنب استدعاء loadUser عدة مرات في نفس الوقت
    if (loadingUser) {
      console.log('⏭️ loadUser already in progress, skipping...');
      return;
    }
    
    console.log('🔄 Loading user...');
    setLoadingUser(true);
    try {
      const userData = await getUserWithRole();
      console.log('✅ User loaded:', userData ? `User ID: ${userData.id}, Role: ${userData.role}` : 'No user');
      if (userData) {
        setUser(userData);
        console.log('✅ User state updated in AuthContext');
      } else {
        console.warn('⚠️ No user data returned from getUserWithRole');
        setUser(null);
      }
      // لا نضع setLoading(false) هنا لأن getSession قد يكون لم يكمل بعد
      // setLoading(false) سيتم استدعاؤه في onAuthStateChange أو getSession
    } catch (error) {
      console.error('❌ Error loading user:', error);
      // في حالة الخطأ، نرجع null للمستخدم
      setUser(null);
    } finally {
      setLoadingUser(false);
      console.log('✅ loadUser completed');
    }
  }, []);

  // دالة لجلب FCM token من AndroidBridge وحفظه في Supabase
  const updateFCMToken = useCallback(async (userId: string, testToken?: string) => {
    console.log('📱 [updateFCMToken] ========== Starting FCM Token Update ==========');
    console.log('📱 [updateFCMToken] User ID:', userId);
    console.log('📱 [updateFCMToken] Test mode:', !!testToken);
    
    // التحقق من أننا في WebView Android
    if (typeof window === 'undefined') {
      console.log('❌ [updateFCMToken] window is undefined, skipping');
      return;
    }

    let fcmToken: string | null = null;

    // إذا كان هناك testToken، نستخدمه مباشرة (للتجربة)
    if (testToken) {
      console.log('🧪 [updateFCMToken] Using test token for debugging');
      fcmToken = testToken;
    } else {
      // التحقق من وجود AndroidBridge مع logging مفصل
      console.log('📱 [updateFCMToken] Checking AndroidBridge...');
      console.log('📱 [updateFCMToken] window type:', typeof window);
      console.log('📱 [updateFCMToken] window.AndroidBridge type:', typeof window.AndroidBridge);
      console.log('📱 [updateFCMToken] window.AndroidBridge value:', window.AndroidBridge);
      
      if (!window.AndroidBridge) {
        console.warn('❌ [updateFCMToken] AndroidBridge not available');
        console.warn('⚠️ [updateFCMToken] This might be because:');
        console.warn('   - Not running in Android WebView');
        console.warn('   - AndroidBridge not injected yet');
        console.warn('   - Running in browser instead of WebView');
        console.warn('📱 [updateFCMToken] ========== Aborting ==========');
        return;
      }

    console.log('✅ [updateFCMToken] AndroidBridge object found!');
    console.log('📱 [updateFCMToken] AndroidBridge keys:', Object.keys(window.AndroidBridge));
    console.log('📱 [updateFCMToken] getFCMToken type:', typeof window.AndroidBridge.getFCMToken);

    if (!window.AndroidBridge.getFCMToken) {
      console.warn('❌ [updateFCMToken] getFCMToken method not available');
      console.warn('⚠️ [updateFCMToken] Available methods:', Object.keys(window.AndroidBridge));
      console.warn('📱 [updateFCMToken] ========== Aborting ==========');
      return;
    }

      console.log('✅ [updateFCMToken] AndroidBridge is available and ready');

      try {
        console.log('📱 [updateFCMToken] Attempting to get FCM token from AndroidBridge...');
        
        // محاولة جلب التوكن مع معالجة التأخير المحتمل
        try {
          // إذا كانت getFCMToken دالة async، نستخدم await
          const tokenResult = window.AndroidBridge.getFCMToken();
          console.log('📱 [updateFCMToken] getFCMToken called, result type:', typeof tokenResult, tokenResult instanceof Promise ? 'Promise' : 'direct');
          
          if (tokenResult instanceof Promise) {
            // إضافة timeout لمدة 5 ثوانٍ
            const timeoutPromise = new Promise<string | null>((_, reject) =>
              setTimeout(() => reject(new Error('FCM token timeout after 5 seconds')), 5000)
            );
            fcmToken = await Promise.race([tokenResult, timeoutPromise]);
          } else {
            fcmToken = tokenResult;
          }
        } catch (error) {
          console.error('❌ [updateFCMToken] Error getting FCM token:', error);
          // إذا فشل، نجرب مرة أخرى بعد ثانية واحدة
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            console.log('📱 [updateFCMToken] Retrying to get FCM token...');
            const retryResult = window.AndroidBridge.getFCMToken();
            if (retryResult instanceof Promise) {
              const timeoutPromise = new Promise<string | null>((_, reject) =>
                setTimeout(() => reject(new Error('FCM token retry timeout')), 3000)
              );
              fcmToken = await Promise.race([retryResult, timeoutPromise]);
            } else {
              fcmToken = retryResult;
            }
          } catch (retryError) {
            console.error('❌ [updateFCMToken] Error getting FCM token on retry:', retryError);
            return;
          }
        }

        if (!fcmToken || fcmToken.trim() === '') {
          console.warn('⚠️ [updateFCMToken] FCM token is empty or null');
          return;
        }

        console.log('✅ [updateFCMToken] FCM token received:', fcmToken.substring(0, 20) + '...');
      } catch (error) {
        console.error('❌ [updateFCMToken] Error in token retrieval:', error);
        return;
      }
    }

    // حفظ التوكن في Supabase - جدول profiles
    try {
      // استخدام Edge Function مباشرة لتحديث FCM token في جدول profiles
      // هذا يتجاوز RLS ويعمل حتى بدون session (مثل تسجيل الدخول بـ PIN)
      console.log('📱 [updateFCMToken] ========== Saving to profiles table ==========');
      console.log('📱 [updateFCMToken] User ID:', userId);
      console.log('📱 [updateFCMToken] FCM Token (first 30 chars):', fcmToken.substring(0, 30) + '...');
      console.log('📱 [updateFCMToken] FCM Token length:', fcmToken.length);
      console.log('📱 [updateFCMToken] Calling Edge Function: update-fcm-token');
      console.log('📱 [updateFCMToken] Request payload:', {
        user_id: userId,
        fcm_token: fcmToken.substring(0, 30) + '...',
        fcm_token_length: fcmToken.length,
      });
      
      const edgeFunctionStartTime = Date.now();
      let edgeData: any = null;
      let edgeError: any = null;
      
      try {
        // الحصول على Supabase URL من client
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/update-fcm-token`;
        
        console.log('📱 [updateFCMToken] About to invoke Edge Function...');
        console.log('📱 [updateFCMToken] Edge Function URL:', edgeFunctionUrl);
        console.log('📱 [updateFCMToken] Supabase URL configured:', !!supabaseUrl);
        console.log('📱 [updateFCMToken] Request payload:', {
          user_id: userId,
          fcm_token: fcmToken.substring(0, 30) + '...',
          fcm_token_length: fcmToken.length,
        });
        
        const result = await supabase.functions.invoke('update-fcm-token', {
          body: { user_id: userId, fcm_token: fcmToken },
        });
        
        console.log('📱 [updateFCMToken] Edge Function invoke completed');
        console.log('📱 [updateFCMToken] Full result object:', {
          hasData: !!result.data,
          hasError: !!result.error,
          dataKeys: result.data ? Object.keys(result.data) : [],
          errorKeys: result.error ? Object.keys(result.error) : [],
        });
        
        edgeData = result.data;
        edgeError = result.error;
      } catch (invokeError: any) {
        console.error('❌ [updateFCMToken] Exception during Edge Function invoke:', invokeError);
        console.error('❌ [updateFCMToken] Error type:', invokeError?.constructor?.name);
        console.error('❌ [updateFCMToken] Error message:', invokeError?.message);
        console.error('❌ [updateFCMToken] Error stack:', invokeError?.stack);
        edgeError = invokeError;
      }
      
      const edgeFunctionDuration = Date.now() - edgeFunctionStartTime;
      console.log('📱 [updateFCMToken] Edge Function call completed in', edgeFunctionDuration, 'ms');
      
      console.log('📱 [updateFCMToken] Edge Function response received');
      console.log('📱 [updateFCMToken] Response has error:', !!edgeError);
      console.log('📱 [updateFCMToken] Response has data:', !!edgeData);
      
      if (edgeError) {
        console.error('❌ [updateFCMToken] Edge Function error:', edgeError);
        console.error('❌ [updateFCMToken] Error details:', {
          message: edgeError.message,
          context: edgeError.context,
          name: edgeError.name,
          code: edgeError.code,
          status: edgeError.status,
        });
        throw edgeError;
      } else {
        console.log('📱 [updateFCMToken] Edge Function response data:', edgeData);
        // التحقق من أن البيانات تم حفظها بنجاح
        if (edgeData && edgeData.success) {
          console.log('✅ [updateFCMToken] ========== SUCCESS ==========');
          console.log('✅ [updateFCMToken] FCM Token saved successfully in profiles table!');
          console.log('✅ [updateFCMToken] Saved data:', {
            user_id: edgeData.data?.user_id,
            fcm_token: edgeData.data?.fcm_token ? edgeData.data.fcm_token.substring(0, 30) + '...' : 'N/A',
          });
          console.log('✅ [updateFCMToken] You can verify in Supabase Dashboard:');
          console.log('   - Table: profiles');
          console.log('   - Column: fcm_token');
          console.log('   - Filter: id =', userId);
        } else {
          console.warn('⚠️ [updateFCMToken] Edge Function returned but success flag is false');
          console.warn('⚠️ [updateFCMToken] Response:', edgeData);
        }
      }
    } catch (error) {
      console.error('❌ [updateFCMToken] Error saving FCM token to profiles:', error);
      console.error('❌ [updateFCMToken] Error type:', (error as any)?.constructor?.name);
      console.error('❌ [updateFCMToken] Error message:', (error as any)?.message);
      console.error('❌ [updateFCMToken] Error stack:', (error as any)?.stack);
      throw error;
    } finally {
      console.log('📱 [updateFCMToken] ========== Process Complete ==========');
    }
  }, []);

  // دالة لاختبار Edge Function يدوياً (للتطوير والتصحيح)
  const testFCMTokenUpdate = useCallback(async (testToken: string) => {
    console.log('🧪 [testFCMTokenUpdate] ========== CALLED ==========');
    console.log('🧪 [testFCMTokenUpdate] Stack trace:', new Error().stack);
    
    if (!user?.id) {
      console.error('❌ [testFCMTokenUpdate] No user logged in');
      return;
    }
    console.log('🧪 [testFCMTokenUpdate] Testing FCM token update with test token...');
    try {
      await updateFCMToken(user.id, testToken);
      console.log('✅ [testFCMTokenUpdate] Test completed successfully');
    } catch (error) {
      console.error('❌ [testFCMTokenUpdate] Test failed:', error);
    }
    console.log('🧪 [testFCMTokenUpdate] ========== END ==========');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // updateFCMToken مستقرة (dependency array فارغ)

  // دالة لاختبار AndroidBridge.getFCMToken() مباشرة
  const testAndroidBridge = useCallback(async () => {
    console.log('🧪 [testAndroidBridge] ========== CALLED ==========');
    console.log('🧪 [testAndroidBridge] Stack trace:', new Error().stack);
    console.log('🧪 [testAndroidBridge] Testing AndroidBridge.getFCMToken()...');
    
    if (typeof window === 'undefined') {
      console.error('❌ [testAndroidBridge] window is undefined');
      return null;
    }

    if (!window.AndroidBridge) {
      console.error('❌ [testAndroidBridge] AndroidBridge is not available');
      console.error('❌ [testAndroidBridge] Make sure you are running in Android WebView');
      return null;
    }

    if (typeof window.AndroidBridge.getFCMToken !== 'function') {
      console.error('❌ [testAndroidBridge] AndroidBridge.getFCMToken is not a function');
      console.error('❌ [testAndroidBridge] Available methods:', Object.keys(window.AndroidBridge));
      return null;
    }

    try {
      const tokenResult = window.AndroidBridge.getFCMToken();
      // التعامل مع Promise إذا كان getFCMToken async
      const token = tokenResult instanceof Promise ? await tokenResult : tokenResult;
      console.log('✅ [testAndroidBridge] FCM Token retrieved:', token);
      
      // إذا كان هناك مستخدم مسجل دخول، احفظ التوكن تلقائياً
      if (user?.id && token && typeof token === 'string') {
        console.log('📱 [testAndroidBridge] User is logged in, saving token automatically...');
        updateFCMToken(user.id, token);
      }
      
      console.log('🧪 [testAndroidBridge] ========== END ==========');
      return token;
    } catch (error) {
      console.error('❌ [testAndroidBridge] Error calling getFCMToken:', error);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // updateFCMToken مستقرة (dependency array فارغ)

  // جعل دوال الاختبار متاحة في window للاختبار من console
  // استخدام useRef لتخزين الدوال وتحديثها فقط عند الحاجة
  const testFCMTokenUpdateRef = useRef(testFCMTokenUpdate);
  const testAndroidBridgeRef = useRef(testAndroidBridge);
  const userRef = useRef(user);
  const isExecutingRef = useRef({ testFCMTokenUpdate: false, testAndroidBridge: false });
  const windowFunctionsSetupRef = useRef(false);
  const callCountRef = useRef({ testFCMTokenUpdate: 0, testAndroidBridge: 0 });
  
  // تحديث refs عند تغير الدوال
  testFCMTokenUpdateRef.current = testFCMTokenUpdate;
  testAndroidBridgeRef.current = testAndroidBridge;
  userRef.current = user; // تحديث user ref في كل render

  // تحديث window مرة واحدة فقط
  useEffect(() => {
    // منع الإعداد المتكرر
    if (windowFunctionsSetupRef.current) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    // التحقق من أن الدوال غير موجودة بالفعل
    if ((window as any).testFCMTokenUpdate && (window as any).testAndroidBridge && (window as any).getUserId) {
      windowFunctionsSetupRef.current = true;
      return;
    }

    console.log('🔧 [Window Functions] Setting up test functions on window object (ONE TIME ONLY)...');
    windowFunctionsSetupRef.current = true;

    // استخدام wrapper functions مع حماية من الاستدعاء المتكرر
    (window as any).testFCMTokenUpdate = async (...args: any[]) => {
      callCountRef.current.testFCMTokenUpdate++;
      const callNumber = callCountRef.current.testFCMTokenUpdate;
      const callStack = new Error().stack;
      
      console.log(`🔵 [testFCMTokenUpdate] ========== CALL #${callNumber} ==========`);
      console.log('🔵 [testFCMTokenUpdate] Call stack:', callStack);
      console.log('🔵 [testFCMTokenUpdate] Args:', args);
      console.log('🔵 [testFCMTokenUpdate] Already executing?', isExecutingRef.current.testFCMTokenUpdate);
      console.log('🔵 [testFCMTokenUpdate] Total calls so far:', callNumber);
      
      if (isExecutingRef.current.testFCMTokenUpdate) {
        console.warn('⚠️ [testFCMTokenUpdate] Already executing, skipping call #' + callNumber);
        return;
      }
      
      isExecutingRef.current.testFCMTokenUpdate = true;
      try {
        const func = testFCMTokenUpdateRef.current;
        if (args.length > 0) {
          await func(args[0]);
        } else {
          await func('test-token-' + Date.now());
        }
      } catch (error) {
        console.error('❌ [testFCMTokenUpdate] Error in call #' + callNumber + ':', error);
      } finally {
        isExecutingRef.current.testFCMTokenUpdate = false;
        console.log(`🔵 [testFCMTokenUpdate] ========== CALL #${callNumber} ENDED ==========`);
      }
    };
    
    (window as any).testAndroidBridge = async (...args: any[]) => {
      callCountRef.current.testAndroidBridge++;
      const callNumber = callCountRef.current.testAndroidBridge;
      const callStack = new Error().stack;
      
      console.log(`🔵 [testAndroidBridge] ========== CALL #${callNumber} ==========`);
      console.log('🔵 [testAndroidBridge] Call stack:', callStack);
      console.log('🔵 [testAndroidBridge] Args:', args);
      console.log('🔵 [testAndroidBridge] Already executing?', isExecutingRef.current.testAndroidBridge);
      console.log('🔵 [testAndroidBridge] Total calls so far:', callNumber);
      
      if (isExecutingRef.current.testAndroidBridge) {
        console.warn('⚠️ [testAndroidBridge] Already executing, skipping call #' + callNumber);
        return null;
      }
      
      isExecutingRef.current.testAndroidBridge = true;
      try {
        const func = testAndroidBridgeRef.current;
        const result = await func();
        console.log(`🔵 [testAndroidBridge] ========== CALL #${callNumber} ENDED ==========`);
        return result;
      } catch (error) {
        console.error('❌ [testAndroidBridge] Error in call #' + callNumber + ':', error);
        return null;
      } finally {
        isExecutingRef.current.testAndroidBridge = false;
      }
    };

    // دالة اختبار مباشرة باستخدام fetch (للتشخيص)
    (window as any).testEdgeFunctionDirectly = async (testToken?: string, userId?: string) => {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      
      // محاولة الحصول على user ID من عدة مصادر
      let targetUserId = userId;
      
      if (!targetUserId) {
        // 1. من context (user state) - استخدام ref للحصول على أحدث قيمة
        targetUserId = userRef.current?.id;
        if (targetUserId) {
          console.log('📱 [testEdgeFunctionDirectly] Found user ID from context:', targetUserId);
        } else {
          console.log('📱 [testEdgeFunctionDirectly] No user ID in context (user:', userRef.current, ')');
        }
      }
      
      if (!targetUserId) {
        // 2. من localStorage (flash_user أولاً، ثم user للتوافق)
        try {
          let localUserStr = localStorage.getItem('flash_user');
          if (!localUserStr) {
            localUserStr = localStorage.getItem('user');
          }
          if (localUserStr) {
            const localUser = JSON.parse(localUserStr);
            targetUserId = localUser?.id;
            if (targetUserId) {
              console.log('📱 [testEdgeFunctionDirectly] Found user ID from localStorage:', targetUserId);
            }
          }
        } catch (e) {
          console.error('❌ [testEdgeFunctionDirectly] Error reading localStorage:', e);
        }
      }
      
      if (!targetUserId) {
        // 3. من Supabase session
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            targetUserId = session.user.id;
            console.log('📱 [testEdgeFunctionDirectly] Found user ID from session:', targetUserId);
          }
        } catch (e) {
          // ignore
        }
      }
      
      if (!targetUserId) {
        console.error('❌ [testEdgeFunctionDirectly] No user ID found');
        console.error('💡 [testEdgeFunctionDirectly] Usage:');
        console.error('   window.testEdgeFunctionDirectly("test-token", "user-id-here")');
        console.error('   OR make sure you are logged in first');
        console.error('   OR check localStorage for user data');
        return;
      }
      
      if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
        console.error('❌ [testEdgeFunctionDirectly] Supabase URL not configured');
        console.error('💡 [testEdgeFunctionDirectly] Check EXPO_PUBLIC_SUPABASE_URL environment variable');
        return;
      }
      
      const token = testToken || 'test-token-' + Date.now();
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/update-fcm-token`;
      
      console.log('🧪 [testEdgeFunctionDirectly] ========== Testing Edge Function Directly ==========');
      console.log('🧪 [testEdgeFunctionDirectly] URL:', edgeFunctionUrl);
      console.log('🧪 [testEdgeFunctionDirectly] User ID:', targetUserId);
      console.log('🧪 [testEdgeFunctionDirectly] Test Token:', token);
      
      try {
        console.log('🧪 [testEdgeFunctionDirectly] Sending request...');
        const requestBody = {
          user_id: targetUserId,
          fcm_token: token,
        };
        console.log('🧪 [testEdgeFunctionDirectly] Request body:', requestBody);
        
        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify(requestBody),
        });
        
        console.log('🧪 [testEdgeFunctionDirectly] ========== RESPONSE RECEIVED ==========');
        console.log('🧪 [testEdgeFunctionDirectly] Response Status:', response.status);
        console.log('🧪 [testEdgeFunctionDirectly] Response Status Text:', response.statusText);
        console.log('🧪 [testEdgeFunctionDirectly] Response OK:', response.ok);
        console.log('🧪 [testEdgeFunctionDirectly] Response Headers:', Object.fromEntries(response.headers.entries()));
        
        // قراءة Response كـ text أولاً للتأكد من عدم وجود أخطاء في parsing
        const responseText = await response.text();
        console.log('🧪 [testEdgeFunctionDirectly] Response Text (raw):', responseText);
        
        let data: any = null;
        try {
          data = JSON.parse(responseText);
          console.log('🧪 [testEdgeFunctionDirectly] Response Data (parsed):', data);
        } catch (parseError) {
          console.error('❌ [testEdgeFunctionDirectly] Failed to parse response as JSON:', parseError);
          console.error('❌ [testEdgeFunctionDirectly] Raw response:', responseText);
        }
        
        if (response.ok && data?.success) {
          console.log('✅ [testEdgeFunctionDirectly] ========== SUCCESS ==========');
          console.log('✅ [testEdgeFunctionDirectly] Token saved successfully!');
          console.log('✅ [testEdgeFunctionDirectly] User ID:', data.data?.user_id);
          console.log('✅ [testEdgeFunctionDirectly] FCM Token (first 30 chars):', data.data?.fcm_token?.substring(0, 30) + '...');
          console.log('✅ [testEdgeFunctionDirectly] Check Supabase Dashboard → Edge Functions → update-fcm-token → Logs');
          console.log('✅ [testEdgeFunctionDirectly] ========== END ==========');
        } else {
          console.error('❌ [testEdgeFunctionDirectly] ========== FAILED ==========');
          console.error('❌ [testEdgeFunctionDirectly] Status:', response.status);
          console.error('❌ [testEdgeFunctionDirectly] Response:', data);
          console.error('❌ [testEdgeFunctionDirectly] ========== END ==========');
        }
      } catch (error: any) {
        console.error('❌ [testEdgeFunctionDirectly] ========== EXCEPTION ==========');
        console.error('❌ [testEdgeFunctionDirectly] Exception:', error);
        console.error('❌ [testEdgeFunctionDirectly] Error type:', error?.constructor?.name);
        console.error('❌ [testEdgeFunctionDirectly] Error message:', error?.message);
        console.error('❌ [testEdgeFunctionDirectly] Error stack:', error?.stack);
        console.error('❌ [testEdgeFunctionDirectly] ========== END ==========');
      }
      
      console.log('🧪 [testEdgeFunctionDirectly] ========== End ==========');
    };

    // دالة مساعدة للحصول على user ID من console
    // نستخدم supabase مباشرة من import بدلاً من context
    (window as any).getUserId = async () => {
      console.log('🔍 [getUserId] Searching for user ID...');
      
      // 1. من localStorage (الأسرع)
      try {
        const localUserStr = localStorage.getItem('flash_user');
        if (localUserStr) {
          const localUser = JSON.parse(localUserStr);
          if (localUser?.id) {
            console.log('✅ [getUserId] Found from localStorage:', localUser.id);
            return localUser.id;
          }
        }
      } catch (e) {
        // ignore
      }
      
      // 2. من Supabase session
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('❌ [getUserId] Error getting session:', error);
        } else if (session?.user?.id) {
          console.log('✅ [getUserId] Found from session:', session.user.id);
          return session.user.id;
        }
      } catch (e) {
        console.error('❌ [getUserId] Exception getting session:', e);
      }
      
      // 3. من context (آخر محاولة - قد لا يكون متاحاً)
      try {
        // محاولة الوصول إلى user من window إذا كان متاحاً
        const contextUser = (window as any).__AUTH_USER__;
        if (contextUser?.id) {
          console.log('✅ [getUserId] Found from window context:', contextUser.id);
          return contextUser.id;
        }
      } catch (e) {
        // ignore
      }
      
      console.error('❌ [getUserId] No user ID found');
      console.log('💡 [getUserId] Make sure you are logged in');
      console.log('💡 [getUserId] Try: window.testEdgeFunctionDirectly("test-token", "user-id-here")');
      return null;
    };

    console.log('✅ [Window Functions] Test functions set up successfully');
    console.log('✅ [Window Functions] Available in console:');
    console.log('   - window.getUserId() // Get current user ID');
    console.log('   - window.testFCMTokenUpdate("test-token")');
    console.log('   - window.testAndroidBridge()');
    console.log('   - window.testEdgeFunctionDirectly("test-token", "user-id") // Direct fetch test');
    console.log('   - window.testEdgeFunctionDirectly("test-token") // Uses logged-in user');
  }, []); // تشغيل مرة واحدة فقط

  useEffect(() => {
    let mounted = true;
    let sessionLoaded = false;
    
    // الاستماع لتغييرات المصادقة - يجب تسجيله أولاً
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session ? 'has session' : 'no session');
      setSession(session);
      if (session) {
        // استخدام session.user مباشرة (أسرع وأكثر موثوقية)
        console.log('📞 About to load user from session directly...');
        try {
          console.log('📞 Loading user from session.user...');
          const userDataPromise = getUserWithRoleFromSession(session);
          // إضافة timeout للتحقق من أن العملية لا تتوقف
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('getUserWithRoleFromSession timeout after 5 seconds')), 5000)
          );
          const userData = await Promise.race([userDataPromise, timeoutPromise]) as User | null;
          console.log('✅ User loaded from session:', userData ? `User ID: ${userData.id}, Role: ${userData.role}` : 'No user');
          if (userData) {
            setUser(userData);
            console.log('✅ User state updated in AuthContext from session');
          } else {
            console.warn('⚠️ No user data from session, trying loadUser()...');
            // إذا فشل، نجرب loadUser كحل بديل
            await loadUser();
            console.log('✅ loadUser completed in onAuthStateChange');
          }
        } catch (error) {
          console.error('❌ Error loading user from session:', error);
          // إذا فشل، نجرب loadUser كحل بديل
          try {
            await loadUser();
            console.log('✅ loadUser completed in onAuthStateChange (fallback)');
          } catch (loadError) {
            console.error('❌ Error in loadUser from onAuthStateChange:', loadError);
          }
        }
        
        // عند تسجيل الدخول (خاصة بجوجل)، نتأكد من وجود ملف المستخدم
        // نفعل هذا بعد loadUser لأن loadUser قد يكون أسرع
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('SIGNED_IN event, checking/creating profile...');
          // استخدام Promise.race لإضافة timeout
          const getUserPromise = supabase.auth.getUser();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getUser timeout after 5 seconds')), 5000)
          );
          
          try {
            console.log('📞 Calling supabase.auth.getUser() for profile check...');
            const result = await Promise.race([getUserPromise, timeoutPromise]) as any;
            console.log('✅ supabase.auth.getUser() completed for profile check');
            
            const { data: { user }, error: getUserError } = result || { data: { user: null }, error: null };
            
            if (getUserError) {
              console.error('Error getting user:', getUserError);
            } else if (user) {
              console.log('Got user from auth for profile check:', user.id);
              try {
                console.log('📞 Checking profile in database...');
                const { data: existingProfile, error: profileError } = await supabase
                  .from('profiles')
                  .select('id, role')
                  .eq('id', user.id)
                  .single();
                console.log('✅ Profile check completed');

                if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
                  console.error('Error checking profile:', profileError);
                } else if (!existingProfile) {
                  console.log('Creating new profile for user:', user.id);
                  // إنشاء ملف المستخدم الجديد (بدون بيانات كاملة)
                  const { error: insertError } = await supabase.from('profiles').insert({
                    id: user.id,
                    email: user.email || null,
                    phone: user.phone || null,
                    role: 'customer', // افتراضي
                    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
                    avatar_url: user.user_metadata?.avatar_url || null,
                  });
                  if (insertError) {
                    console.error('Error creating profile:', insertError);
                  } else {
                    console.log('Profile created successfully');
                  }
                } else {
                  console.log('Profile already exists');
                }
              } catch (error) {
                console.error('Error creating/checking profile:', error);
              }
            } else {
              console.warn('No user returned from getUser()');
            }
          } catch (error) {
            console.error('Error in SIGNED_IN handler:', error);
            // حتى لو فشل getUser، loadUser تم استدعاؤه بالفعل
          } finally {
            console.log('✅ SIGNED_IN handler completed (finally block)');
          }
        }
        
        setLoading(false);
        console.log('✅ Loading set to false in onAuthStateChange');
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    
    // Fallback: إذا لم يكمل getSession خلال 10 ثوانٍ، نعتمد على onAuthStateChange
    const fallbackTimeout = setTimeout(() => {
      if (!sessionLoaded && mounted) {
        console.warn('Session loading timeout, relying on onAuthStateChange');
        setLoading(false);
      }
    }, 10000);
    
    // جلب الجلسة الحالية
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionLoaded = true;
      clearTimeout(fallbackTimeout);
      
      if (!mounted) return;
      
      setSession(session);
      if (session) {
        loadUser().then(() => {
          if (mounted) {
            setLoading(false);
          }
        }).catch((error) => {
          console.error('Error in loadUser from getSession:', error);
          if (mounted) {
            setLoading(false);
          }
        });
      } else {
        // إذا لم يكن هناك session، نجرب localStorage (للمستخدمين الذين سجلوا دخولهم بـ PIN)
        console.log('No session found, checking localStorage...');
        const localUser = getUserFromLocalStorage();
        if (localUser) {
          console.log('Found user in localStorage, setting user state');
          setUser(localUser);
        }
        setLoading(false);
      }
    }).catch((error) => {
      sessionLoaded = true;
      clearTimeout(fallbackTimeout);
      
      if (!mounted) return;
      
      console.error('Error loading session:', error);
      // حتى في حالة الخطأ، نجرب localStorage
      console.log('Checking localStorage as fallback...');
      const localUser = getUserFromLocalStorage();
      if (localUser) {
        console.log('Found user in localStorage, setting user state');
        setUser(localUser);
      }
      setLoading(false);
    });
    
    return () => {
      mounted = false;
      clearTimeout(fallbackTimeout);
      subscription.unsubscribe();
    };
  }, [loadUser]);

  // استخدام refs لتتبع حالة FCM token polling
  const fcmPollingRef = useRef<{
    timeoutId: NodeJS.Timeout | null;
    intervalId: NodeJS.Timeout | null;
    isTokenSaved: boolean;
    messagePrinted: boolean;
    pollingStarted: boolean;
  }>({
    timeoutId: null,
    intervalId: null,
    isTokenSaved: false,
    messagePrinted: false,
    pollingStarted: false,
  });

  // useEffect لجلب FCM token وحفظه عند تسجيل الدخول
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // التحقق من أننا في بيئة WebView (Android)
    if (typeof window === 'undefined') {
      console.log('📱 [useEffect] window is undefined, skipping FCM token update');
      return;
    }

    // إيقاف أي polling سابق
    if (fcmPollingRef.current.timeoutId) {
      clearTimeout(fcmPollingRef.current.timeoutId);
      fcmPollingRef.current.timeoutId = null;
    }
    if (fcmPollingRef.current.intervalId) {
      clearInterval(fcmPollingRef.current.intervalId);
      fcmPollingRef.current.intervalId = null;
    }

    // إعادة تعيين الحالة (لكن لا نعيد تعيين messagePrinted لتجنب التكرار)
    fcmPollingRef.current.isTokenSaved = false;
    // لا نعيد تعيين messagePrinted هنا - نتركه كما هو لتجنب التكرار
    // fcmPollingRef.current.messagePrinted = false;
    fcmPollingRef.current.pollingStarted = false;

    let timeoutId: NodeJS.Timeout | null = null;
    let intervalId: NodeJS.Timeout | null = null;
    let isTokenSaved = false;

    // دالة بسيطة للحصول على FCM Token وحفظه
    const getAndSaveFCMToken = async () => {
      if (isTokenSaved) {
        return true; // تم حفظ التوكن بالفعل
      }

      // التحقق من وجود AndroidBridge
      if (!window.AndroidBridge) {
        return false;
      }

      // التحقق من وجود getFCMToken
      if (!window.AndroidBridge.getFCMToken) {
        console.warn('⚠️ [useEffect] AndroidBridge.getFCMToken is not available');
        return false;
      }

      try {
        // الحصول على FCM Token مباشرة
        const fcmTokenResult = window.AndroidBridge.getFCMToken();
        // التعامل مع Promise إذا كان getFCMToken async
        const fcmToken = fcmTokenResult instanceof Promise ? await fcmTokenResult : fcmTokenResult;
        
        if (fcmToken && typeof fcmToken === 'string' && fcmToken.trim() !== '') {
          console.log('✅ [useEffect] FCM Token:', fcmToken.substring(0, 30) + '...');
          
          // حفظ التوكن عبر Edge Function
          updateFCMToken(user.id, fcmToken);
          isTokenSaved = true;
          
          // إيقاف جميع المحاولات
          if (timeoutId) {
            clearTimeout(timeoutId);
            fcmPollingRef.current.timeoutId = null;
          }
          if (intervalId) {
            clearInterval(intervalId);
            fcmPollingRef.current.intervalId = null;
          }
          fcmPollingRef.current.isTokenSaved = true;
          fcmPollingRef.current.pollingStarted = false;
          return true;
        } else {
          console.log('⚠️ [useEffect] FCM Token not available yet');
          return false;
        }
      } catch (error) {
        console.error('❌ [useEffect] Error getting FCM Token:', error);
        return false;
      }
    };

    // محاولة فورية
    getAndSaveFCMToken().then((saved) => {
      if (saved) {
        return;
      }
    });

    // محاولة بعد تحميل الصفحة
    const onPageLoad = async () => {
      console.log('📱 [useEffect] Page loaded, trying to get FCM Token...');
      const saved = await getAndSaveFCMToken();
      if (saved) {
        return;
      }
      
      // إذا لم ينجح، نبدأ آلية الانتظار
      startPolling();
    };

    // الاستماع لـ DOMContentLoaded و window.onload
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(onPageLoad, 100);
    } else {
      window.addEventListener('DOMContentLoaded', onPageLoad);
      window.addEventListener('load', onPageLoad);
    }

    // آلية polling مستمرة كل 500ms لمدة 30 ثانية
    const startPolling = () => {
      // منع بدء polling متعدد
      if (fcmPollingRef.current.pollingStarted) {
        return;
      }
      fcmPollingRef.current.pollingStarted = true;

      let attempts = 0;
      const maxAttempts = 60; // 60 محاولة على مدى 30 ثانية
      const checkInterval = 500; // كل 500ms

      intervalId = setInterval(() => {
        attempts++;
        
        // التحقق من أن interval لا يزال نشطاً
        if (!intervalId || !fcmPollingRef.current.intervalId) {
          return;
        }
        
        // التحقق من أن التوكن تم حفظه بالفعل
        if (isTokenSaved || fcmPollingRef.current.isTokenSaved) {
          const currentIntervalId = fcmPollingRef.current.intervalId;
          if (currentIntervalId) {
            clearInterval(currentIntervalId);
            intervalId = null;
            fcmPollingRef.current.intervalId = null;
            fcmPollingRef.current.pollingStarted = false;
          }
          return;
        }

        // التحقق من عدد المحاولات قبل أي شيء آخر
        if (attempts >= maxAttempts) {
          // إيقاف interval فوراً قبل طباعة الرسالة
          const currentIntervalId = fcmPollingRef.current.intervalId;
          if (currentIntervalId) {
            clearInterval(currentIntervalId);
            intervalId = null;
            fcmPollingRef.current.intervalId = null;
            fcmPollingRef.current.pollingStarted = false;
          }
          
          // طباعة الرسالة مرة واحدة فقط لكل user
          const messageKey = `fcm_message_printed_${user?.id}`;
          if (!fcmPollingRef.current.messagePrinted && !(window as any)[messageKey]) {
            console.warn('⚠️ [useEffect] AndroidBridge not available after 30 seconds');
            console.warn('🧪 [useEffect] You can test manually:');
            console.warn('   window.testAndroidBridge()');
            console.warn('   window.testFCMTokenUpdate("test-token-123")');
            fcmPollingRef.current.messagePrinted = true;
            (window as any)[messageKey] = true; // علامة في window لتجنب التكرار
          }
          
          return; // إيقاف التنفيذ فوراً
        }

        getAndSaveFCMToken().then((saved) => {
          if (saved) {
            // نجح!
            const currentIntervalId = fcmPollingRef.current.intervalId;
            if (currentIntervalId) {
              clearInterval(currentIntervalId);
              intervalId = null;
              fcmPollingRef.current.intervalId = null;
              fcmPollingRef.current.pollingStarted = false;
            }
          }
        });
      }, checkInterval);
      
      // حفظ intervalId في ref فوراً
      fcmPollingRef.current.intervalId = intervalId;
    };

    // بدء polling بعد تأخير قصير
    timeoutId = setTimeout(() => {
      if (!isTokenSaved && !fcmPollingRef.current.isTokenSaved) {
        startPolling();
      }
    }, 1000);

    // حفظ references في ref
    fcmPollingRef.current.timeoutId = timeoutId;
    if (intervalId) {
      fcmPollingRef.current.intervalId = intervalId;
    }

    return () => {
      // تنظيف timeout
      if (fcmPollingRef.current.timeoutId) {
        clearTimeout(fcmPollingRef.current.timeoutId);
        fcmPollingRef.current.timeoutId = null;
      }
      // تنظيف interval
      if (fcmPollingRef.current.intervalId) {
        clearInterval(fcmPollingRef.current.intervalId);
        fcmPollingRef.current.intervalId = null;
      }
      // تنظيف المتغيرات المحلية أيضاً
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
      fcmPollingRef.current.pollingStarted = false;
      window.removeEventListener('DOMContentLoaded', onPageLoad);
      window.removeEventListener('load', onPageLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // updateFCMToken مستقرة (dependency array فارغ) ولا تحتاج إلى إضافتها

  const signIn = async (email: string, password: string) => {
    console.log('signIn: Attempting to sign in with email:', email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('signIn: Auth error:', error);
      throw error;
    }
    
    if (data.session) {
      console.log('signIn: Session created, loading user...');
      await loadUser();
      console.log('signIn: User loaded successfully');
    } else {
      console.warn('signIn: No session returned');
      throw new Error('فشل إنشاء الجلسة');
    }
  };

  const signInWithGoogle = async () => {
    // في المتصفح، نستخدم URL مباشر
    // في التطبيق المحمول، نستخدم Linking.createURL
    const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/`
      : Linking.createURL('/');
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) throw error;

    if (data.url) {
      // في المتصفح (web)، نستخدم window.location.href
      if (typeof window !== 'undefined') {
        window.location.href = data.url;
      } else {
        // في التطبيق المحمول، نستخدم WebBrowser
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo
        );

        if (result.type === 'success') {
          const url = result.url;
          const urlObj = new URL(url);
          const accessToken = urlObj.searchParams.get('access_token');
          const refreshToken = urlObj.searchParams.get('refresh_token');

          if (accessToken && refreshToken) {
            // تحديث الجلسة
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) throw sessionError;
            if (sessionData.session) {
              // إنشاء ملف المستخدم إذا لم يكن موجوداً
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: existingProfile } = await supabase
                  .from('profiles')
                  .select('id, role')
                  .eq('id', user.id)
                  .single();

                if (!existingProfile) {
                  // إنشاء ملف المستخدم الجديد (بدون بيانات كاملة)
                  await supabase.from('profiles').insert({
                    id: user.id,
                    email: user.email,
                    role: 'customer', // افتراضي
                    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
                    avatar_url: user.user_metadata?.avatar_url || null,
                  });
                }
              }
              await loadUser();
            }
          }
        }
      }
    }
  };

  const signUp = async (email: string, password: string, role: UserRole) => {
    console.log('signUp: Starting registration for:', email, 'role:', role);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      console.error('signUp: Auth error:', error);
      throw error;
    }

    if (!data.user) {
      console.error('signUp: No user returned from signUp');
      throw new Error('فشل إنشاء الحساب');
    }

    console.log('signUp: User created:', data.user.id);

    // التحقق من وجود profile أولاً (قد يكون تم إنشاؤه بواسطة trigger)
    try {
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.user.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = no rows returned (هذا طبيعي)
        console.error('signUp: Error checking profile:', checkError);
        throw checkError;
      }

      if (existingProfile) {
        console.log('signUp: Profile already exists, updating role if needed');
        // تحديث role إذا كان مختلفاً
        if (existingProfile.role !== role) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', data.user.id);
          
          if (updateError) {
            console.error('signUp: Error updating role:', updateError);
            throw updateError;
          }
          console.log('signUp: Role updated successfully');
        }
      } else {
        console.log('signUp: Creating new profile...');
        // إنشاء ملف المستخدم الأساسي (سيتم إكماله لاحقاً)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email,
            role,
          });
        
        if (profileError) {
          console.error('signUp: Error creating profile:', profileError);
          // إذا كان الخطأ بسبب duplicate key، قد يكون trigger أنشأ profile بالفعل
          if (profileError.code === '23505') {
            console.log('signUp: Profile was created by trigger, continuing...');
          } else {
            throw profileError;
          }
        } else {
          console.log('signUp: Profile created successfully');
        }
      }
    } catch (error: any) {
      console.error('signUp: Error in profile creation/update:', error);
      // إذا كان الخطأ بسبب duplicate key، نتابع (قد يكون trigger أنشأ profile)
      if (error?.code === '23505') {
        console.log('signUp: Profile already exists (likely created by trigger), continuing...');
      } else {
        throw error;
      }
    }

    console.log('signUp: Registration completed successfully');
  };

  const loginWithPin = async (userData: { id: string; phone: string; role: UserRole; full_name?: string | null; email?: string | null }) => {
    try {
      console.log('loginWithPin: Logging in with PIN for user:', userData.id);
      
      // إنشاء user object للـ context
      const user: User = {
        id: userData.id,
        email: userData.email || '',
        role: userData.role,
        full_name: userData.full_name,
        phone: userData.phone,
      };
      
      // حفظ بيانات المستخدم في localStorage (للاستعادة بعد إعادة التحميل)
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem('flash_user', JSON.stringify(user));
          console.log('✅ User saved to localStorage');
        } catch (storageError) {
          console.error('❌ Error saving user to localStorage:', storageError);
        }
      }
      
      // تحديث user state مباشرة
      setUser(user);
      
      // محاولة الحصول على session من Supabase Auth (إذا كان موجوداً)
      // ملاحظة: في نظام PIN، قد لا يكون هناك session في auth.users
      // لذلك سنستخدم user مباشرة من profiles
      try {
        const sessionPromise = supabase.auth.getSession();
        const sessionTimeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 3000)
        );
        
        const sessionResult = await Promise.race([sessionPromise, sessionTimeoutPromise]);
        const { data: { session } } = sessionResult as any;
        
        if (session) {
          setSession(session);
        } else {
          // إذا لم يكن هناك session، ننشئ session مؤقتة
          // أو نستخدم user مباشرة بدون session
          setSession(null);
        }
      } catch (sessionError) {
        console.warn('loginWithPin: Error getting session (non-critical):', sessionError);
        // هذا خطأ غير حرج، نستمر بدون session
        setSession(null);
      }
      
      console.log('loginWithPin: Login successful');
    } catch (error: any) {
      console.error('loginWithPin: Error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log('signOut: Starting sign out...');
    const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('signOut: Error signing out:', error);
        throw error;
      }
      console.log('signOut: Sign out successful, clearing state...');
      setUser(null);
      setSession(null);
      
      // مسح بيانات المستخدم من localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.removeItem('flash_user');
          console.log('✅ User cleared from localStorage');
        } catch (storageError) {
          console.error('❌ Error clearing user from localStorage:', storageError);
        }
      }
      
      console.log('signOut: State cleared');
    } catch (error: any) {
      console.error('signOut: Error in signOut:', error);
      // حتى لو فشل signOut من Supabase، نمسح الحالة المحلية
    setUser(null);
    setSession(null);
      
      // مسح بيانات المستخدم من localStorage حتى في حالة الخطأ
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.removeItem('flash_user');
          console.log('✅ User cleared from localStorage (error case)');
        } catch (storageError) {
          console.error('❌ Error clearing user from localStorage:', storageError);
        }
      }
      
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signInWithGoogle, signUp, signOut, loadUser, loginWithPin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

