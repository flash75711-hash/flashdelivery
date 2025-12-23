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
import responsive from '@/utils/responsive';

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
  const [slideAnim] = useState(new Animated.Value(-200));
  const [opacityAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible && notification) {
      // إظهار الإشعار بانتقال سلس
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
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
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, notification, slideAnim, opacityAnim]);

  const handleDismiss = async () => {
    if (notification) {
      // تحديث الإشعار كمقروء
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    onDismiss();
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (notification?.order_id) {
      // إذا كان الإشعار مرتبط بطلب، انتقل إلى صفحة الطلب
      router.push({
        pathname: '/(tabs)/driver/trips',
        params: { orderId: notification.order_id },
      });
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

  const getIconColor = (type: string) => {
    switch (type) {
      case 'success':
        return '#34C759';
      case 'error':
        return '#FF3B30';
      case 'warning':
        return '#FF9500';
      default:
        return '#007AFF';
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return '#E8F5E9';
      case 'error':
        return '#FFEBEE';
      case 'warning':
        return '#FFF3E0';
      default:
        return '#E3F2FD';
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
    left: 16,
    right: 16,
    zIndex: 9999,
    ...(responsive.isLargeScreen() && {
      left: '50%',
      right: 'auto',
      marginLeft: -(responsive.getMaxContentWidth() / 2) + 16,
      maxWidth: responsive.getMaxContentWidth() - 32,
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'right',
  },
  message: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});

// Helper function for styles
function getIconColor(type: string): string {
  switch (type) {
    case 'success':
      return '#34C759';
    case 'error':
      return '#FF3B30';
    case 'warning':
      return '#FF9500';
    default:
      return '#007AFF';
  }
}

