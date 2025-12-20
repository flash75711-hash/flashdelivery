import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// تكوين كيفية التعامل مع الإشعارات عند وصولها
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const { user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        // تسجيل token في قاعدة البيانات
        if (user) {
          saveDeviceToken(token);
        }
      }
    });

    // الاستماع للإشعارات الواردة أثناء فتح التطبيق
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // الاستماع لتفاعل المستخدم مع الإشعار (الضغط عليه)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('User interacted with notification:', response);
      // يمكنك إضافة منطق للتنقل إلى صفحة معينة عند الضغط على الإشعار
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user]);

  // حفظ token في قاعدة البيانات
  const saveDeviceToken = async (token: string) => {
    if (!user) return;

    try {
      const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      
      // التحقق من وجود token مسبقاً
      const { data: existingToken } = await supabase
        .from('device_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('device_token', token)
        .single();

      if (!existingToken) {
        // إضافة token جديد
        const { error } = await supabase
          .from('device_tokens')
          .insert({
            user_id: user.id,
            device_token: token,
            platform: platform,
            is_active: true,
          });

        if (error) {
          console.error('Error saving device token:', error);
        } else {
          console.log('✅ Device token saved successfully');
        }
      } else {
        // تحديث token موجود
        const { error } = await supabase
          .from('device_tokens')
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingToken.id);

        if (error) {
          console.error('Error updating device token:', error);
        }
      }
    } catch (error) {
      console.error('Error in saveDeviceToken:', error);
    }
  };

  return {
    expoPushToken,
    notification,
  };
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push Notifications لا تعمل على الويب - فقط على الأجهزة الحقيقية
  if (Platform.OS === 'web') {
    console.log('ℹ️ Push Notifications are not supported on web platform');
    return null;
  }

  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // فقط للأجهزة الحقيقية (ليس المحاكي)
  if (!Device.isDevice && Platform.OS !== 'web') {
    console.log('⚠️ Must use physical device for Push Notifications');
    return null;
  }

  // طلب صلاحيات الإشعارات
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('⚠️ Failed to get push token for push notification!');
    return null;
  }
  
  try {
    // الحصول على projectId من Constants
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || 
                      Constants.easConfig?.projectId ||
                      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    
    if (!projectId) {
      console.warn('⚠️ No EAS project ID found. Push notifications may not work.');
      // محاولة بدون projectId (للتطوير المحلي)
      token = (await Notifications.getExpoPushTokenAsync()).data;
    } else {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
    
    console.log('✅ Expo Push Token:', token);
  } catch (e) {
    console.error('Error getting Expo push token:', e);
    token = null;
  }

  return token;
}
