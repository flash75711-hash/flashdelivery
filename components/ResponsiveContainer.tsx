import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import responsive from '@/utils/responsive';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  maxWidth?: boolean;
}

export default function ResponsiveContainer({ 
  children, 
  style, 
  maxWidth = true 
}: ResponsiveContainerProps) {
  const containerStyle = [
    styles.container,
    maxWidth && responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    },
    style,
  ];

  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});

