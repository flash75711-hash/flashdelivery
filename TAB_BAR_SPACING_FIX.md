# إصلاح المسافات مع شريط التنقل

## المشكلة:
المحتوى في بعض الشاشات يتداخل مع شريط التنقل في الأسفل.

## الحل:
إضافة `paddingBottom` للشاشات على الويب لتجنب التداخل.

## التغييرات المطلوبة لكل شاشة:

1. إضافة import:
```typescript
import { Platform } from 'react-native';
import responsive from '@/utils/responsive';
```

2. تحويل `StyleSheet.create` إلى `getStyles` function:
```typescript
const getStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0,
  },
  // ... باقي الـ styles
});

const styles = getStyles();
```

3. استخدام `styles` في الـ component:
```typescript
const styles = getStyles();
```

4. تحديث جميع `fontSize` و `padding` و `margin` لاستخدام responsive utilities.

## الشاشات المحدثة:
- ✅ customer/home.tsx
- ✅ driver/dashboard.tsx
- ✅ driver/wallet.tsx
- ✅ admin/dashboard.tsx
- ✅ admin/drivers.tsx

## الشاشات المتبقية:
- ⏳ customer/orders.tsx
- ⏳ customer/profile.tsx
- ⏳ driver/trips.tsx
- ⏳ driver/history.tsx
- ⏳ admin/orders.tsx
- ⏳ admin/accounting.tsx
- ⏳ admin/places.tsx
- ⏳ vendor/store.tsx
- ⏳ vendor/profile.tsx
