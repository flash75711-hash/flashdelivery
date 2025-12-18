import { Dimensions, Platform, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Breakpoints
export const BREAKPOINTS = {
  xs: 320,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
};

// Responsive width percentage
export const wp = (percentage: number): number => {
  return (SCREEN_WIDTH * percentage) / 100;
};

// Responsive height percentage
export const hp = (percentage: number): number => {
  return (SCREEN_HEIGHT * percentage) / 100;
};

// Responsive font size
export const rf = (size: number): number => {
  const scale = SCREEN_WIDTH / 320; // Base width
  const newSize = size * scale;
  
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  }
  return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
};

// Check if device is tablet
export const isTablet = (): boolean => {
  return SCREEN_WIDTH >= BREAKPOINTS.md;
};

// Check if device is small screen
export const isSmallScreen = (): boolean => {
  return SCREEN_WIDTH < BREAKPOINTS.sm;
};

// Check if device is large screen
export const isLargeScreen = (): boolean => {
  return SCREEN_WIDTH >= BREAKPOINTS.lg;
};

// Get responsive padding
export const getResponsivePadding = (): number => {
  if (isLargeScreen()) {
    return 32;
  } else if (isTablet()) {
    return 24;
  } else {
    return 20;
  }
};

// Get responsive font size
export const getResponsiveFontSize = (baseSize: number): number => {
  if (isLargeScreen()) {
    return baseSize * 1.2;
  } else if (isTablet()) {
    return baseSize * 1.1;
  } else if (isSmallScreen()) {
    return baseSize * 0.9;
  }
  return baseSize;
};

// Get max content width for large screens
export const getMaxContentWidth = (): number => {
  if (isLargeScreen()) {
    return BREAKPOINTS.xl;
  }
  return SCREEN_WIDTH;
};

// Responsive card width
export const getCardWidth = (columns: number = 1): number => {
  const padding = getResponsivePadding() * 2;
  const gap = 16 * (columns - 1);
  return (SCREEN_WIDTH - padding - gap) / columns;
};

// Get bottom padding to avoid tab bar overlap
export const getTabBarBottomPadding = (): number => {
  const tabBarHeight = isTablet() ? 75 : 70;
  return tabBarHeight + 10; // Add extra 10px for safe spacing
};

export default {
  wp,
  hp,
  rf,
  isTablet,
  isSmallScreen,
  isLargeScreen,
  getResponsivePadding,
  getResponsiveFontSize,
  getMaxContentWidth,
  getCardWidth,
  getTabBarBottomPadding,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  BREAKPOINTS,
};

