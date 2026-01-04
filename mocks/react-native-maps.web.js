import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Mock MapView component for web
const MapView = (props) => {
  console.warn('MapView is not supported on web. Using a mock component.');
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Map is not available on web</Text>
    </View>
  );
};

// Mock Marker component for web
const Marker = (props) => {
  console.warn('Marker is not supported on web. Using a mock component.');
  return null; // Markers are typically rendered within MapView, so a simple null is fine
};

const Polyline = (props) => {
  console.warn('Polyline is not supported on web. Using a mock component.');
  return null;
};

const Polygon = (props) => {
  console.warn('Polygon is not supported on web. Using a mock component.');
  return null;
};

const Circle = (props) => {
  console.warn('Circle is not supported on web. Using a mock component.');
  return null;
};

const ProviderConstants = {};

const AnimatedRegion = class AnimatedRegion {};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
});

export default MapView;
export { Marker, Polyline, Polygon, Circle, ProviderConstants, AnimatedRegion };















