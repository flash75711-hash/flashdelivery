import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import responsive, { createShadowStyle, getM3CardStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';

export interface FloatingNotificationData {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  order_id?: string | null;
  created_at: string;
}

interface FloatingNotificationProps {
  visible: boolean;
  notification: FloatingNotificationData | null;
  onDismiss: () => void;
  onPress?: () => void;
}

export default function FloatingNotification({
  visible,
  notification,
  onDismiss,
  onPress,
}: FloatingNotificationProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [slideAnim] = useState(new Animated.Value(-200));
  const [opacityAnim] = useState(new Animated.Value(0));

  // تعطيل useNativeDriver على الويب لأنه غير مدعوم
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (visible && notification) {
      // وضع علامة is_read: true عند العرض مباشرة (مرة واحدة فقط)
      const markAsReadOnShow = async () => {
        // تحديث الإشعار كمقروء فقط إذا كان ID صحيح (يبدأ بـ UUID أو ليس من نوع order_created_)
        // تجنب تحديث الإشعارات المؤقتة التي تم إنشاؤها من useOrderNotifications
        const isValidNotificationId = notification.id && 
          !notification.id.startsWith('order_created_') && 
          !notification.id.startsWith('order_status_') &&
          !notification.id.startsWith('new_order_') &&
          !notification.id.startsWith('order_completed_');
        
        if (isValidNotificationId) {
          try {
            // محاولة استخدام update مباشر أولاً
            const { error: updateError } = await supabase
              .from('notifications')
              .update({ is_read: true })
              .eq('id', notification.id);
            
            // إذا فشل (مثل RLS issue)، استخدم Edge Function
            if (updateError) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { error: edgeError } = await supabase.functions.invoke('mark-notification-read', {
                  body: { notification_id: notification.id, user_id: user.id },
                });
                
                if (edgeError) {
                  console.error('[FloatingNotification] Error marking notification as read (Edge Function):', edgeError);
                }
              }
            }
          } catch (error) {
            console.error('[FloatingNotification] Error marking notification as read:', error);
          }
        }
      };
      
      // وضع علامة is_read: true عند العرض مباشرة
      markAsReadOnShow();

      // إظهار الإشعار بانتقال سلس
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver,
        }),
      ]).start();

      // إخفاء تلقائي بعد 5 ثوانٍ
      const timer = setTimeout(() => {
        handleDismiss();
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      // إخفاء الإشعار
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -200,
          duration: 300,
          useNativeDriver,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver,
        }),
      ]).start();
    }
  }, [visible, notification, slideAnim, opacityAnim, useNativeDriver]);

  const handleDismiss = async () => {
    if (notification) {
      // تحديث الإشعار كمقروء فقط إذا كان ID صحيح (يبدأ بـ UUID أو ليس من نوع order_created_)
      // تجنب تحديث الإشعارات المؤقتة التي تم إنشاؤها من useOrderNotifications
      const isValidNotificationId = notification.id && 
        !notification.id.startsWith('order_created_') && 
        !notification.id.startsWith('order_status_') &&
        !notification.id.startsWith('new_order_') &&
        !notification.id.startsWith('order_completed_');
      
      if (isValidNotificationId) {
      try {
          const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);
          
          if (error) {
            console.error('Error marking notification as read:', error);
          }
      } catch (error) {
        console.error('Error marking notification as read:', error);
        }
      }
    }
    onDismiss();
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (notification?.order_id) {
      // إذا كان الإشعار مرتبط بطلب، انتقل إلى صفحة الطلب حسب دور المستخدم
      if (user?.role === 'customer') {
        router.push({
          pathname: '/(tabs)/customer/my-orders',
          params: { orderId: notification.order_id },
        });
      } else if (user?.role === 'driver') {
        router.push({
          pathname: '/(tabs)/driver/trips',
          params: { orderId: notification.order_id },
        });
      }
    }
    handleDismiss();
  };

  if (!visible || !notification) return null;

  const getIconName = (type: string) => {
    switch (type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'close-circle';
      case 'warning':
        return 'warning';
      default:
        return 'information-circle';
    }
  };

  // M3 Colors based on notification type
  const getIconColor = (type: string) => {
    switch (type) {
      case 'success':
        return M3Theme.colors.success.onContainer; // Dark green
      case 'error':
        return M3Theme.colors.onErrorContainer; // Dark red
      case 'warning':
        return M3Theme.colors.warning.onContainer; // Dark orange
      default:
        return M3Theme.colors.info.onContainer; // Dark blue
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return M3Theme.colors.success.container; // Light green
      case 'error':
        return M3Theme.colors.errorContainer; // Light red
      case 'warning':
        return M3Theme.colors.warning.container; // Light orange
      default:
        return M3Theme.colors.info.container; // Light blue
    }
  };

  const styles = getStyles();
  const iconName = getIconName(notification.type);
  const iconColor = getIconColor(notification.type);
  const backgroundColor = getBackgroundColor(notification.type);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.content, { backgroundColor, borderLeftColor: iconColor }]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={iconName as any} size={24} color={iconColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{notification.title}</Text>
          {notification.message && (
            <Text style={styles.message} numberOfLines={2}>
              {notification.message}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color="#666" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const getStyles = () => StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 60,
    left: getM3HorizontalPadding(), // M3: 16px
    right: getM3HorizontalPadding(), // M3: 16px
    zIndex: 9999,
    ...(responsive.isLargeScreen() && {
      left: '50%',
      right: 'auto',
      marginLeft: -(responsive.getMaxContentWidth() / 2) + getM3HorizontalPadding(),
      maxWidth: responsive.getMaxContentWidth() - (getM3HorizontalPadding() * 2),
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: M3Theme.spacing.md, // M3: 16px
    borderRadius: M3Theme.shape.cornerMedium, // 12px
    ...M3Theme.elevation.level1, // M3 subtle shadow
    borderLeftWidth: 4,
    borderLeftColor: M3Theme.colors.primary, // Will be overridden by dynamic color
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...M3Theme.typography.titleMedium, // 16px, weight 600
    fontWeight: 'bold', // Override for emphasis
    color: M3Theme.colors.onSurface,
    marginBottom: 4,
    textAlign: 'right',
  },
  message: {
    ...M3Theme.typography.bodyMedium, // 14px base font
    color: M3Theme.colors.onSurfaceVariant,
    textAlign: 'right',
  },
  closeButton: {
    padding: M3Theme.spacing.xs, // 4px
    marginLeft: M3Theme.spacing.sm, // 8px
    ...getM3TouchTarget('minimum'), // 44x44px minimum
    ...Platform.select({
      web: M3Theme.webViewStyles.button, // user-select: none
    }),
  },
});
