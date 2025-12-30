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

// Get responsive header padding (أقل من padding العادي)
export const getResponsiveHeaderPadding = (): number => {
  if (isLargeScreen()) {
    return 16;
  } else if (isTablet()) {
    return 12;
  } else {
    return 10;
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

// Shadow utility to convert shadow properties to boxShadow on web
// This eliminates the deprecation warning for shadow* props
export interface ShadowOptions {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number; // For Android
}

// Helper to convert hex color to rgba
const hexToRgba = (hex: string, opacity: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  // If already rgba or invalid, return as is
  return hex.includes('rgba') ? hex : `rgba(0, 0, 0, ${opacity})`;
};

export const createShadowStyle = (options: ShadowOptions) => {
  if (Platform.OS === 'web') {
    // Convert to CSS boxShadow for web
    const {
      shadowColor = '#000',
      shadowOffset = { width: 0, height: 2 },
      shadowOpacity = 0.1,
      shadowRadius = 8,
    } = options;

    // Convert color to rgba
    const rgbaColor = hexToRgba(shadowColor, shadowOpacity);

    const boxShadow = `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px ${rgbaColor}`;
    
    return {
      boxShadow,
    };
  } else {
    // Use native shadow properties for iOS/Android
    return {
      shadowColor: options.shadowColor || '#000',
      shadowOffset: options.shadowOffset || { width: 0, height: 2 },
      shadowOpacity: options.shadowOpacity ?? 0.1,
      shadowRadius: options.shadowRadius ?? 8,
      ...(Platform.OS === 'android' && options.elevation !== undefined && { elevation: options.elevation }),
    };
  }
};

export default {
  wp,
  hp,
  rf,
  isTablet,
  isSmallScreen,
  isLargeScreen,
  getResponsivePadding,
  getResponsiveHeaderPadding,
  getResponsiveFontSize,
  getMaxContentWidth,
  getCardWidth,
  getTabBarBottomPadding,
  createShadowStyle,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  BREAKPOINTS,
};

