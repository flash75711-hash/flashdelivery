# Web-Only Migration Guide

## ✅ تم إنجازه

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
- ✅ توحيد جميع الإشعارات باستخدام SweetAlert2
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

## 🔄 المطلوب تحديثه

### الملفات التي تحتاج تحديث:

1. **`components/CurrentLocationDisplay.tsx`**
   - استبدال `expo-location` بـ `lib/webLocationUtils`

2. **`app/(tabs)/driver/trips.tsx`**
   - استبدال `expo-location` بـ `lib/webLocationUtils`

3. **`app/(tabs)/driver/dashboard.tsx`**
   - استبدال `expo-location` بـ `lib/webLocationUtils`

4. **`app/customer/places-directory.tsx`**
   - استبدال `expo-location` بـ `lib/webLocationUtils`
   - استبدال `react-native-maps` بـ Google Maps iframe (أو Leaflet)

5. **`app/(tabs)/customer/profile.tsx`**
   - استبدال `expo-image-picker` بـ `lib/webUtils.pickImage()`

6. **`app/orders/deliver-package.tsx`**
   - استبدال `expo-location` بـ `lib/webLocationUtils`

7. **`app/orders/outside-order.tsx`**
   - استبدال `expo-location` بـ `lib/webLocationUtils`

8. **`app/(auth)/complete-registration/customer.tsx`**
   - استبدال `expo-image-picker` بـ `lib/webUtils.pickImage()`

9. **`app/(auth)/complete-registration/driver.tsx`**
   - استبدال `expo-image-picker` بـ `lib/webUtils.pickImage()`

10. **`app/(auth)/complete-registration/vendor.tsx`**
    - استبدال `expo-image-picker` بـ `lib/webUtils.pickImage()`

11. **`app/(tabs)/admin/places.tsx`**
    - استبدال `expo-location` بـ `lib/webLocationUtils`

## 📝 مثال على التحديث

### قبل (expo-location):
```typescript
import * as Location from 'expo-location';

const { status } = await Location.requestForegroundPermissionsAsync();
const location = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.Highest,
});
```

### بعد (Web APIs):
```typescript
import { requestLocationPermission, getCurrentLocation } from '@/lib/webUtils';

const hasPermission = await requestLocationPermission();
const location = await getCurrentLocation({
  enableHighAccuracy: true,
  timeout: 10000,
});
```

### قبل (expo-image-picker):
```typescript
import * as ImagePicker from 'expo-image-picker';

const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
});
```

### بعد (Web APIs):
```typescript
import { pickImage } from '@/lib/webUtils';

const images = await pickImage({
  multiple: false,
  accept: 'image/*',
  maxSize: 5 * 1024 * 1024, // 5MB
});
```

## 🚀 الخطوات التالية

1. تحديث جميع الملفات المذكورة أعلاه
2. إزالة `usePushNotifications` من أي مكان
3. تنظيف `package.json` من Expo dependencies
4. تحديث `app.json` لإزالة Expo plugins
5. اختبار جميع الوظائف على الويب

## 📦 Dependencies المطلوب إزالتها

من `package.json`:
- `expo-location`
- `expo-image-picker`
- `expo-linking`
- `expo-web-browser`
- `expo-notifications`
- `expo-device`
- `expo-file-system`
- `expo-constants`
- `expo-crypto`
- `expo-auth-session`
- `expo-secure-store`
- `expo-localization`
- `expo-status-bar`
- `expo-image-manipulator`
- `expo-font`
- `@react-native-async-storage/async-storage` (استخدام localStorage مباشرة)

## ✅ Dependencies المطلوب الاحتفاظ بها

- `@supabase/supabase-js` - Supabase client
- `sweetalert2` - للإشعارات
- `react` / `react-dom` - React core
- `react-native-web` - للـ React Native components على الويب
- `expo-router` - للتنقل (يمكن استبداله لاحقاً بـ React Router)
- `@expo/vector-icons` - للأيقونات (يعمل على الويب)

## 🔍 WebView Detection

استخدام `isWebView()` من `lib/webUtils.ts`:

```typescript
import { isWebView } from '@/lib/webUtils';

if (isWebView()) {
  console.log('Running inside WebView');
  // يمكن إضافة منطق خاص للـ WebView
}
```

