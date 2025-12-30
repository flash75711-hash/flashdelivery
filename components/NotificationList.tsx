import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import responsive, { createShadowStyle } from '@/utils/responsive';

interface NotificationListProps {
  maxItems?: number;
  showHeader?: boolean;
  onNotificationPress?: (notification: Notification) => void;
}

export default function NotificationList({ 
  maxItems = 5, 
  showHeader = true,
  onNotificationPress 
}: NotificationListProps) {
  const { notifications, unreadCount, markAsRead } = useNotifications();

  const displayNotifications = notifications.slice(0, maxItems);

  if (notifications.length === 0) {
    return null;
  }

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (onNotificationPress) {
      onNotificationPress(notification);
    }
  };

  const getIconName = (type: string) => {
    switch (type) {
      case 'error':
        return 'alert-circle';
      case 'success':
        return 'checkmark-circle';
      case 'warning':
        return 'warning';
      default:
        return 'information-circle';
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'error':
        return '#FF3B30';
      case 'success':
        return '#34C759';
      case 'warning':
        return '#FF9500';
      default:
        return '#007AFF';
    }
  };

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <Ionicons name="notifications" size={24} color="#007AFF" />
          <Text style={styles.title}>
            الإشعارات {unreadCount > 0 && `(${unreadCount} غير مقروء)`}
          </Text>
        </View>
      )}
      {displayNotifications.map((notification) => (
        <TouchableOpacity
          key={notification.id}
          style={[
            styles.card,
            !notification.is_read && styles.cardUnread,
            notification.type === 'error' && styles.cardError,
            notification.type === 'success' && styles.cardSuccess,
            notification.type === 'warning' && styles.cardWarning,
          ]}
          onPress={() => handleNotificationPress(notification)}
        >
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Ionicons
                name={getIconName(notification.type) as any}
                size={20}
                color={getIconColor(notification.type)}
              />
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              {!notification.is_read && (
                <View style={styles.unreadDot} />
              )}
            </View>
            <Text style={styles.message}>{notification.message}</Text>
            <Text style={styles.time}>
              {new Date(notification.created_at).toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  cardUnread: {
    backgroundColor: '#F0F7FF',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  cardError: {
    borderLeftColor: '#FF3B30',
  },
  cardSuccess: {
    borderLeftColor: '#34C759',
  },
  cardWarning: {
    borderLeftColor: '#FF9500',
  },
  content: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  notificationTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'right',
  },
  message: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  time: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#999',
    textAlign: 'right',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
});




