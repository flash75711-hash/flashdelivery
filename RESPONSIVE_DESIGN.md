# 📱 Responsive Design Guide

## ✅ ما تم إضافته:

1. **`utils/responsive.ts`** - ملف utility للتصميم المتجاوب
2. **`components/ResponsiveContainer.tsx`** - Component wrapper للـ responsive
3. تحديث بعض الملفات الرئيسية كمثال

---

## 🚀 كيفية الاستخدام:

### 1. استيراد الـ utilities:

```typescript
import responsive from '@/utils/responsive';
```

### 2. استخدام في الـ styles:

```typescript
const styles = StyleSheet.create({
  container: {
    padding: responsive.getResponsivePadding(), // 20/24/32 حسب حجم الشاشة
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28), // يتكيف تلقائياً
  },
  header: {
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(), // 1280px للشاشات الكبيرة
      alignSelf: 'center',
      width: '100%',
    }),
  },
});
```

### 3. استخدام الـ wrapper component:

```typescript
import ResponsiveContainer from '@/components/ResponsiveContainer';

<ResponsiveContainer maxWidth={true}>
  {/* محتوى الصفحة */}
</ResponsiveContainer>
```

---

## 📐 Breakpoints:

- **xs**: < 320px (شاشات صغيرة جداً)
- **sm**: 480px (هواتف)
- **md**: 768px (tablets)
- **lg**: 1024px (شاشات كبيرة)
- **xl**: 1280px (شاشات كبيرة جداً)

---

## 🎯 Functions المتاحة:

- `responsive.wp(percentage)` - عرض بنسبة مئوية
- `responsive.hp(percentage)` - ارتفاع بنسبة مئوية
- `responsive.rf(size)` - حجم خط متجاوب
- `responsive.isTablet()` - هل الجهاز tablet؟
- `responsive.isSmallScreen()` - هل الشاشة صغيرة؟
- `responsive.isLargeScreen()` - هل الشاشة كبيرة؟
- `responsive.getResponsivePadding()` - padding متجاوب
- `responsive.getResponsiveFontSize(size)` - حجم خط متجاوب
- `responsive.getMaxContentWidth()` - أقصى عرض للمحتوى (1280px)
- `responsive.getCardWidth(columns)` - عرض card متجاوب

---

## 📝 مثال كامل:

```typescript
import responsive from '@/utils/responsive';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: responsive.getResponsivePadding(),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
  },
  card: {
    padding: responsive.isTablet() ? 32 : 24,
    ...(responsive.isLargeScreen() && {
      maxWidth: 600,
      alignSelf: 'center',
    }),
  },
});
```

---

## ✅ الملفات المحدثة:

- ✅ `app/(tabs)/_layout.tsx` - Bottom nav bar متجاوب
- ✅ `app/(tabs)/customer/home.tsx` - مثال
- ✅ `app/(tabs)/driver/dashboard.tsx` - مثال
- ✅ `app/(tabs)/admin/drivers.tsx` - مثال
- ✅ `app/(auth)/login.tsx` - مثال

---

## 📋 باقي الملفات التي تحتاج تحديث:

يمكنك تحديث باقي الملفات بنفس الطريقة:

1. استيراد `responsive` من `@/utils/responsive`
2. استبدال `padding: 20` بـ `padding: responsive.getResponsivePadding()`
3. استبدال `fontSize: 28` بـ `fontSize: responsive.getResponsiveFontSize(28)`
4. إضافة `maxWidth` للشاشات الكبيرة

---

## 🎨 CSS للويب (يتم تطبيقه تلقائياً):

- الشاشات الكبيرة (> 1024px): max-width 1280px و centered
- الـ bottom nav bar متجاوب مع حجم الشاشة
- الأيقونات والنصوص تتكيف تلقائياً

