# M3 Quick Update Guide - Common Patterns

استخدم هذه الأنماط لتحديث أي صفحة بسرعة:

## 1. Imports الأساسية
```typescript
import responsive, { getM3CardStyle, getM3ButtonStyle, getM3HorizontalPadding, getM3TouchTarget } from '@/utils/responsive';
import M3Theme from '@/constants/M3Theme';
import { Platform } from 'react-native'; // إذا لم يكن موجوداً
```

## 2. Container & Background
```typescript
container: {
  flex: 1,
  backgroundColor: M3Theme.colors.background, // #FFFBFE
  paddingBottom: tabBarBottomPadding,
},
```

## 3. Header
```typescript
header: {
  backgroundColor: Platform.OS === 'web' ? 'rgba(255, 251, 254, 0.95)' : M3Theme.colors.surface,
  padding: responsive.getResponsiveHeaderPadding(),
  borderBottomWidth: 1,
  borderBottomColor: M3Theme.colors.outlineVariant, // #CAC4D0
},
title: {
  ...M3Theme.typography.headlineMedium, // 28px, weight 600
  color: M3Theme.colors.onSurface,
  textAlign: 'right',
},
```

## 4. Content Padding
```typescript
content: {
  padding: getM3HorizontalPadding(), // 16px
  paddingBottom: getM3HorizontalPadding() + 20,
},
```

## 5. Cards (Elevated)
```typescript
card: {
  ...getM3CardStyle(), // 16px radius, 16px padding, subtle shadow
  backgroundColor: M3Theme.colors.surface,
  marginBottom: 16,
},
```

## 6. Buttons (Primary/Filled)
```typescript
primaryButton: {
  ...getM3ButtonStyle(true), // Full-width, 48px min height
  backgroundColor: M3Theme.colors.primary, // #6750A4
  borderRadius: M3Theme.shape.cornerLarge, // 16px
  ...Platform.select({
    web: M3Theme.webViewStyles.button, // user-select: none
  }),
},
primaryButtonText: {
  ...M3Theme.typography.labelLarge, // 14px, weight 600
  color: M3Theme.colors.onPrimary, // #FFFFFF
},
```

## 7. Buttons (Outlined)
```typescript
outlinedButton: {
  ...M3Theme.buttonVariants.outlined,
  backgroundColor: M3Theme.colors.surface,
  borderColor: M3Theme.colors.primary,
  ...getM3TouchTarget('comfortable'), // 48px
  ...Platform.select({
    web: M3Theme.webViewStyles.button,
  }),
},
outlinedButtonText: {
  ...M3Theme.typography.labelLarge,
  color: M3Theme.colors.primary,
},
```

## 8. Input Fields
```typescript
input: {
  backgroundColor: M3Theme.colors.surfaceVariant, // #E7E0EC
  borderRadius: M3Theme.shape.cornerMedium, // 12px
  padding: M3Theme.spacing.md, // 16px
  fontSize: 16, // M3: 16px minimum (prevents iOS auto-zoom)
  borderWidth: 1,
  borderColor: M3Theme.colors.outlineVariant,
},
```

## 9. Status Badges (Tonal Palettes)
```typescript
// Success
successBadge: {
  ...M3Theme.statusStyles.success, // Light green bg, dark green text
},
// Error
errorBadge: {
  ...M3Theme.statusStyles.error, // Light red bg, dark red text
},
// Warning
warningBadge: {
  ...M3Theme.statusStyles.warning, // Light orange bg, dark orange text
},
// Info
infoBadge: {
  ...M3Theme.statusStyles.info, // Light blue bg, dark blue text
},
// Pending
pendingBadge: {
  ...M3Theme.statusStyles.pending, // Light yellow bg, dark yellow text
},
```

## 10. Typography
```typescript
// Headings
largeTitle: {
  ...M3Theme.typography.headlineLarge, // 32px, weight 600
},
mediumTitle: {
  ...M3Theme.typography.headlineMedium, // 28px, weight 600
},
smallTitle: {
  ...M3Theme.typography.titleLarge, // 22px, weight 500
},

// Body Text
bodyText: {
  ...M3Theme.typography.bodyMedium, // 14px base font
  color: M3Theme.colors.onSurfaceVariant,
},
largeBodyText: {
  ...M3Theme.typography.bodyLarge, // 16px
},

// Labels
label: {
  ...M3Theme.typography.labelLarge, // 14px, weight 600
},
```

## 11. List/Order Cards
```typescript
orderCard: {
  ...getM3CardStyle(), // M3 Elevated Card
  backgroundColor: M3Theme.colors.surface,
  marginBottom: 16,
},
```

## 12. Touch Targets (Links/Icon Buttons)
```typescript
iconButton: {
  padding: M3Theme.spacing.xs, // 4px
  ...getM3TouchTarget('minimum'), // 44x44px minimum
  ...Platform.select({
    web: M3Theme.webViewStyles.button,
  }),
},
```

## مثال كامل لصفحة:
```typescript
const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  // 1. Container
  container: {
    flex: 1,
    backgroundColor: M3Theme.colors.background,
    paddingBottom: tabBarBottomPadding,
  },
  
  // 2. Header
  header: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 251, 254, 0.95)' : M3Theme.colors.surface,
    padding: responsive.getResponsiveHeaderPadding(),
    borderBottomWidth: 1,
    borderBottomColor: M3Theme.colors.outlineVariant,
  },
  title: {
    ...M3Theme.typography.headlineMedium,
    color: M3Theme.colors.onSurface,
    textAlign: 'right',
  },
  
  // 3. Content
  content: {
    padding: getM3HorizontalPadding(), // 16px
  },
  
  // 4. Card
  card: {
    ...getM3CardStyle(),
    backgroundColor: M3Theme.colors.surface,
    marginBottom: 16,
  },
  
  // 5. Button
  button: {
    ...getM3ButtonStyle(true), // Full-width
    backgroundColor: M3Theme.colors.primary,
    borderRadius: M3Theme.shape.cornerLarge,
    ...Platform.select({
      web: M3Theme.webViewStyles.button,
    }),
  },
  buttonText: {
    ...M3Theme.typography.labelLarge,
    color: M3Theme.colors.onPrimary,
  },
});
```

## Checklist سريع:
- [ ] استيراد M3Theme و getM3CardStyle, getM3ButtonStyle
- [ ] استبدال backgroundColor → M3Theme.colors.surface/background
- [ ] استبدال borderRadius → M3Theme.shape.cornerLarge (16px)
- [ ] استبدال padding → getM3HorizontalPadding() (16px) أو M3Theme.spacing.md
- [ ] استبدال Cards → getM3CardStyle()
- [ ] استبدال Buttons → getM3ButtonStyle(true) للـ full-width
- [ ] استبدال Typography → M3Theme.typography.*
- [ ] استبدال Status badges → M3Theme.statusStyles.*
- [ ] إضافة getM3TouchTarget('minimum') للأزرار الصغيرة
- [ ] إضافة Platform.select({ web: M3Theme.webViewStyles.button })
