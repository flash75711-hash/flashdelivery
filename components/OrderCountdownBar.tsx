import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrderCountdown } from '../hooks/useOrderCountdown';
import responsive from '../utils/responsive'; // Corrected import path

interface OrderCountdownBarProps {
  deadline: string | null;
}

export const OrderCountdownBar: React.FC<OrderCountdownBarProps> = ({ deadline }) => {
  const { countdown, isExpired } = useOrderCountdown(deadline);

  if (!deadline || isExpired) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Ionicons name="time-outline" size={responsive.getResponsiveFontSize(16)} color="#FF9500" />
      <Text style={styles.countdownText}>
        {countdown.hours.toString().padStart(2, '0')}:
        {countdown.minutes.toString().padStart(2, '0')}:
        {countdown.seconds.toString().padStart(2, '0')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBCC', // Light orange background
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: 'flex-start', // Adjusts to content width
  },
  countdownText: {
    marginLeft: 5,
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#FF9500', // Orange text
  },
});

