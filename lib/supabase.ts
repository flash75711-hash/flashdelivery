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

