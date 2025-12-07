import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, getUserWithRole, isRegistrationComplete, User, UserRole } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  loadUser: () => Promise<void>;
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
      console.log('loadUser already in progress, skipping...');
      return;
    }
    
    console.log('Loading user...');
    setLoadingUser(true);
    try {
      const userData = await getUserWithRole();
      console.log('User loaded:', userData ? `User ID: ${userData.id}` : 'No user');
      setUser(userData);
      // لا نضع setLoading(false) هنا لأن getSession قد يكون لم يكمل بعد
      // setLoading(false) سيتم استدعاؤه في onAuthStateChange أو getSession
    } catch (error) {
      console.error('Error loading user:', error);
      // في حالة الخطأ، نرجع null للمستخدم
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

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
        // عند تسجيل الدخول (خاصة بجوجل)، نتأكد من وجود ملف المستخدم
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('SIGNED_IN event, checking/creating profile...');
          try {
            const { data: { user }, error: getUserError } = await supabase.auth.getUser();
            if (getUserError) {
              console.error('Error getting user:', getUserError);
            } else if (user) {
              console.log('Got user from auth:', user.id);
              try {
                const { data: existingProfile, error: profileError } = await supabase
                  .from('profiles')
                  .select('id, role')
                  .eq('id', user.id)
                  .single();

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
          }
        }
        console.log('Calling loadUser from onAuthStateChange...');
        try {
          await loadUser();
          console.log('loadUser completed in onAuthStateChange');
        } catch (error) {
          console.error('Error in loadUser from onAuthStateChange:', error);
        }
        setLoading(false);
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
        setLoading(false);
      }
    }).catch((error) => {
      sessionLoaded = true;
      clearTimeout(fallbackTimeout);
      
      if (!mounted) return;
      
      console.error('Error loading session:', error);
      setLoading(false);
    });
    
    return () => {
      mounted = false;
      clearTimeout(fallbackTimeout);
      subscription.unsubscribe();
    };
  }, [loadUser]);

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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signInWithGoogle, signUp, signOut, loadUser }}>
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

