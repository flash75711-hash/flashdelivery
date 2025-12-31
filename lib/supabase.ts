import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// التحقق من وجود متغيرات البيئة
if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage = '⚠️ متغيرات البيئة غير معرّفة!\n\nيرجى إضافة Environment Variables في Vercel:\n- EXPO_PUBLIC_SUPABASE_URL\n- EXPO_PUBLIC_SUPABASE_ANON_KEY\n\nراجع: VERCEL_SECRETS.md';
  
  console.error(errorMessage);
  
  // في المتصفح، عرض رسالة خطأ واضحة
  if (typeof window !== 'undefined') {
    console.error('Supabase configuration error:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      url: supabaseUrl || 'MISSING',
      key: supabaseAnonKey ? '***' : 'MISSING'
    });
  }
}

// على الويب، Supabase يستخدم localStorage تلقائياً
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key', {
  auth: {
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

// جلب معلومات المستخدم مع الدور من session مباشرة (أسرع)
export async function getUserWithRoleFromSession(session: { user: any } | null): Promise<User | null> {
  if (!session?.user) {
    console.log('getUserWithRoleFromSession: No session or user');
    return null;
  }
  
  console.log('getUserWithRoleFromSession: Got user from session:', session.user.id);
  const user = session.user;
  
  // محاولة جلب profile مع timeout قصير (2 ثانية) للسرعة
  try {
    console.log('getUserWithRoleFromSession: Fetching profile from database (with short timeout)...');
    const profilePromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    // تقليل timeout إلى 2 ثانية للسرعة
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Profile fetch timeout after 2 seconds')), 2000)
    );
    
    const result = await Promise.race([profilePromise, timeoutPromise]) as any;
    const { data: profile, error } = result || { data: null, error: null };
    
    console.log('getUserWithRoleFromSession: Profile query completed, error:', error?.message || 'none', 'profile:', profile ? 'found' : 'not found');

    if (!error && profile) {
      console.log('getUserWithRoleFromSession: Profile found, role:', profile?.role);
      return {
        id: user.id,
        email: user.email || '',
        role: (profile?.role as UserRole) || 'customer',
        full_name: profile?.full_name,
        phone: profile?.phone,
        avatar_url: profile?.avatar_url,
        registration_complete: profile?.registration_complete,
      };
    }
    
    // إذا لم يكن هناك ملف، نرجع بيانات أساسية مع role: 'customer' كافتراضي
    console.log('getUserWithRoleFromSession: No profile found, using basic user data');
    return {
      id: user.id,
      email: user.email || '',
      role: 'customer' as UserRole, // افتراضي فقط إذا لم يكن هناك profile
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    };
  } catch (error) {
    console.warn('getUserWithRoleFromSession: Profile fetch failed or timed out, returning basic user data immediately:', error);
    // في حالة timeout أو خطأ، نرجع بيانات أساسية بسرعة (بدون retry)
    return {
      id: user.id,
      email: user.email || '',
      role: 'customer' as UserRole, // افتراضي فقط كحل أخير
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    };
  }
}

// حفظ بيانات المستخدم في localStorage (للمستخدمين الذين سجلوا دخولهم بـ PIN)
export function saveUserToLocalStorage(user: User): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem('flash_user', JSON.stringify(user));
      console.log('✅ User saved to localStorage');
    } catch (error) {
      console.error('❌ Error saving user to localStorage:', error);
    }
  }
}

// استعادة بيانات المستخدم من localStorage
export function getUserFromLocalStorage(): User | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const userStr = localStorage.getItem('flash_user');
      if (userStr) {
        const user = JSON.parse(userStr) as User;
        console.log('✅ User restored from localStorage:', user.id);
        return user;
      }
    } catch (error) {
      console.error('❌ Error reading user from localStorage:', error);
      // في حالة خطأ، نمسح البيانات التالفة
      localStorage.removeItem('flash_user');
    }
  }
  return null;
}

// مسح بيانات المستخدم من localStorage
export function clearUserFromLocalStorage(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem('flash_user');
      console.log('✅ User cleared from localStorage');
    } catch (error) {
      console.error('❌ Error clearing user from localStorage:', error);
    }
  }
}

// جلب معلومات المستخدم مع الدور
export async function getUserWithRole(): Promise<User | null> {
  console.log('getUserWithRole: Starting...');
  try {
    // محاولة استخدام getSession أولاً (أسرع وأكثر موثوقية)
    console.log('getUserWithRole: Trying getSession() first...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('getUserWithRole: Error getting session:', sessionError);
    }
    
    if (session?.user) {
      console.log('getUserWithRole: Got user from session:', session.user.id);
      const user = session.user;
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
    }
    
    // إذا لم نجد user من session، نجرب getUser() كحل بديل
    console.log('getUserWithRole: No user in session, trying getUser()...');
    try {
      console.log('getUserWithRole: Calling supabase.auth.getUser()...');
      // استخدام Promise.race لإضافة timeout
      const getUserPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getUser timeout after 10 seconds')), 10000)
      );
      
      const result = await Promise.race([getUserPromise, timeoutPromise]) as any;
      console.log('getUserWithRole: supabase.auth.getUser() completed');
      
      const { data: { user }, error: getUserError } = result || { data: { user: null }, error: null };
      
      if (getUserError) {
        console.error('getUserWithRole: Error getting user:', getUserError);
        // إذا فشل getUser، نجرب localStorage (للمستخدمين الذين سجلوا دخولهم بـ PIN)
        console.log('getUserWithRole: Trying localStorage as fallback...');
        const localUser = getUserFromLocalStorage();
        if (localUser) {
          console.log('getUserWithRole: Found user in localStorage');
          return localUser;
        }
        return null;
      }
      if (!user) {
        console.log('getUserWithRole: No user found, trying localStorage...');
        // إذا لم يكن هناك user، نجرب localStorage (للمستخدمين الذين سجلوا دخولهم بـ PIN)
        const localUser = getUserFromLocalStorage();
        if (localUser) {
          console.log('getUserWithRole: Found user in localStorage');
          return localUser;
        }
        return null;
      }

      console.log('getUserWithRole: Got user:', user.id);
      
      // نفس منطق جلب profile كما في الأعلى
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('getUserWithRole: Error fetching profile:', error);
          return {
            id: user.id,
            email: user.email || '',
            role: 'customer' as UserRole,
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
        return {
          id: user.id,
          email: user.email || '',
          role: 'customer' as UserRole,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
        };
      }
    } catch (getUserError) {
      console.error('getUserWithRole: Error in getUser fallback:', getUserError);
      // إذا فشل كل شيء، نجرب localStorage (للمستخدمين الذين سجلوا دخولهم بـ PIN)
      console.log('getUserWithRole: Trying localStorage as final fallback...');
      const localUser = getUserFromLocalStorage();
      if (localUser) {
        console.log('getUserWithRole: Found user in localStorage');
        return localUser;
      }
      return null;
    }
  } catch (error) {
    console.error('getUserWithRole: Unexpected error:', error);
    // إذا فشل كل شيء، نجرب localStorage (للمستخدمين الذين سجلوا دخولهم بـ PIN)
    console.log('getUserWithRole: Trying localStorage as final fallback (catch)...');
    const localUser = getUserFromLocalStorage();
    if (localUser) {
      console.log('getUserWithRole: Found user in localStorage');
      return localUser;
    }
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
      return !!(addresses && addresses.length > 0);

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

// Reverse geocoding using Supabase Edge Function (avoids CORS issues)
export async function reverseGeocode(lat: number, lon: number): Promise<any | null> {
  try {
    // استخدام المتغير الموجود في أعلى الملف
    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      console.warn('Supabase URL not configured, falling back to direct Nominatim call');
      // Fallback to direct call (may fail due to CORS)
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ar&addressdetails=1`;
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'FlashDelivery/1.0',
        },
      });
      if (!response.ok) return null;
      return await response.json();
    }

    // استخدام Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/reverse-geocode`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ lat, lon }),
    });

    if (!response.ok) {
      console.warn('Reverse geocoding Edge Function failed:', response.status, 'Falling back to direct call');
      // Fallback to direct call if Edge Function fails
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ar&addressdetails=1`;
      const fallbackResponse = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'FlashDelivery/1.0',
        },
      });
      if (!fallbackResponse.ok) return null;
      return await fallbackResponse.json();
    }

    return await response.json();
  } catch (error: any) {
    console.error('Reverse geocoding error:', error);
    // Fallback to direct call on error
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ar&addressdetails=1`;
      const fallbackResponse = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'FlashDelivery/1.0',
        },
      });
      if (!fallbackResponse.ok) return null;
      return await fallbackResponse.json();
    } catch (fallbackError) {
      console.error('Fallback reverse geocoding also failed:', fallbackError);
      return null;
    }
  }
}

/**
 * Forward geocoding: تحويل العنوان إلى إحداثيات
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    if (!address || address.trim() === '') {
      return null;
    }

    // استخدام Nominatim للـ forward geocoding
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=ar`;
    
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'FlashDelivery/1.0',
      },
    });

    if (!response.ok) {
      console.error('Geocoding failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }

    return null;
  } catch (error: any) {
    console.error('Forward geocoding error:', error);
    return null;
  }
}

