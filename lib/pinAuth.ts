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
    const formattedPhone = formatPhone(phone);
    
    // التحقق من صحة المدخلات
    if (!isValidPhone(formattedPhone)) {
      return {
        success: false,
        error: 'رقم الموبايل غير صحيح',
      };
    }
    
    if (!isValidPin(pin)) {
      return {
        success: false,
        error: 'رمز PIN يجب أن يكون 6 أرقام',
      };
    }
    
    // البحث عن المستخدم في profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone, pin_hash, role, full_name, email, failed_attempts, locked_until')
      .eq('phone', formattedPhone)
      .single();
    
    if (profileError || !profile) {
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
  } catch (error: any) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message || 'حدث خطأ أثناء تسجيل الدخول',
    };
  }
}

/**
 * التسجيل بحساب جديد
 */
export async function registerWithPin(
  phone: string,
  pin: string,
  role: UserRole
): Promise<PinAuthResult> {
  try {
    const formattedPhone = formatPhone(phone);
    
    // التحقق من صحة المدخلات
    if (!isValidPhone(formattedPhone)) {
      return {
        success: false,
        error: 'رقم الموبايل غير صحيح',
      };
    }
    
    if (!isValidPin(pin)) {
      return {
        success: false,
        error: 'رمز PIN يجب أن يكون 6 أرقام',
      };
    }
    
    if (!['customer', 'driver', 'vendor'].includes(role)) {
      return {
        success: false,
        error: 'نوع الحساب غير صحيح',
      };
    }
    
    // التحقق من وجود المستخدم
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('phone', formattedPhone)
      .single();
    
    if (existingProfile) {
      return {
        success: false,
        error: 'رقم الموبايل مسجل بالفعل',
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
    
    // إنشاء profile
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

