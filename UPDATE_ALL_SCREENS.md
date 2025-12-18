# تحديث جميع الشاشات - Responsive Design + Tab Bar Padding

## الملفات المحدثة:
- ✅ customer/home.tsx
- ✅ customer/orders.tsx
- ✅ customer/profile.tsx (قيد التحديث)
- ✅ driver/dashboard.tsx
- ✅ driver/wallet.tsx
- ✅ driver/trips.tsx (قيد التحديث)
- ⏳ driver/history.tsx
- ✅ admin/dashboard.tsx
- ✅ admin/drivers.tsx
- ⏳ admin/orders.tsx
- ⏳ admin/accounting.tsx
- ⏳ admin/places.tsx
- ⏳ vendor/store.tsx
- ⏳ vendor/profile.tsx

## التغييرات المطلوبة لكل ملف:

1. إضافة imports:
```typescript
import { Platform } from 'react-native';
import responsive from '@/utils/responsive';
```

2. في الـ component:
```typescript
const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
const styles = getStyles(tabBarBottomPadding);
```

3. تحويل StyleSheet:
```typescript
const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: tabBarBottomPadding,
  },
  header: {
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
  },
  // ... باقي الـ styles
});
```
