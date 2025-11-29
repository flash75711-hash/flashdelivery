import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

// إكمال جلسة المتصفح لـ OAuth
WebBrowser.maybeCompleteAuthSession();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
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
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

// جلب معلومات المستخدم مع الدور
export async function getUserWithRole(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email || '',
    role: (profile?.role as UserRole) || 'customer',
    full_name: profile?.full_name,
    phone: profile?.phone,
    avatar_url: profile?.avatar_url,
  };
}

// التحقق من إكمال التسجيل
export async function isRegistrationComplete(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, role')
    .eq('id', userId)
    .single();

  if (!profile) return false;

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
}

