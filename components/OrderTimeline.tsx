import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

interface OrderTimelineProps {
  order: {
    id: string;
    status: string;
    created_at: string;
    search_started_at?: string | null;
    driver_id?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
    search_status?: string | null;
    [key: string]: any; // للسماح بحقول إضافية
  };
}

interface TimelineEvent {
  status: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  timestamp: string | null;
  completed: boolean;
}

export default function OrderTimeline({ order }: OrderTimelineProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, title, message, created_at')
          .eq('order_id', order.id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading notifications for timeline:', error);
        } else {
          setNotifications(data || []);
        }
      } catch (err) {
        console.error('Exception loading notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [order.id]);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getNotificationTime = (title: string): string | null => {
    const notification = notifications.find((n) => 
      n.title.includes(title) || 
      n.message.includes(title)
    );
    return notification?.created_at || null;
  };

  const getTimelineEvents = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    // 1. إنشاء الطلب (pending)
    events.push({
      status: 'pending',
      title: 'تم إنشاء الطلب',
      description: 'تم إنشاء الطلب بنجاح',
      icon: 'create-outline',
      color: '#FF9500',
      timestamp: order.created_at,
      completed: true,
    });

    // 2. بدء البحث عن سائق
    if (order.search_started_at) {
      events.push({
        status: 'searching',
        title: 'بدء البحث عن سائق',
        description: 'جاري البحث عن سائق متاح',
        icon: 'search-outline',
        color: '#007AFF',
        timestamp: order.search_started_at,
        completed: order.status !== 'pending' || order.driver_id !== null,
      });
    }

    // 3. قبول الطلب (accepted)
    if (order.driver_id && ['accepted', 'pickedUp', 'inTransit', 'completed'].includes(order.status)) {
      events.push({
        status: 'accepted',
        title: 'تم قبول الطلب',
        description: 'تم قبول الطلب من قبل السائق',
        icon: 'checkmark-circle-outline',
        color: '#007AFF',
        timestamp: getNotificationTime('تم قبول طلبك') || getNotificationTime('قبول'),
        completed: true,
      });
    }

    // 4. استلام الطلب (pickedUp)
    if (['pickedUp', 'inTransit', 'completed'].includes(order.status)) {
      events.push({
        status: 'pickedUp',
        title: 'تم استلام الطلب',
        description: 'تم استلام الطلب من مكان الاستلام',
        icon: 'cube-outline',
        color: '#34C759',
        timestamp: getNotificationTime('تم استلام الطلب') || getNotificationTime('استلام'),
        completed: true,
      });
    }

    // 5. بدء التوصيل (inTransit)
    if (['inTransit', 'completed'].includes(order.status)) {
      events.push({
        status: 'inTransit',
        title: 'قيد التوصيل',
        description: 'الطلب في الطريق إليك',
        icon: 'car-outline',
        color: '#007AFF',
        timestamp: getNotificationTime('قيد التوصيل') || getNotificationTime('الطلب في الطريق'),
        completed: true,
      });
    }

    // 6. إكمال الطلب (completed)
    if (order.status === 'completed' && order.completed_at) {
      events.push({
        status: 'completed',
        title: 'تم إكمال الطلب',
        description: 'تم توصيل الطلب بنجاح',
        icon: 'checkmark-circle',
        color: '#34C759',
        timestamp: order.completed_at,
        completed: true,
      });
    }

    // 7. إلغاء الطلب (cancelled)
    if (order.status === 'cancelled' && order.cancelled_at) {
      events.push({
        status: 'cancelled',
        title: 'تم إلغاء الطلب',
        description: 'تم إلغاء الطلب',
        icon: 'close-circle',
        color: '#FF3B30',
        timestamp: order.cancelled_at,
        completed: true,
      });
    }

    return events;
  };

  const timelineEvents = getTimelineEvents();

  if (timelineEvents.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>الشريط الزمني للطلب</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>الشريط الزمني للطلب</Text>
      <View style={styles.timeline}>
        {timelineEvents.map((event, index) => {
          const isLast = index === timelineEvents.length - 1;
          const isActive = event.completed || order.status === event.status;

          return (
            <View key={`${event.status}-${index}`} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: isActive ? event.color + '20' : '#E5E5EA' },
                  ]}
                >
                  <Ionicons
                    name={event.icon}
                    size={20}
                    color={isActive ? event.color : '#999'}
                  />
                </View>
                {!isLast && (
                  <View
                    style={[
                      styles.timelineLine,
                      { backgroundColor: isActive ? event.color : '#E5E5EA' },
                    ]}
                  />
                )}
              </View>
              <View style={styles.timelineRight}>
                <Text
                  style={[
                    styles.eventTitle,
                    { color: isActive ? '#1a1a1a' : '#999' },
                  ]}
                >
                  {event.title}
                </Text>
                <Text style={styles.eventDescription}>{event.description}</Text>
                {event.timestamp && (
                  <Text style={styles.eventTime}>{formatDate(event.timestamp)}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  timeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineLeft: {
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  timelineLine: {
    position: 'absolute',
    top: 40,
    left: 20,
    width: 2,
    height: '100%',
    zIndex: 0,
  },
  timelineRight: {
    flex: 1,
    paddingTop: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: '#999',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
});
