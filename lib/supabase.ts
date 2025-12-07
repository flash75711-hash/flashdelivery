import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// إكمال جلسة المتصفح لـ OAuth
WebBrowser.maybeCompleteAuthSession();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// استخدام AsyncStorage في التطبيق فقط
// في المتصفح، نترك Supabase يستخدم localStorage مباشرة
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(storage && { storage: storage as any }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// أنواع الأدوار
export type UserRole = 'customer' | 'driver' | 'vendor' | 'admin';

// واجهة المستخدم
export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  registration_complete?: boolean;
}

// جلب معلومات المستخدم مع الدور
export async function getUserWithRole(): Promise<User | null> {
  console.log('getUserWithRole: Starting...');
  try {
    const { data: { user }, error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
      console.error('getUserWithRole: Error getting user:', getUserError);
      return null;
    }
    if (!user) {
      console.log('getUserWithRole: No user found');
      return null;
    }

    console.log('getUserWithRole: Got user:', user.id);
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('getUserWithRole: Error fetching profile:', error);
        // إذا لم يكن هناك ملف، نرجع بيانات أساسية
        return {
          id: user.id,
          email: user.email || '',
          role: 'customer' as UserRole, // افتراضي
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
        };
      }

      console.log('getUserWithRole: Profile found, role:', profile?.role);
      return {
        id: user.id,
        email: user.email || '',
        role: (profile?.role as UserRole) || 'customer',
        full_name: profile?.full_name,
        phone: profile?.phone,
        avatar_url: profile?.avatar_url,
        registration_complete: profile?.registration_complete,
      };
    } catch (error) {
      console.error('getUserWithRole: Error in profile fetch:', error);
      // في حالة الخطأ، نرجع بيانات أساسية من auth
      return {
        id: user.id,
        email: user.email || '',
        role: 'customer' as UserRole,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      };
    }
  } catch (error) {
    console.error('getUserWithRole: Unexpected error:', error);
    return null;
  }
}

// التحقق من إكمال التسجيل
export async function isRegistrationComplete(userId: string): Promise<boolean> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('full_name, phone, role, registration_complete')
      .eq('id', userId)
      .single();

    if (error || !profile) return false;
    
    // إذا كان registration_complete موجود و true، نرجع true مباشرة
    if (profile.registration_complete === true) return true;

  // التحقق حسب نوع الحساب
  switch (profile.role) {
    case 'customer':
      // للعميل: يجب أن يكون لديه الاسم والتليفون وعنوان واحد على الأقل
      if (!profile.full_name || !profile.phone) return false;
      const { data: addresses } = await supabase
        .from('customer_addresses')
        .select('id')
        .eq('customer_id', userId)
        .limit(1);
      return addresses && addresses.length > 0;

    case 'driver':
      // للسائق: يجب أن يكون لديه الاسم والتليفون وصور المستندات
      if (!profile.full_name || !profile.phone) return false;
      const { data: driverProfile } = await supabase
        .from('profiles')
        .select('id_card_image_url, selfie_image_url')
        .eq('id', userId)
        .single();
      return !!(driverProfile?.id_card_image_url && driverProfile?.selfie_image_url);

    case 'vendor':
      // لمزود الخدمة: يجب أن يكون لديه اسم المكان والموقع
      const { data: vendor } = await supabase
        .from('vendors')
        .select('name, latitude, longitude')
        .eq('id', userId)
        .single();
      return !!(vendor?.name && vendor?.latitude && vendor?.longitude);

    default:
      return true; // Admin لا يحتاج إكمال تسجيل
  }
  } catch (error) {
    console.error('Error checking registration completion:', error);
    return false;
  }
}

