import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrderSearch, SearchStatus } from '@/hooks/useOrderSearch';
import responsive from '@/utils/responsive';

interface OrderSearchStatusProps {
  orderId: string;
  searchPoint: { lat: number; lon: number };
  onDriverFound?: (driverId: string) => void;
}

export default function OrderSearchStatus({
  orderId,
  searchPoint,
  onDriverFound,
}: OrderSearchStatusProps) {
  const {
    searchStatus,
    currentRadius,
    timeRemaining,
    foundDrivers,
    restartSearch,
  } = useOrderSearch({
    orderId,
    searchPoint,
    onDriverFound,
  });

  if (!searchStatus) {
    return null;
  }

  const getStatusText = () => {
    switch (searchStatus) {
      case 'searching':
        return `البحث في نطاق ${currentRadius} كم...`;
      case 'expanded':
        return `البحث الموسع في نطاق ${currentRadius} كم...`;
      case 'stopped':
        return 'تم إيقاف البحث';
      case 'found':
        return 'تم العثور على سائق';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (searchStatus) {
      case 'searching':
        return '#007AFF';
      case 'expanded':
        return '#FF9500';
      case 'stopped':
        return '#FF3B30';
      case 'found':
        return '#34C759';
      default:
        return '#666';
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.statusBar, { borderLeftColor: getStatusColor() }]}>
        <Ionicons
          name={
            searchStatus === 'found'
              ? 'checkmark-circle'
              : searchStatus === 'stopped'
              ? 'close-circle'
              : 'search'
          }
          size={20}
          color={getStatusColor()}
        />
        <View style={styles.statusInfo}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {searchStatus !== 'stopped' && searchStatus !== 'found' && (
            <Text style={styles.timeText}>
              الوقت المتبقي: {timeRemaining} ثانية
            </Text>
          )}
          {foundDrivers.length > 0 && (
            <Text style={styles.driversText}>
              تم العثور على {foundDrivers.length} سائق
            </Text>
          )}
        </View>
      </View>
      {searchStatus === 'stopped' && (
        <TouchableOpacity
          style={styles.restartButton}
          onPress={restartSearch}
        >
          <Ionicons name="refresh" size={18} color="#007AFF" />
          <Text style={styles.restartButtonText}>البحث مرة أخرى</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
    marginBottom: 4,
  },
  timeText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'right',
  },
  driversText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#007AFF',
    textAlign: 'right',
    marginTop: 4,
  },
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  restartButtonText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#007AFF',
  },
});



