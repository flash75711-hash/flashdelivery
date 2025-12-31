# 📋 ملخص المشروع - Flash Delivery

## 🎯 نوع المشروع
**تطبيق توصيل شامل** (Delivery App) - منصة متعددة الأدوار لإدارة طلبات التوصيل

---

## 💻 التقنيات المستخدمة

### Frontend Framework
- **React Native** `0.81.5` - إطار العمل الأساسي
- **React** `19.1.0` - مكتبة UI
- **React DOM** `19.1.0` - للويب
- **React Native Web** `0.21.2` - لتشغيل React Native على الويب

### Development Platform
- **Expo** `^54.0.30` - منصة التطوير والبناء
- **Expo Router** `~6.0.21` - نظام التنقل (File-based routing)

### Language
- **TypeScript** `~5.9.2` - لغة البرمجة الرئيسية

### Backend & Database
- **Supabase** - Backend as a Service
  - Authentication (المصادقة)
  - PostgreSQL Database (قاعدة البيانات)
  - Realtime Subscriptions (التحديثات الفورية)
  - Row Level Security (RLS) - الأمان على مستوى الصفوف

### Navigation
- **React Navigation** `^7.1.8` - نظام التنقل
  - `@react-navigation/bottom-tabs` - التبويبات السفلية
  - `@react-navigation/stack` - التنقل المكدس

### Authentication
- **PIN-based Authentication** - نظام المصادقة بالـ PIN (6 أرقام)
- **bcryptjs** `^3.0.3` - تشفير PIN
- **Supabase Auth** - إدارة المستخدمين

### UI/UX Libraries
- **SweetAlert2** `^11.26.17` - الإشعارات والتنبيهات
- **@expo/vector-icons** - الأيقونات
- **react-native-vector-icons** - أيقونات إضافية

### Internationalization
- **i18next** `^23.7.16` - نظام الترجمة
- **react-i18next** `^14.0.0` - React integration

### Location Services
- **navigator.geolocation** (Web API) - تتبع الموقع
- **react-native-maps** `1.20.1` - الخرائط (مع mock للويب)

### Storage
- **@react-native-async-storage/async-storage** - التخزين المحلي
- **localStorage** (Web) - للتخزين على الويب

### Other Libraries
- **react-native-reanimated** - Animations
- **react-native-gesture-handler** - Gestures
- **react-native-safe-area-context** - Safe areas
- **react-native-screens** - Screen management

---

## 🏗️ البنية المعمارية

### File Structure
```
flash/
├── app/                      # Expo Router - File-based routing
│   ├── (auth)/              # صفحات المصادقة
│   │   ├── login.tsx        # تسجيل الدخول (PIN)
│   │   ├── register.tsx     # التسجيل (PIN)
│   │   └── forgot-pin.tsx  # نسيان PIN
│   ├── (tabs)/              # التبويبات الرئيسية
│   │   ├── customer/        # قسم العميل
│   │   ├── driver/         # قسم السائق
│   │   ├── vendor/          # قسم مزود الخدمة
│   │   └── admin/          # قسم الإدارة
│   └── orders/             # صفحات الطلبات
├── components/             # المكونات القابلة لإعادة الاستخدام
├── contexts/               # React Contexts (Auth, etc)
├── lib/                    # المكتبات والمساعدات
│   ├── pinAuth.ts         # نظام المصادقة بالـ PIN
│   ├── supabase.ts        # Supabase client
│   ├── alert.ts           # SweetAlert2 wrapper
│   └── vibration.ts       # Vibration API
├── i18n/                   # ملفات الترجمة
├── utils/                  # Utilities
└── constants/              # الثوابت
```

### Routing System
- **Expo Router** - File-based routing
- كل ملف في `app/` هو route تلقائياً
- `(auth)` و `(tabs)` هي route groups

---

## 🗄️ قاعدة البيانات (Supabase PostgreSQL)

### الجداول الرئيسية:
1. **profiles** - ملفات المستخدمين
   - `id`, `phone`, `email`, `role`, `full_name`
   - `pin_hash` - PIN مشفر
   - `failed_attempts`, `locked_until` - أمان الحساب
   - `status` - حالة الحساب

2. **orders** - الطلبات
   - معلومات الطلب (من، إلى، نوع)
   - حالة الطلب (pending, accepted, completed, etc)
   - السائق المخصص
   - المبلغ والعمولة

3. **vendors** - مزودو الخدمة
   - معلومات المتجر
   - الموقع
   - ساعات العمل

4. **wallets** - محافظ السائقين
   - الرصيد
   - العمولات
   - المعاملات

5. **driver_locations** - مواقع السائقين
   - الموقع الحي
   - آخر تحديث

### Security
- **Row Level Security (RLS)** - حماية على مستوى الصفوف
- Policies لكل جدول حسب الدور
- Service Role Key للعمليات الإدارية

---

## 🔐 نظام المصادقة

### PIN Authentication
- **6 أرقام** - PIN مكون من 6 أرقام
- **bcryptjs** - تشفير PIN
- **Account Locking** - قفل الحساب بعد 5 محاولات فاشلة
- **Failed Attempts Tracking** - تتبع المحاولات الفاشلة

### User Roles
1. **customer** - العميل
2. **driver** - السائق
3. **vendor** - مزود الخدمة
4. **admin** - المدير

---

## 📱 المنصات المدعومة

### حالياً:
- ✅ **Web** - يعمل على المتصفح (React Native Web)
- ⚠️ **Android/iOS** - جاهز لكن يحتاج build

### Web APIs المستخدمة:
- `navigator.geolocation` - الموقع
- `navigator.vibrate()` - الاهتزاز
- `localStorage` - التخزين
- `window.open()` - فتح الروابط

---

## 🎨 التصميم

### Styling
- **StyleSheet** (React Native) - للأنماط
- **CSS inline** - للويب (في بعض الأماكن)
- **Responsive Design** - تصميم متجاوب
- **RTL Support** - دعم كامل للعربية

### UI Components
- React Native Components:
  - `View`, `Text`, `TouchableOpacity`
  - `TextInput`, `ScrollView`
  - `ActivityIndicator`, `Image`

---

## 🚀 الميزات الرئيسية

### 1. نظام الطلبات
- إنشاء طلبات توصيل
- طلبات من خارج التطبيق
- تتبع الطلبات في الوقت الفعلي

### 2. تتبع الموقع
- تتبع موقع السائق كل 5 ثوانٍ
- عرض الموقع على الخريطة
- حساب المسافات

### 3. نظام المحفظة
- حساب العمولات تلقائياً (10%)
- سجل المعاملات
- المدفوعات الأسبوعية

### 4. Realtime Updates
- تحديثات فورية للطلبات
- إشعارات فورية
- تحديث الموقع الحي

---

## 📦 Dependencies الرئيسية

```json
{
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo": "^54.0.30",
  "expo-router": "~6.0.21",
  "@supabase/supabase-js": "^2.39.0",
  "typescript": "~5.9.2",
  "bcryptjs": "^3.0.3",
  "sweetalert2": "^11.26.17",
  "i18next": "^23.7.16",
  "react-i18next": "^14.0.0"
}
```

---

## 🔧 Build & Deploy

### Development
```bash
npm start          # تشغيل Expo dev server
npm run web        # تشغيل على الويب
```

### Production
```bash
npm run build      # بناء للويب
expo export -p web # تصدير للويب
```

### Deployment
- **Vercel** - للويب (موجود `vercel.json`)
- **Expo EAS** - للـ Android/iOS

---

## 📝 ملاحظات مهمة

1. **Web-First**: المشروع حالياً موجه للويب (Web-first)
2. **React Native Web**: يستخدم React Native Web لتشغيل React Native على الويب
3. **No Native Code**: لا يوجد native code - كل شيء JavaScript/TypeScript
4. **Supabase Backend**: Backend كامل على Supabase
5. **PIN Auth**: نظام مصادقة مخصص بالـ PIN (ليس OAuth)

---

## 🎯 الاستخدام الحالي

- ✅ يعمل على **الويب** بشكل كامل
- ✅ جاهز للعمل داخل **WebView** (Android/iOS)
- ✅ يمكن تحويله لـ **React Web** كامل (بدون React Native)

---

## 📊 الإحصائيات

- **Lines of Code**: ~15,000+ سطر
- **Components**: 20+ مكون
- **Screens**: 30+ شاشة
- **Database Tables**: 10+ جدول
- **Languages**: TypeScript, SQL

---

## 🔄 التطور المستقبلي

- [ ] تحويل كامل إلى React Web (بدون React Native)
- [ ] استبدال Expo Router بـ React Router
- [ ] إزالة React Native dependencies
- [ ] تحسين الأداء على الويب

