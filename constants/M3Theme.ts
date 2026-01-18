import { Platform } from 'react-native';

/**
 * Material Design 3 Theme System
 * Optimized for Mobile WebView
 */

// M3 Color System - Light Theme
export const M3Colors = {
  primary: '#6750A4', // M3 Primary Purple
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  
  secondary: '#625B71',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',
  
  tertiary: '#7D5260',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD8E4',
  onTertiaryContainer: '#31111D',
  
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  
  surface: '#FFFBFE',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  surfaceVariant: '#E7E0EC',
  onSurfaceVariant: '#49454F',
  
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  
  background: '#FFFBFE',
  onBackground: '#1C1B1F',
  
  // Status Colors (Tonal Palettes)
  success: {
    container: '#E8F5E9',
    onContainer: '#1B5E20',
  },
  warning: {
    container: '#FFF3E0',
    onContainer: '#E65100',
  },
  info: {
    container: '#E3F2FD',
    onContainer: '#0D47A1',
  },
  pending: {
    container: '#FFF9C4',
    onContainer: '#F57F17',
  },
  
  // Shadow for Elevated Cards
  shadow: 'rgba(0, 0, 0, 0.05)',
};

// M3 Typography Scale
export const M3Typography = {
  // Base font size: 14px minimum for WebView (prevents iOS auto-zoom)
  displayLarge: {
    fontSize: 57,
    fontWeight: '400' as const,
    lineHeight: 64,
    letterSpacing: -0.25,
  },
  displayMedium: {
    fontSize: 45,
    fontWeight: '400' as const,
    lineHeight: 52,
  },
  displaySmall: {
    fontSize: 36,
    fontWeight: '400' as const,
    lineHeight: 44,
  },
  headlineLarge: {
    fontSize: 32,
    fontWeight: '600' as const, // Semi-bold for headings
    lineHeight: 40,
  },
  headlineMedium: {
    fontSize: 28,
    fontWeight: '600' as const,
    lineHeight: 36,
  },
  headlineSmall: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 32,
  },
  titleLarge: {
    fontSize: 22,
    fontWeight: '500' as const,
    lineHeight: 28,
  },
  titleMedium: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
    letterSpacing: 0.15,
  },
  titleSmall: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  labelLarge: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    letterSpacing: 0.5,
  },
  bodyMedium: {
    fontSize: 14, // Base font size
    fontWeight: '400' as const,
    lineHeight: 20,
    letterSpacing: 0.25,
  },
  bodySmall: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
};

// M3 Spacing System
export const M3Spacing = {
  xs: 4,
  sm: 8,
  md: 16, // Primary padding for mobile-first
  lg: 24,
  xl: 32,
  xxl: 48,
};

// M3 Shape System
export const M3Shape = {
  cornerNone: 0,
  cornerExtraSmall: 4,
  cornerSmall: 8,
  cornerMedium: 12,
  cornerLarge: 16, // For cards
  cornerExtraLarge: 28,
  cornerFull: 9999,
};

// M3 Elevation System (for cards)
export const M3Elevation = {
  level0: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  level1: {
    // Subtle shadow for Elevated Cards
    shadowColor: M3Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  level2: {
    shadowColor: M3Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  level3: {
    shadowColor: M3Colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
};

// Touch Target Sizes (minimum 44x44px for WebView)
export const M3TouchTarget = {
  minimum: 44,
  comfortable: 48, // For primary buttons
  large: 56,
};

// M3 Button Variants
export const M3ButtonVariants = {
  filled: {
    backgroundColor: M3Colors.primary,
    color: M3Colors.onPrimary,
    minHeight: M3TouchTarget.comfortable,
    borderRadius: M3Shape.cornerLarge,
    paddingHorizontal: M3Spacing.lg,
    paddingVertical: M3Spacing.md,
  },
  tonal: {
    backgroundColor: M3Colors.primaryContainer,
    color: M3Colors.onPrimaryContainer,
    minHeight: M3TouchTarget.comfortable,
    borderRadius: M3Shape.cornerLarge,
    paddingHorizontal: M3Spacing.lg,
    paddingVertical: M3Spacing.md,
  },
  outlined: {
    backgroundColor: 'transparent',
    color: M3Colors.primary,
    borderWidth: 1,
    borderColor: M3Colors.outline,
    minHeight: M3TouchTarget.comfortable,
    borderRadius: M3Shape.cornerLarge,
    paddingHorizontal: M3Spacing.lg,
    paddingVertical: M3Spacing.md,
  },
  text: {
    backgroundColor: 'transparent',
    color: M3Colors.primary,
    minHeight: M3TouchTarget.comfortable,
    paddingHorizontal: M3Spacing.md,
    paddingVertical: M3Spacing.sm,
  },
};

// M3 Card Styles
export const M3CardStyles = {
  elevated: {
    backgroundColor: M3Colors.surface,
    borderRadius: M3Shape.cornerLarge, // 16px
    padding: M3Spacing.md, // 16px
    ...M3Elevation.level1,
  },
  filled: {
    backgroundColor: M3Colors.surfaceVariant,
    borderRadius: M3Shape.cornerLarge,
    padding: M3Spacing.md,
  },
  outlined: {
    backgroundColor: M3Colors.surface,
    borderRadius: M3Shape.cornerLarge,
    padding: M3Spacing.md,
    borderWidth: 1,
    borderColor: M3Colors.outlineVariant,
  },
};

// M3 Status Tag Styles (Tonal Palettes)
export const M3StatusStyles = {
  success: {
    backgroundColor: M3Colors.success.container,
    color: M3Colors.success.onContainer,
    paddingHorizontal: M3Spacing.sm,
    paddingVertical: M3Spacing.xs,
    borderRadius: M3Shape.cornerSmall,
  },
  warning: {
    backgroundColor: M3Colors.warning.container,
    color: M3Colors.warning.onContainer,
    paddingHorizontal: M3Spacing.sm,
    paddingVertical: M3Spacing.xs,
    borderRadius: M3Shape.cornerSmall,
  },
  error: {
    backgroundColor: M3Colors.errorContainer,
    color: M3Colors.onErrorContainer,
    paddingHorizontal: M3Spacing.sm,
    paddingVertical: M3Spacing.xs,
    borderRadius: M3Shape.cornerSmall,
  },
  info: {
    backgroundColor: M3Colors.info.container,
    color: M3Colors.info.onContainer,
    paddingHorizontal: M3Spacing.sm,
    paddingVertical: M3Spacing.xs,
    borderRadius: M3Shape.cornerSmall,
  },
  pending: {
    backgroundColor: M3Colors.pending.container,
    color: M3Colors.pending.onContainer,
    paddingHorizontal: M3Spacing.sm,
    paddingVertical: M3Spacing.xs,
    borderRadius: M3Shape.cornerSmall,
  },
};

// WebView-specific optimizations
export const M3WebViewStyles = Platform.OS === 'web' ? {
  // Disable text selection on buttons
  button: {
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    MozUserSelect: 'none' as const,
    msUserSelect: 'none' as const,
  },
  // Remove hover states for touch devices
  noHover: {
    ':hover': {
      opacity: 1,
    },
  },
} : {};

// Helper to get M3 shadow style (compatible with responsive.ts)
export const getM3Shadow = (level: keyof typeof M3Elevation = 'level1') => {
  if (Platform.OS === 'web') {
    const elevation = M3Elevation[level];
    return {
      boxShadow: `${elevation.shadowOffset.width}px ${elevation.shadowOffset.height}px ${elevation.shadowRadius}px ${elevation.shadowColor}`,
    };
  }
  return M3Elevation[level];
};

export default {
  colors: M3Colors,
  typography: M3Typography,
  spacing: M3Spacing,
  shape: M3Shape,
  elevation: M3Elevation,
  touchTarget: M3TouchTarget,
  buttonVariants: M3ButtonVariants,
  cardStyles: M3CardStyles,
  statusStyles: M3StatusStyles,
  webViewStyles: M3WebViewStyles,
};
