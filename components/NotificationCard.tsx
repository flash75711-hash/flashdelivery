import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import responsive from '@/utils/responsive';

interface NotificationCardProps {
  compact?: boolean; // للوحة الإدارة - كارت صغير
}

export default function NotificationCard({ compact = false }: NotificationCardProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showModal, setShowModal] = useState(false);

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
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

  // إذا لم توجد إشعارات، لا نعرض الكارت
  if (notifications.length === 0) {
    return null;
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.card, compact && styles.cardCompact]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="notifications" size={compact ? 24 : 32} color="#007AFF" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>الإشعارات</Text>
            {!compact && (
              <Text style={styles.cardSubtitle}>
                {unreadCount > 0 
                  ? `${unreadCount} إشعار غير مقروء`
                  : notifications.length > 0
                  ? `${notifications.length} إشعار`
                  : 'لا توجد إشعارات'}
              </Text>
            )}
            {compact && unreadCount > 0 && (
              <Text style={styles.cardSubtitleCompact}>
                {unreadCount} غير مقروء
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </View>
      </TouchableOpacity>

      {/* Modal لعرض جميع الإشعارات */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="notifications" size={24} color="#007AFF" />
                <Text style={styles.modalTitle}>
                  الإشعارات {unreadCount > 0 && `(${unreadCount} غير مقروء)`}
                </Text>
              </View>
              <View style={styles.modalHeaderRight}>
                {unreadCount > 0 && (
                  <TouchableOpacity
                    style={styles.markAllButton}
                    onPress={() => {
                      markAllAsRead();
                    }}
                  >
                    <Text style={styles.markAllButtonText}>تمييز الكل كمقروء</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#1a1a1a" />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              style={styles.modalBody}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.notificationItem,
                    !item.is_read && styles.notificationItemUnread,
                    item.type === 'error' && styles.notificationItemError,
                    item.type === 'success' && styles.notificationItemSuccess,
                    item.type === 'warning' && styles.notificationItemWarning,
                  ]}
                  onPress={() => handleNotificationPress(item)}
                >
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <Ionicons
                        name={getIconName(item.type) as any}
                        size={20}
                        color={getIconColor(item.type)}
                      />
                      <Text style={styles.notificationTitle}>{item.title}</Text>
                      {!item.is_read && (
                        <View style={styles.unreadDot} />
                      )}
                    </View>
                    <Text style={styles.notificationMessage}>{item.message}</Text>
                    <Text style={styles.notificationTime}>
                      {new Date(item.created_at).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="notifications-outline" size={64} color="#ccc" />
                  <Text style={styles.emptyText}>لا توجد إشعارات</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  cardCompact: {
    padding: 16,
    marginBottom: 16,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'right',
  },
  cardSubtitleCompact: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF20',
    borderRadius: 8,
  },
  markAllButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  notificationItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  notificationItemUnread: {
    backgroundColor: '#F0F7FF',
  },
  notificationItemError: {
    borderLeftColor: '#FF3B30',
  },
  notificationItemSuccess: {
    borderLeftColor: '#34C759',
  },
  notificationItemWarning: {
    borderLeftColor: '#FF9500',
  },
  notificationContent: {
    gap: 8,
  },
  notificationHeader: {
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
  notificationMessage: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'right',
    lineHeight: 20,
  },
  notificationTime: {
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
