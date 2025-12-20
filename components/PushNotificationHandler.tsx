import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Component wrapper لـ usePushNotifications hook
 * يستخدم لتسجيل device tokens وإعداد Push Notifications
 */
export default function PushNotificationHandler() {
  // استخدام hook لتسجيل device token تلقائياً
  usePushNotifications();
  
  // لا يعرض أي شيء - فقط يستخدم hook
  return null;
}
