# إعداد Push Notifications

## ✅ ما تم إنجازه

1. **تثبيت المكتبات المطلوبة:**
   - `expo-notifications` - لإدارة الإشعارات
   - `expo-device` - للتحقق من نوع الجهاز
   - `expo-constants` - للحصول على معلومات المشروع

2. **إنشاء جدول `device_tokens` في Supabase:**
   - تخزين tokens الأجهزة لكل مستخدم
   - دعم iOS و Android و Web
   - RLS policies للأمان

3. **إنشاء Edge Function `send-push-notification`:**
   - إرسال Push Notifications عبر Expo Push Notification Service
   - دعم إرسال إشعارات متعددة

4. **Hook `usePushNotifications`:**
   - تسجيل device token تلقائياً
   - طلب صلاحيات الإشعارات
   - حفظ token في قاعدة البيانات

5. **تحديث `lib/notifications.ts`:**
   - إرسال Push Notifications تلقائياً عند إنشاء إشعار جديد

## 📋 الخطوات المطلوبة

### 1. تثبيت المكتبات

```bash
npm install
```

### 2. إعداد EAS Project (لإنتاج Push Notifications)

```bash
# تثبيت EAS CLI
npm install -g eas-cli

# تسجيل الدخول
eas login

# إنشاء مشروع EAS
eas init

# الحصول على project ID
eas project:info
```

### 3. إضافة Project ID إلى app.json

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-project-id-here"
      }
    }
  }
}
```

### 4. نشر Edge Function

```bash
# من مجلد المشروع
supabase functions deploy send-push-notification
```

### 5. إعداد متغيرات البيئة في Supabase

في Supabase Dashboard → Edge Functions → send-push-notification:
- تأكد من وجود `SUPABASE_URL` و `SUPABASE_ANON_KEY`

### 6. اختبار Push Notifications

1. سجّل الدخول كسائق
2. أنشئ طلب جديد من حساب العميل
3. يجب أن يظهر إشعار Push في شريط الإشعارات

## 🔧 إعدادات إضافية

### iOS

1. في `app.json`:
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    }
  }
}
```

2. إعداد APNs (Apple Push Notification service):
   - اذهب إلى Apple Developer Console
   - أنشئ Push Notification Certificate
   - أضف Certificate إلى Expo

### Android

1. إعداد FCM (Firebase Cloud Messaging):
   - أنشئ مشروع Firebase
   - أضف `google-services.json` إلى المشروع
   - أضف Server Key إلى Supabase

## 📱 كيفية عمل النظام

1. **عند تسجيل الدخول:**
   - يطلب التطبيق صلاحيات الإشعارات
   - يحصل على Expo Push Token
   - يحفظ Token في جدول `device_tokens`

2. **عند إنشاء إشعار جديد:**
   - يتم إنشاء إشعار في جدول `notifications`
   - يتم استدعاء Edge Function `send-push-notification`
   - ترسل الإشعارات Push لجميع أجهزة المستخدم

3. **عند وصول إشعار Push:**
   - يظهر في شريط الإشعارات حتى لو كان التطبيق مغلقاً
   - عند الضغط على الإشعار، يفتح التطبيق

## ⚠️ ملاحظات مهمة

1. **للاختبار على جهاز حقيقي:**
   - Push Notifications لا تعمل على المحاكي
   - يجب استخدام جهاز iOS أو Android حقيقي

2. **للإنتاج:**
   - يجب إعداد APNs لـ iOS
   - يجب إعداد FCM لـ Android
   - يجب إضافة EAS Project ID

3. **الأمان:**
   - Edge Function تتحقق من JWT
   - فقط المستخدمون المصرح لهم يمكنهم إرسال إشعارات

## 🐛 حل المشاكل

### الإشعارات لا تظهر
1. تحقق من صلاحيات الإشعارات في إعدادات الجهاز
2. تأكد من تسجيل device token في قاعدة البيانات
3. تحقق من logs في Edge Function

### Token غير صحيح
1. تأكد من إضافة EAS Project ID
2. تحقق من أن التطبيق يعمل على جهاز حقيقي
3. أعد تثبيت التطبيق

## 📚 مراجع

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
