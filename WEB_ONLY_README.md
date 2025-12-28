# Flash Delivery - Web-Only Application

## 🎯 الهدف

تحويل المشروع إلى **React Web فقط** بدون أي اعتماد على Expo أو Native Code، ليكون **Single Source of Truth** يمكن لفه لاحقاً داخل WebView App.

## ✅ ما تم إنجازه

### 1. Web APIs Utilities (`lib/webUtils.ts`)
- ✅ `isWebView()` - للتحقق من WebView
- ✅ `getCurrentLocation()` - استخدام `navigator.geolocation`
- ✅ `requestLocationPermission()` - طلب إذن الموقع
- ✅ `watchPosition()` / `clearWatch()` - مراقبة الموقع
- ✅ `pickImage()` - اختيار الصور باستخدام HTML file input
- ✅ `openURL()` / `openBrowserAsync()` - فتح الروابط
- ✅ `checkWebAPISupport()` - التحقق من دعم Web APIs

### 2. Web Location Utilities (`lib/webLocationUtils.ts`)
- ✅ استبدال `expo-location` بـ `navigator.geolocation`
- ✅ `getLocationWithHighAccuracy()` - جلب الموقع بدقة عالية
- ✅ `getLocationWithAddress()` - جلب الموقع مع العنوان
- ✅ `findNearestPlaceInDirectory()` - البحث في دليل الأماكن

### 3. Alert System (`lib/alert.ts`)
- ✅ توحيد جميع الإشعارات باستخدام **SweetAlert2**
- ✅ `showToast()` - للإشعارات السريعة (Toast)
- ✅ `showAlert()` - للتنبيهات
- ✅ `showSimpleAlert()` - للتنبيهات البسيطة
- ✅ `showConfirm()` - لرسائل التأكيد

### 4. Image Upload (`lib/imgbb.ts`)
- ✅ استبدال `expo-file-system` بـ Web APIs
- ✅ دعم `File` objects و `blob:` URLs و `data:` URLs
- ✅ تحويل الصور إلى base64 باستخدام Web APIs

### 5. Supabase Client (`lib/supabase.ts`)
- ✅ إزالة `expo-web-browser`
- ✅ إزالة `expo-linking`
- ✅ استخدام `localStorage` تلقائياً (Web default)

### 6. Components
- ✅ `CurrentLocationDisplay.tsx` - محدث لاستخدام Web APIs

## 📋 الملفات المحدثة

- ✅ `lib/webUtils.ts` - Web APIs utilities
- ✅ `lib/webLocationUtils.ts` - Location utilities للويب
- ✅ `lib/alert.ts` - SweetAlert2 فقط
- ✅ `lib/imgbb.ts` - Web APIs للصور
- ✅ `lib/supabase.ts` - بدون Expo dependencies
- ✅ `components/CurrentLocationDisplay.tsx` - محدث

## 🔄 الملفات التي تحتاج تحديث

راجع `WEB_ONLY_MIGRATION.md` للقائمة الكاملة.

## 🚀 الاستخدام

### Location
```typescript
import { getCurrentLocation, requestLocationPermission } from '@/lib/webUtils';

const hasPermission = await requestLocationPermission();
const location = await getCurrentLocation({
  enableHighAccuracy: true,
  timeout: 10000,
});
```

### Image Picker
```typescript
import { pickImage } from '@/lib/webUtils';

const images = await pickImage({
  multiple: false,
  accept: 'image/*',
  maxSize: 5 * 1024 * 1024, // 5MB
});
```

### Notifications (Toast)
```typescript
import { showToast } from '@/lib/alert';

showToast('تم الحفظ بنجاح', 'success');
showToast('حدث خطأ', 'error');
```

### WebView Detection
```typescript
import { isWebView } from '@/lib/webUtils';

if (isWebView()) {
  console.log('Running inside WebView');
}
```

## 📦 Dependencies

### المطلوب الاحتفاظ بها:
- `@supabase/supabase-js` - Supabase client
- `sweetalert2` - للإشعارات
- `react` / `react-dom` - React core
- `react-native-web` - للـ React Native components على الويب
- `expo-router` - للتنقل (يمكن استبداله لاحقاً)
- `@expo/vector-icons` - للأيقونات

### يمكن إزالتها (لاحقاً):
- جميع `expo-*` packages (باستثناء `expo-router` و `@expo/vector-icons`)
- `@react-native-async-storage/async-storage` (استخدام localStorage مباشرة)

## 🔍 WebView Detection

المشروع جاهز للعمل داخل WebView. استخدم `isWebView()` للتحقق:

```typescript
import { isWebView } from '@/lib/webUtils';

if (isWebView()) {
  // منطق خاص للـ WebView
}
```

## 📝 ملاحظات

1. **Supabase Realtime**: يعمل على الويب تلقائياً للإشعارات الداخلية
2. **SweetAlert2**: جميع الإشعارات موحدة باستخدام Toast
3. **Web APIs**: الموقع والكاميرا يعملان باستخدام Web APIs فقط
4. **WebView Ready**: المشروع جاهز للف داخل WebView بدون تعديلات

## 🎯 الخطوات التالية

1. تحديث باقي الملفات المذكورة في `WEB_ONLY_MIGRATION.md`
2. إزالة Expo dependencies من `package.json`
3. اختبار جميع الوظائف على الويب
4. إضافة WebView detection في الأماكن المناسبة

