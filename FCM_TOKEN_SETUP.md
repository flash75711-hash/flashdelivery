# دليل إعداد FCM Token

## الخطوات الحالية المكتملة ✅

1. ✅ تم إضافة عمود `fcm_token` في جدول `profiles`
2. ✅ تم إنشاء Edge Function `update-fcm-token`
3. ✅ تم إضافة الكود لجلب التوكن من `AndroidBridge` وحفظه تلقائياً

## الخطوات التالية

### 1. اختبار Edge Function يدوياً (للتأكد من أنه يعمل)

افتح Console في المتصفح (F12) بعد تسجيل الدخول، ثم نفذ:

```javascript
window.testFCMTokenUpdate("test-token-12345")
```

إذا نجح، ستظهر رسالة:
```
✅ [updateFCMToken] FCM token saved via Edge Function
```

### 1.1. اختبار AndroidBridge مباشرة

لاختبار `AndroidBridge.getFCMToken()` مباشرة (في Android WebView):

```javascript
window.testAndroidBridge()
```

هذه الدالة:
- ✅ تتحقق من وجود `AndroidBridge`
- ✅ تستدعي `getFCMToken()` مباشرة
- ✅ تعرض التوكن في Console
- ✅ تحفظ التوكن تلقائياً إذا كان المستخدم مسجل دخول

**مثال الاستخدام:**
```javascript
// في أي وقت بعد تحميل الصفحة
const token = window.testAndroidBridge();
console.log('FCM Token:', token);
```

### 2. التحقق من Android WebView

الكود الحالي ينتظر `AndroidBridge` لمدة 15 ثانية (10 ثوانٍ + 5 ثوانٍ إضافية).

**المشكلة الحالية:** التطبيق يعمل في متصفح عادي وليس Android WebView، لذلك `AndroidBridge` غير متاح.

### 3. إعداد Android Native Code

تأكد من أن الكود الأصلي في Android يحقن `AndroidBridge` بشكل صحيح:

#### في Kotlin:
```kotlin
class AndroidBridge {
    @JavascriptInterface
    fun getFCMToken(): String {
        // جلب FCM token من Firebase
        return FirebaseMessaging.getInstance().token.result
    }
}

// في Activity أو Fragment:
webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
```

#### في Java:
```java
public class AndroidBridge {
    @JavascriptInterface
    public String getFCMToken() {
        // جلب FCM token من Firebase
        return FirebaseMessaging.getInstance().getToken().getResult();
    }
}

// في Activity أو Fragment:
webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
```

### 4. توقيت حقن AndroidBridge

**مهم جداً:** يجب حقن `AndroidBridge` قبل تحميل الصفحة أو في `onPageStarted`:

```kotlin
webView.webViewClient = object : WebViewClient() {
    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        // حقن AndroidBridge هنا
        view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
    }
}
```

### 5. التحقق من أن التوكن يتم حفظه

بعد تسجيل الدخول في Android WebView، تحقق من قاعدة البيانات:

```sql
SELECT id, full_name, fcm_token 
FROM profiles 
WHERE id = 'YOUR_USER_ID';
```

## استكشاف الأخطاء

### المشكلة: `AndroidBridge not available`

**الأسباب المحتملة:**
1. التطبيق يعمل في متصفح عادي وليس WebView
2. `AndroidBridge` لم يتم حقنه في الكود الأصلي
3. `AndroidBridge` تم حقنه بعد تحميل الصفحة (تأخير)

**الحل:**
- تأكد من حقن `AndroidBridge` في `onPageStarted` أو قبل تحميل الصفحة
- تحقق من User Agent في console: يجب أن يحتوي على "wv" أو "WebView"

### المشكلة: Edge Function لا يعمل

**التحقق:**
1. افتح Console (F12)
2. نفذ: `window.testFCMTokenUpdate("test-token")`
3. تحقق من الأخطاء في Console

**الحل:**
- تحقق من أن Edge Function منشور: `update-fcm-token`
- تحقق من أن `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` موجودة في Environment Variables

## ملاحظات مهمة

1. **الكود الحالي ينتظر 15 ثانية** لـ `AndroidBridge` - هذا كافٍ في معظم الحالات
2. **Edge Function يتجاوز RLS** - يعمل حتى بدون session كامل
3. **التوكن يتم حفظه تلقائياً** عند تسجيل الدخول في Android WebView

## اختبار سريع

1. سجل دخول في التطبيق
2. افتح Console (F12)
3. ابحث عن رسائل `📱 [updateFCMToken]` أو `📱 [useEffect]`
4. إذا رأيت `AndroidBridge not available`، المشكلة في الكود الأصلي
5. جرب `window.testFCMTokenUpdate("test")` للتأكد من Edge Function
6. جرب `window.testAndroidBridge()` لاختبار `AndroidBridge.getFCMToken()` مباشرة

### دوال الاختبار المتاحة في Console:

```javascript
// اختبار Edge Function مع token وهمي
window.testFCMTokenUpdate("test-token-123")

// اختبار AndroidBridge.getFCMToken() مباشرة (في Android WebView فقط)
window.testAndroidBridge()
```