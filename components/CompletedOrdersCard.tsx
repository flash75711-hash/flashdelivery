import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import responsive, { createShadowStyle } from '@/utils/responsive';
import type { Order } from '@/hooks/useMyOrders';
import OrderCard from './OrderCard';

interface CompletedOrdersCardProps {
  orders: Order[];
  title?: string;
}

export default function CompletedOrdersCard({ orders, title = 'الطلبات المكتملة' }: CompletedOrdersCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (orders.length === 0) return null;

  const displayedOrders = showAll ? orders : orders.slice(0, 3);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="checkmark-circle" size={24} color="#34C759" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.count}>{orders.length} طلب</Text>
          </View>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color="#666"
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          {displayedOrders.map((order, index) => (
            <View key={order.id} style={index > 0 ? styles.orderCardWrapper : undefined}>
              <OrderCard order={order} />
            </View>
          ))}
          
          {orders.length > 3 && !showAll && (
            <TouchableOpacity
              style={styles.showMoreButton}
              onPress={() => setShowAll(true)}
            >
              <Text style={styles.showMoreText}>
                عرض جميع الطلبات ({orders.length})
              </Text>
              <Ionicons name="chevron-down" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}

          {showAll && orders.length > 3 && (
            <TouchableOpacity
              style={styles.showMoreButton}
              onPress={() => setShowAll(false)}
            >
              <Text style={styles.showMoreText}>إخفاء</Text>
              <Ionicons name="chevron-up" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  count: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  content: {
    padding: 16,
  },
  orderCardWrapper: {
    marginTop: 12,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  showMoreText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#007AFF',
    fontWeight: '600',
  },
});

