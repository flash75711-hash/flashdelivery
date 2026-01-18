# Material Design 3 (M3) Refactoring Guide

This document outlines the systematic refactoring to Material Design 3 principles, optimized for Mobile WebView.

## ✅ Completed

1. **M3 Theme System** (`constants/M3Theme.ts`)
   - Complete color palette with tonal variants
   - Typography scale (14px base, 16px inputs)
   - Spacing system (16px mobile-first)
   - Elevation system for cards
   - Touch target sizes (44x44px minimum)

2. **Global Styles** (`app/_layout.tsx`)
   - 16px horizontal padding enforced
   - 14px base font, 16px inputs (prevents iOS auto-zoom)
   - No hover states for touch devices
   - user-select: none on buttons
   - 44x44px minimum touch targets

3. **Responsive Utilities** (`utils/responsive.ts`)
   - `getM3HorizontalPadding()` - 16px padding
   - `getM3ButtonStyle()` - 48px min height for primary buttons
   - `getM3CardStyle()` - Elevated card with 16px radius/padding
   - `getM3TouchTarget()` - Minimum 44x44px touch targets

4. **Colors** (`constants/Colors.ts`)
   - Updated with M3 color palette
   - Backward compatible with legacy colors

## 📋 Refactoring Checklist

### Layout & Grid
- [ ] Replace all containers with 16px horizontal padding
- [ ] Ensure no horizontal scroll (use `overflow-x: hidden` in parent containers)
- [ ] Use mobile-first approach in all layouts

### Cards
- [ ] Replace container blocks with M3 Elevated Cards:
  ```typescript
  {
    backgroundColor: '#FFFBFE', // M3 Surface
    borderRadius: 16,
    padding: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 1,
    }),
  }
  ```
- [ ] Remove heavy shadows, use subtle `0 2px 8px rgba(0,0,0,0.05)`

### Buttons
- [ ] Primary actions: Use `getM3ButtonStyle(true)` for full-width
- [ ] All buttons: Minimum 48px height (comfortable) or 44px (minimum)
- [ ] Apply M3 button variants:
  - **Filled**: Primary actions (Accept, Submit)
  - **Tonal**: Secondary actions (Negotiate, Info)
  - **Outlined**: Cancel, Reject
  - **Text**: Links, subtle actions

### Status Tags
- [ ] Use M3 tonal palettes from `M3StatusStyles`:
  ```typescript
  // Success
  backgroundColor: '#E8F5E9', color: '#1B5E20'
  // Warning
  backgroundColor: '#FFF3E0', color: '#E65100'
  // Error
  backgroundColor: '#FFDAD6', color: '#410002'
  // Info
  backgroundColor: '#E3F2FD', color: '#0D47A1'
  // Pending
  backgroundColor: '#FFF9C4', color: '#F57F17'
  ```

### Typography
- [ ] Headings: Use `M3Typography.headline*` with `fontWeight: '600'`
- [ ] Body: Use `M3Typography.bodyMedium` (14px) or `bodyLarge` (16px)
- [ ] Labels: Use `M3Typography.labelLarge` (14px, weight 600)
- [ ] Ensure 16px minimum for all input fields

### Navigation
- [ ] Active indicators: Add rounded pill background behind active tab icons
- [ ] Ensure 44x44px touch targets for tab items
- [ ] Good contrast between active/inactive states

### WebView Optimizations
- [ ] Remove all `:hover` styles (use `@media (hover: none)`)
- [ ] Add `user-select: none` to all buttons via global CSS
- [ ] Ensure all interactive elements are 44x44px minimum
- [ ] Test on iOS WebView to prevent auto-zoom (16px inputs)

## 🔄 Component Update Pattern

### Example: Card Component
```typescript
// BEFORE
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...createShadowStyle({ /* heavy shadow */ }),
  },
});

// AFTER (M3)
import { getM3CardStyle, getM3HorizontalPadding } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';

const styles = StyleSheet.create({
  card: {
    ...getM3CardStyle(), // Includes 16px radius, 16px padding, subtle shadow
    backgroundColor: M3Theme.colors.surface, // #FFFBFE
    marginBottom: 16,
  },
});
```

### Example: Button Component
```typescript
// BEFORE
const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
});

// AFTER (M3)
import { getM3ButtonStyle } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';

const styles = StyleSheet.create({
  button: {
    ...getM3ButtonStyle(true), // Full-width, 48px min height
    backgroundColor: M3Theme.colors.primary, // #6750A4
    borderRadius: 16, // M3 corner large
    ...Platform.select({
      web: M3Theme.webViewStyles.button, // user-select: none
    }),
  },
  buttonText: {
    ...M3Theme.typography.labelLarge, // 14px, weight 600
    color: M3Theme.colors.onPrimary, // #FFFFFF
  },
});
```

### Example: Status Badge
```typescript
// BEFORE
const styles = StyleSheet.create({
  statusBadge: {
    backgroundColor: '#34C759',
    color: '#fff',
    padding: 8,
    borderRadius: 12,
  },
});

// AFTER (M3 - Tonal Palette)
import M3Theme from '@/constants/M3Theme';

const styles = StyleSheet.create({
  statusBadge: {
    ...M3Theme.statusStyles.success, // Light green background, dark green text
    // OR use directly:
    // backgroundColor: '#E8F5E9',
    // color: '#1B5E20',
    // paddingHorizontal: 8,
    // paddingVertical: 4,
    // borderRadius: 8,
  },
});
```

## 📁 Files to Update (Priority Order)

### High Priority (Core Components)
1. `components/OrderCard.tsx` - Cards, buttons, status badges
2. `components/FloatingNotification.tsx` - Cards, typography
3. `app/(tabs)/_layout.tsx` - Navigation active indicators ✅ (partially done)
4. `app/(auth)/login.tsx` - Buttons, inputs, layout
5. `app/(auth)/register.tsx` - Buttons, inputs, layout

### Medium Priority (Screens)
6. `app/(tabs)/driver/dashboard.tsx` - Cards, buttons, layout
7. `app/(tabs)/driver/wallet.tsx` - Cards, buttons, status tags
8. `app/(tabs)/customer/home.tsx` - Cards, buttons
9. `app/(tabs)/admin/dashboard.tsx` - Cards, layout

### Lower Priority (Remaining Screens)
10-40. All other screen files in `app/(tabs)/*`

## 🎯 M3 Import Pattern

```typescript
// Standard imports for M3 refactoring
import M3Theme from '@/constants/M3Theme';
import { 
  getM3CardStyle, 
  getM3ButtonStyle, 
  getM3HorizontalPadding,
  getM3TouchTarget 
} from '@/utils/responsive';
import { Platform } from 'react-native';

// Use in styles
const styles = StyleSheet.create({
  // Cards
  card: {
    ...getM3CardStyle(),
    backgroundColor: M3Theme.colors.surface,
  },
  
  // Buttons
  primaryButton: {
    ...getM3ButtonStyle(true), // full-width
    backgroundColor: M3Theme.colors.primary,
    borderRadius: 16,
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  
  // Typography
  title: {
    ...M3Theme.typography.headlineMedium, // 28px, weight 600
    color: M3Theme.colors.onSurface,
  },
  
  // Status
  successBadge: {
    ...M3Theme.statusStyles.success,
  },
});
```

## ⚠️ Breaking Changes & Compatibility

- **Colors**: Legacy colors in `Colors.light` are preserved for backward compatibility
- **Spacing**: Old `getResponsivePadding()` still returns values, but prefer `getM3HorizontalPadding()` for new code
- **Typography**: Font sizes remain similar (14-16px base), but use M3 typography scale for consistency

## 🧪 Testing Checklist

- [ ] Test on iOS WebView (16px inputs prevent auto-zoom)
- [ ] Verify no horizontal scroll on any screen
- [ ] Check touch targets (44x44px minimum)
- [ ] Verify no hover effects on touch devices
- [ ] Test button text selection (should be disabled)
- [ ] Verify card shadows are subtle (not heavy)
- [ ] Check status tag contrast (light background, dark text)

## 📚 M3 Resources

- [Material Design 3 Specification](https://m3.material.io/)
- [M3 Color System](https://m3.material.io/styles/color/the-color-system/overview)
- [M3 Typography](https://m3.material.io/styles/typography/overview)
- [Touch Targets](https://m3.material.io/foundations/accessible-design/accessibility-basics#touch-target-size)
