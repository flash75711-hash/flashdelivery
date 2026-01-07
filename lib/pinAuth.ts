/**
 * PIN Authentication Utilities
 * نظام المصادقة باستخدام PIN (6 أرقام)
 */

import bcrypt from 'bcryptjs';
import { supabase } from './supabase';
import type { UserRole } from './supabase';

// ============================================
// Types
// ============================================

export interface PinAuthResult {
  success: boolean;
  user?: {
    id: string;
    phone: string;
    role: UserRole;
    full_name?: string | null;
    email?: string | null;
  };
  error?: string;
  lockedUntil?: Date;
  remainingAttempts?: number;
}

// ============================================
// PIN Utilities
// ============================================

/**
 * تشفير PIN باستخدام bcrypt
 */
export async function hashPin(pin: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(pin, saltRounds);
}

/**
 * التحقق من PIN
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(pin, hash);
}

/**
 * التحقق من صحة تنسيق PIN (6 أرقام)
 */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/**
 * التحقق من صحة تنسيق رقم الموبايل
 */
export function isValidPhone(phone: string): boolean {
  // دعم الأرقام المصرية: 01xxxxxxxxx أو +201xxxxxxxxx
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * تنسيق رقم الموبايل (إضافة +20 إذا لم يكن موجوداً)
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  // إذا بدأ بـ 0، استبدله بـ +20
  if (cleaned.startsWith('0')) {
    return '+20' + cleaned.substring(1);
  }
  
  // إذا لم يبدأ بـ 20، أضف +20
  if (!cleaned.startsWith('20')) {
    return '+20' + cleaned;
  }
  
  return '+' + cleaned;
}

// ============================================
// Authentication Functions
// ============================================

/**
 * تسجيل الدخول باستخدام رقم الموبايل و PIN
 */
export async function loginWithPin(
  phone: string,
  pin: string
): Promise<PinAuthResult> {
  try {
    console.log('🔐 [loginWithPin] Starting login process...');
    const formattedPhone = formatPhone(phone);
    
    // التحقق من صحة المدخلات
    if (!isValidPhone(formattedPhone)) {
      console.log('❌ [loginWithPin] Invalid phone number');
      return {
        success: false,
        error: 'رقم الموبايل غير صحيح',
      };
    }
    
    if (!isValidPin(pin)) {
      console.log('❌ [loginWithPin] Invalid PIN format');
      return {
        success: false,
        error: 'رمز PIN يجب أن يكون 6 أرقام',
      };
    }
    
    console.log('✅ [loginWithPin] Input validation passed');
    
    // استخدام Edge Function لتسجيل الدخول (لتجنب مشاكل RLS و 406)
    try {
      console.log('🌐 [loginWithPin] Attempting to use Edge Function...');
      
      // إضافة timeout للـ Edge Function call (5 ثوان - أسرع للاستجابة)
      const edgeFunctionPromise = supabase.functions.invoke('login-with-pin', {
        body: {
          phone: formattedPhone,
          pin: pin,
        },
      });
      
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Edge Function timeout after 5 seconds' } }), 5000)
      );
      
      const result = await Promise.race([edgeFunctionPromise, timeoutPromise]);
      const { data, error: functionError } = result;

      console.log('📊 [loginWithPin] Edge Function response:', {
        hasData: !!data,
        success: data?.success,
        hasUser: !!data?.user,
        error: data?.error || functionError?.message,
        isTimeout: functionError?.message?.includes('timeout'),
      });

      // إذا كان timeout، نتابع بالطريقة القديمة
      if (functionError?.message?.includes('timeout')) {
        console.warn('⚠️ [loginWithPin] Edge Function timeout, falling back to direct query');
        // نتابع للكود التالي (fallback)
      } else if (!functionError && data && data.success) {
        console.log('✅ [loginWithPin] Edge Function login successful');
        return {
          success: true,
          user: {
            id: data.user.id,
            phone: data.user.phone,
            role: data.user.role as UserRole,
            full_name: data.user.full_name,
            email: data.user.email,
          },
        };
      } else if (data && !data.success) {
        // إذا كان هناك خطأ، نرجع الخطأ
        console.log('❌ [loginWithPin] Edge Function returned error:', data.error);
        return {
          success: false,
          error: data.error,
          lockedUntil: data.lockedUntil ? new Date(data.lockedUntil) : undefined,
          remainingAttempts: data.remainingAttempts,
        };
      } else if (functionError) {
        // إذا كان هناك خطأ في الاتصال، نتابع بالطريقة القديمة
        console.warn('⚠️ [loginWithPin] Edge Function failed, falling back to direct query:', functionError.message);
        // نتابع للكود التالي (fallback)
      }
    } catch (functionError: any) {
      // Edge Function غير متاح أو فشل، نتابع بالطريقة القديمة
      console.warn('⚠️ [loginWithPin] Edge Function not available, using direct query:', functionError?.message || functionError);
    }
    
    // Fallback: البحث عن المستخدم في profiles مباشرة (إذا فشل Edge Function)
    try {
      const profilePromise = supabase
      .from('profiles')
      .select('id, phone, pin_hash, role, full_name, email, failed_attempts, locked_until')
      .eq('phone', formattedPhone)
      .single();
    
      const profileTimeoutPromise = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Profile query timeout after 5 seconds' } }), 5000)
      );
      
      const profileResult = await Promise.race([profilePromise, profileTimeoutPromise]);
      const { data: profile, error: profileError } = profileResult;

      if (profileError?.code === 'TIMEOUT') {
        console.error('⚠️ [loginWithPin] Profile query timeout');
        return {
          success: false,
          error: 'انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى',
        };
      }
      
    if (profileError || !profile) {
        console.error('⚠️ [loginWithPin] Profile query error:', profileError);
        // إذا كان الخطأ 406 أو مشكلة RLS، نعطي رسالة واضحة
        if (profileError?.code === 'PGRST301' || profileError?.message?.includes('406')) {
          return {
            success: false,
            error: 'خطأ في الاتصال. يرجى المحاولة مرة أخرى',
          };
        }
      return {
        success: false,
        error: 'رقم الموبايل غير مسجل',
      };
    }
    
    // التحقق من حالة القفل
    if (profile.locked_until) {
      const lockTime = new Date(profile.locked_until);
      if (lockTime > new Date()) {
        const minutesLeft = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
        return {
          success: false,
          error: `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${minutesLeft} دقيقة`,
          lockedUntil: lockTime,
        };
      } else {
        // فك القفل تلقائياً إذا انتهى الوقت
        await supabase
          .from('profiles')
          .update({ locked_until: null, failed_attempts: 0 })
          .eq('id', profile.id);
      }
    }
    
    // التحقق من PIN
    if (!profile.pin_hash) {
      return {
        success: false,
        error: 'الحساب غير مفعّل. يرجى التسجيل أولاً',
      };
    }
    
    const pinValid = await verifyPin(pin, profile.pin_hash);
    
    if (!pinValid) {
      // زيادة failed_attempts
      const newAttempts = (profile.failed_attempts || 0) + 1;
      const lockDuration = 30 * 60 * 1000; // 30 دقيقة بالميلي ثانية
      const shouldLock = newAttempts >= 5;
      
      await supabase
        .from('profiles')
        .update({
          failed_attempts: newAttempts,
          locked_until: shouldLock ? new Date(Date.now() + lockDuration).toISOString() : null,
        })
        .eq('id', profile.id);
      
      const remainingAttempts = 5 - newAttempts;
      
      if (shouldLock) {
        return {
          success: false,
          error: 'تم قفل الحساب مؤقتاً بعد 5 محاولات فاشلة. حاول مرة أخرى بعد 30 دقيقة',
          lockedUntil: new Date(Date.now() + lockDuration),
          remainingAttempts: 0,
        };
      }
      
      return {
        success: false,
        error: `رمز PIN غير صحيح. محاولات متبقية: ${remainingAttempts}`,
        remainingAttempts,
      };
    }
    
    // نجح تسجيل الدخول - إعادة تعيين failed_attempts
    await supabase
      .from('profiles')
      .update({ failed_attempts: 0, locked_until: null })
      .eq('id', profile.id);
    
    // محاولة الحصول على session من Supabase Auth
    // ملاحظة: في نظام PIN، قد لا يكون هناك session في auth.users
    // لذلك نرجع user مباشرة من profiles
    
      console.log('✅ [loginWithPin] Login successful via fallback');
    return {
      success: true,
      user: {
        id: profile.id,
        phone: profile.phone || formattedPhone,
        role: profile.role as UserRole,
        full_name: profile.full_name,
        email: profile.email || undefined,
      },
    };
    } catch (fallbackError: any) {
      console.error('⚠️ [loginWithPin] Fallback error:', fallbackError);
      return {
        success: false,
        error: fallbackError?.message || 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى',
      };
    }
  } catch (error: any) {
    console.error('❌ [loginWithPin] Unexpected error:', error);
    return {
      success: false,
      error: error.message || 'حدث خطأ أثناء تسجيل الدخول',
    };
  }
}

/**
 * التسجيل بحساب جديد
 * يحاول استخدام Edge Function أولاً، ثم يتراجع إلى الطريقة القديمة
 */
export async function registerWithPin(
  phone: string,
  pin: string,
  role: UserRole
): Promise<PinAuthResult> {
  console.log('📝 [registerWithPin] Starting registration', { phone, role, pinLength: pin.length });
  try {
    const formattedPhone = formatPhone(phone);
    console.log('📝 [registerWithPin] Formatted phone:', formattedPhone);
    
    // التحقق من صحة المدخلات
    if (!isValidPhone(formattedPhone)) {
      console.log('❌ [registerWithPin] Invalid phone format');
      return {
        success: false,
        error: 'رقم الموبايل غير صحيح',
      };
    }
    
    if (!isValidPin(pin)) {
      console.log('❌ [registerWithPin] Invalid PIN format');
      return {
        success: false,
        error: 'رمز PIN يجب أن يكون 6 أرقام',
      };
    }
    
    if (!['customer', 'driver', 'vendor'].includes(role)) {
      console.log('❌ [registerWithPin] Invalid role');
      return {
        success: false,
        error: 'نوع الحساب غير صحيح',
      };
    }

    // محاولة استخدام Edge Function أولاً
    try {
      console.log('🌐 [registerWithPin] Attempting to use Edge Function...');
      const { data, error: functionError } = await supabase.functions.invoke('register-user', {
        body: {
          phone: formattedPhone,
          pin: pin,
          role: role,
        },
      });

      console.log('📊 [registerWithPin] Edge Function response:', {
        hasData: !!data,
        success: data?.success,
        hasUser: !!data?.user,
        error: data?.error || functionError?.message,
      });

      if (!functionError && data && data.success) {
        console.log('✅ [registerWithPin] Edge Function registration successful');
        return {
          success: true,
          user: {
            id: data.user.id,
            phone: data.user.phone,
            role: data.user.role,
          },
        };
      }

      // إذا كان الخطأ بسبب رقم موجود بالفعل، نرجع الخطأ مباشرة
      if (data && !data.success && data.error) {
        console.log('❌ [registerWithPin] Edge Function returned error:', data.error);
        return {
          success: false,
          error: data.error,
        };
      }

      // إذا فشل Edge Function، نتابع بالطريقة القديمة
      console.warn('⚠️ [registerWithPin] Edge Function failed, falling back to direct registration:', functionError || data?.error);
    } catch (functionError: any) {
      // Edge Function غير متاح أو فشل، نتابع بالطريقة القديمة
      console.warn('⚠️ [registerWithPin] Edge Function not available, using direct registration:', functionError);
    }
    
    // التحقق من وجود المستخدم في profiles
    // نستخدم maybeSingle بدلاً من single لتجنب الأخطاء إذا لم يوجد المستخدم
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id, phone, pin_hash, role')
      .eq('phone', formattedPhone)
      .maybeSingle();
    
    // إذا كان هناك خطأ في التحقق (مثل RLS)، نحاول المتابعة ولكن بحذر
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      // PGRST116 يعني "no rows found" وهو طبيعي
      // أي خطأ آخر قد يكون مشكلة RLS أو مشكلة أخرى
      console.warn('Error checking existing profile:', profileCheckError);
      // نتابع المحاولة ولكن سنتعامل مع الأخطاء لاحقاً
    }
    
    // إذا كان هناك profile موجود بنفس رقم الهاتف
    if (existingProfile) {
      // إذا كان لديه PIN hash، فهذا يعني أنه مسجل بالكامل
      if (existingProfile.pin_hash) {
        return {
          success: false,
          error: 'رقم الموبايل مسجل بالفعل',
        };
      }
      // إذا كان موجوداً ولكن بدون PIN، فهذا يعني أنه حساب قديم أو غير مكتمل
      // يمكننا محاولة تحديثه
      console.log('Existing profile found without PIN, attempting to update:', existingProfile.id);
      const pinHash = await hashPin(pin);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          pin_hash: pinHash,
          role: role,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
        })
        .eq('id', existingProfile.id);

      if (updateError) {
        console.error('Error updating existing profile:', updateError);
        return { success: false, error: 'فشل تحديث الملف الشخصي الموجود.' };
      }

      // بعد التحديث، نرجع بيانات المستخدم مباشرة
      return {
        success: true,
        user: {
          id: existingProfile.id,
          phone: formattedPhone,
          role: role,
        },
      };
    }
    
    // تشفير PIN
    const pinHash = await hashPin(pin);
    
    // إنشاء user في auth.users أولاً
    // ملاحظة: Supabase Auth يتطلب email أو phone
    // سنستخدم email مؤقت مع phone
    const tempEmail = `${formattedPhone.replace(/\D/g, '')}@flash-delivery.local`;
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: tempEmail,
      password: pinHash, // استخدام PIN hash كـ password
      phone: formattedPhone,
    });
    
    if (authError) {
      console.error('Auth signup error:', authError);

      // إذا كان الخطأ بسبب وجود user موجود بالفعل
      if (authError.code === 'user_already_registered' ||
          authError.message?.includes('already registered') ||
          authError.message?.includes('already exists') ||
          authError.message?.includes('User already registered')) {
        
        console.log('User already exists in auth.users, attempting to handle...');
        
        // أولاً، نتحقق من وجود profile بنفس phone (الأولوية للـ phone)
        const { data: existingProfileByPhone } = await supabase
          .from('profiles')
          .select('id, phone, pin_hash, email')
          .eq('phone', formattedPhone)
          .maybeSingle();

        if (existingProfileByPhone) {
          // Profile موجود بنفس phone
          if (existingProfileByPhone.pin_hash) {
            return {
              success: false,
              error: 'رقم الموبايل مسجل بالفعل',
            };
          }
          // Profile موجود بدون PIN، نحدثه
          console.log('Found existing profile by phone without PIN, updating...');
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              pin_hash: pinHash,
              role: role,
              status: 'active',
              failed_attempts: 0,
              locked_until: null,
            })
            .eq('id', existingProfileByPhone.id);

          if (updateError) {
            console.error('Profile update error (by phone):', updateError);
            return { success: false, error: 'فشل تحديث الملف الشخصي.' };
          }

          return {
            success: true,
            user: {
              id: existingProfileByPhone.id,
              phone: formattedPhone,
              role: role,
            },
          };
        }

        // إذا لم نجد profile بنفس phone، نبحث عن profile بنفس email
        const { data: existingProfileByEmail } = await supabase
          .from('profiles')
          .select('id, phone, email, pin_hash')
          .eq('email', tempEmail)
          .maybeSingle();

        if (existingProfileByEmail) {
          // Profile موجود بنفس email
          // التحقق من أن رقم الموبايل غير مستخدم من قبل مستخدم آخر
          if (existingProfileByEmail.phone && existingProfileByEmail.phone !== formattedPhone) {
            return {
              success: false,
              error: 'رقم الموبايل مسجل بالفعل',
            };
          }

          // تحديث profile
          console.log('Found existing profile by email, updating...');
          const { error: profileUpdateError } = await supabase
            .from('profiles')
            .update({
              phone: formattedPhone,
              pin_hash: pinHash,
              role: role,
              status: 'active',
              failed_attempts: 0,
              locked_until: null,
            })
            .eq('id', existingProfileByEmail.id);

          if (profileUpdateError) {
            console.error('Profile update error (by email):', profileUpdateError);
            return {
              success: false,
              error: 'فشل تحديث الملف الشخصي. يرجى المحاولة مرة أخرى',
            };
          }

          return {
            success: true,
            user: {
              id: existingProfileByEmail.id,
              phone: formattedPhone,
              role: role,
            },
          };
        }

        // User موجود في auth.users لكن لا يوجد profile
        // نحاول تسجيل الدخول للحصول على user ID
        // ملاحظة: هذا قد يفشل إذا كان password مختلف (PIN مختلف)
        console.log('User exists in auth.users but no profile found, attempting sign in...');
        try {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: tempEmail,
            password: pinHash,
          });

          if (signInError) {
            // إذا فشل تسجيل الدخول، قد يكون بسبب PIN مختلف
            // في هذه الحالة، نحاول تحديث password في auth.users أولاً
            console.warn('Sign in failed, user may have different PIN:', signInError);
            
            // نحاول تحديث password في auth.users
            // ملاحظة: هذا يتطلب service role key أو Edge Function
            // في الوقت الحالي، نرجع رسالة خطأ واضحة
            return {
              success: false,
              error: 'الحساب موجود لكن لا يمكن الوصول إليه. يرجى المحاولة مرة أخرى أو الاتصال بالدعم',
            };
          }

          if (!signInData?.user?.id) {
            return {
              success: false,
              error: 'فشل الحصول على معلومات المستخدم. يرجى المحاولة مرة أخرى',
            };
          }

          const userId = signInData.user.id;

          // التحقق من وجود profile بعد تسجيل الدخول (قد يكون تم إنشاؤه بواسطة trigger)
          const { data: existingProfileById } = await supabase
            .from('profiles')
            .select('id, phone, pin_hash')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileById) {
            // Profile موجود، نحدثه
            console.log('Found profile after sign in, updating...');
            const { error: profileUpdateError } = await supabase
              .from('profiles')
              .update({
                phone: formattedPhone,
                pin_hash: pinHash,
                role: role,
                status: 'active',
                failed_attempts: 0,
                locked_until: null,
              })
              .eq('id', userId);

            if (profileUpdateError) {
              console.error('Profile update error (after sign in):', profileUpdateError);
              await supabase.auth.signOut();
              return {
                success: false,
                error: 'فشل تحديث الملف الشخصي. يرجى المحاولة مرة أخرى',
              };
            }
          } else {
            // Profile غير موجود، ننشئه
            console.log('No profile found after sign in, creating new profile...');
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                phone: formattedPhone,
                pin_hash: pinHash,
                role: role,
                status: 'active',
                failed_attempts: 0,
                locked_until: null,
                email: tempEmail,
              });

            if (profileError) {
              console.error('Profile creation error (after sign in):', profileError);
              await supabase.auth.signOut();
              return {
                success: false,
                error: 'فشل إنشاء الملف الشخصي. يرجى المحاولة مرة أخرى',
              };
            }
          }

          // تسجيل الخروج بعد إنشاء/تحديث profile
          await supabase.auth.signOut();

          return {
            success: true,
            user: {
              id: userId,
              phone: formattedPhone,
              role: role,
            },
          };
        } catch (error: any) {
          console.error('Error handling existing user:', error);
          return {
            success: false,
            error: 'حدث خطأ أثناء معالجة الحساب الموجود. يرجى المحاولة مرة أخرى',
          };
        }
      }

      return {
        success: false,
        error: authError.message || 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى',
      };
    }
    
    const userId = authData?.user?.id;
    
    if (!userId) {
      return {
        success: false,
        error: 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى',
      };
    }
    
    // التحقق من وجود profile (قد يكون تم إنشاؤه تلقائياً بواسطة trigger)
    const { data: existingProfileById } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('id', userId)
      .maybeSingle();
    
    if (existingProfileById) {
      // Profile موجود بالفعل (تم إنشاؤه بواسطة trigger)، نحدثه
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          phone: formattedPhone,
          pin_hash: pinHash,
          role: role,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
          email: tempEmail,
        })
        .eq('id', userId);
      
      if (profileUpdateError) {
        console.error('Profile update error:', profileUpdateError);
        // محاولة حذف user من auth إذا فشل تحديث profile
        try {
          await supabase.auth.admin.deleteUser(userId);
        } catch (deleteError) {
          console.error('Error deleting user:', deleteError);
        }
        return {
          success: false,
          error: 'فشل تحديث الملف الشخصي. يرجى المحاولة مرة أخرى',
        };
      }
    } else {
      // إنشاء profile جديد
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          phone: formattedPhone,
          pin_hash: pinHash,
          role: role,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
          email: tempEmail,
        });
      
      if (profileError) {
        console.error('Profile creation error:', profileError);
        // محاولة حذف user من auth إذا فشل إنشاء profile
        try {
          await supabase.auth.admin.deleteUser(userId);
        } catch (deleteError) {
          console.error('Error deleting user:', deleteError);
        }
        return {
          success: false,
          error: 'فشل إنشاء الملف الشخصي. يرجى المحاولة مرة أخرى',
        };
      }
    }
    
    return {
      success: true,
      user: {
        id: userId,
        phone: formattedPhone,
        role: role,
      },
    };
  } catch (error: any) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: error.message || 'حدث خطأ أثناء التسجيل',
    };
  }
}

/**
 * التحقق من حالة القفل
 */
export async function checkAccountLock(phone: string): Promise<{
  locked: boolean;
  lockedUntil?: Date;
  remainingAttempts?: number;
}> {
  try {
    const formattedPhone = formatPhone(phone);
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('failed_attempts, locked_until')
      .eq('phone', formattedPhone)
      .single();
    
    if (!profile) {
      return { locked: false };
    }
    
    if (profile.locked_until) {
      const lockTime = new Date(profile.locked_until);
      if (lockTime > new Date()) {
        const minutesLeft = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
        return {
          locked: true,
          lockedUntil: lockTime,
          remainingAttempts: 0,
        };
      } else {
        // فك القفل تلقائياً
        await supabase
          .from('profiles')
          .update({ locked_until: null, failed_attempts: 0 })
          .eq('phone', formattedPhone);
        return { locked: false };
      }
    }
    
    const remainingAttempts = 5 - (profile.failed_attempts || 0);
    return {
      locked: false,
      remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0,
    };
  } catch (error) {
    console.error('Check lock error:', error);
    return { locked: false };
  }
}

/**
 * التحقق من وجود رقم الموبايل في قاعدة البيانات
 * يحاول استخدام Edge Function أولاً، ثم يتراجع إلى الطريقة القديمة
 */
export async function checkPhoneExists(phone: string): Promise<boolean> {
  console.log('📞 [checkPhoneExists] Checking phone existence:', phone);
  try {
    const formattedPhone = formatPhone(phone);
    console.log('📞 [checkPhoneExists] Formatted phone:', formattedPhone);

    if (!isValidPhone(formattedPhone)) {
      console.log('❌ [checkPhoneExists] Phone format is invalid');
      return false;
    }

    // محاولة استخدام Edge Function أولاً
    try {
      console.log('🌐 [checkPhoneExists] Attempting to use Edge Function...');
      const { data, error: functionError } = await supabase.functions.invoke('check-phone', {
        body: {
          phone: formattedPhone,
        },
      });

      if (!functionError && data && data.success !== undefined) {
        console.log('✅ [checkPhoneExists] Edge Function result:', data.exists);
        return data.exists === true;
      }

      // إذا فشل Edge Function، نتابع بالطريقة القديمة
      console.warn('⚠️ [checkPhoneExists] Edge Function failed, falling back to direct check:', functionError || data?.error);
    } catch (functionError: any) {
      // Edge Function غير متاح أو فشل، نتابع بالطريقة القديمة
      console.warn('⚠️ [checkPhoneExists] Edge Function not available, using direct check:', functionError);
    }

    // الطريقة القديمة: التحقق المباشر من قاعدة البيانات
    console.log('🔍 [checkPhoneExists] Using direct database check...');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, pin_hash')
      .eq('phone', formattedPhone)
      .maybeSingle();

    // PGRST116 يعني "no rows found" وهو طبيعي (الرقم غير موجود)
    if (error) {
      if (error.code === 'PGRST116') {
        // الرقم غير موجود
        console.log('✅ [checkPhoneExists] Phone does not exist (PGRST116)');
        return false;
      }
      
      // أي خطأ آخر قد يكون مشكلة RLS أو مشكلة أخرى
      console.warn('⚠️ [checkPhoneExists] Error checking phone existence:', error);
      
      // في حالة خطأ RLS (406 أو PGRST301)، نعتبر أن الرقم غير موجود
      // لتجنب منع التسجيل، ولكن هذا قد يسبب مشاكل إذا كان الرقم موجوداً بالفعل
      if (error.code === 'PGRST301' || 
          error.message?.includes('406') || 
          error.message?.includes('Not Acceptable')) {
        console.warn('⚠️ [checkPhoneExists] RLS error, assuming phone does not exist to allow registration');
        return false;
      }
      
      // لأخطاء أخرى، نعتبر أن الرقم غير موجود لتجنب منع التسجيل
      console.log('✅ [checkPhoneExists] Assuming phone does not exist due to error');
      return false;
    }

    // نتحقق من وجود PIN hash أيضاً (لأن الحساب يجب أن يكون مكتملاً)
    const exists = !!(data && data.pin_hash);
    console.log('📊 [checkPhoneExists] Final result:', exists, data ? { hasData: true, hasPinHash: !!data.pin_hash } : { hasData: false });
    return exists;
  } catch (error) {
    console.error('❌ [checkPhoneExists] Exception:', error);
    // في حالة خطأ غير متوقع، نعتبر أن الرقم غير موجود
    return false;
  }
}

