# إعداد Android WebView - تعليمات لـ Cursor

## الهدف
جعل `AndroidBridge.getFCMToken()` متاحاً في JavaScript داخل WebView لجلب FCM Token من Android وحفظه في قاعدة البيانات.

## ما يجب فعله في Android Native Code

### 1. إنشاء Class `AndroidBridge`

#### في Kotlin:
```kotlin
import android.webkit.JavascriptInterface
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

class AndroidBridge {
    @JavascriptInterface
    fun getFCMToken(): String {
        // جلب FCM token من Firebase
        return try {
            // الطريقة الموصى بها (async)
            FirebaseMessaging.getInstance().token.await()
        } catch (e: Exception) {
            // في حالة الخطأ، حاول الطريقة المتزامنة
            try {
                FirebaseMessaging.getInstance().token.result
            } catch (e2: Exception) {
                ""
            }
        }
    }
}
```

#### في Java:
```java
import android.webkit.JavascriptInterface;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.android.gms.tasks.Tasks;

public class AndroidBridge {
    @JavascriptInterface
    public String getFCMToken() {
        try {
            // جلب FCM token من Firebase
            return Tasks.await(FirebaseMessaging.getInstance().getToken());
        } catch (Exception e) {
            e.printStackTrace();
            return "";
        }
    }
}
```

### 2. حقن AndroidBridge في WebView

**مهم جداً:** يجب حقن `AndroidBridge` **قبل** تحميل الصفحة أو في `onPageStarted`.

#### الطريقة الموصى بها (في `onPageStarted`):

```kotlin
webView.webViewClient = object : WebViewClient() {
    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        
        // حقن AndroidBridge هنا - قبل تحميل الصفحة
        view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        
        // تفعيل JavaScript (مهم!)
        view?.settings?.javaScriptEnabled = true
    }
}
```

#### أو في `onCreate` / `onViewCreated` (قبل `loadUrl`):

```kotlin
// في Activity أو Fragment
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // تفعيل JavaScript
    webView.settings.javaScriptEnabled = true
    
    // حقن AndroidBridge قبل تحميل الصفحة
    webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
    
    // الآن يمكن تحميل الصفحة
    webView.loadUrl("https://your-app-url.com")
}
```

### 3. تفعيل JavaScript في WebView

```kotlin
webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true // مهم للـ localStorage
    allowFileAccess = true
}
```

### 4. إضافة Security (اختياري لكن موصى به)

```kotlin
// لمنع حقن كود خبيث
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
    webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
}
```

## التحقق من أن كل شيء يعمل

### في Android Logcat:
ابحث عن:
- `AndroidBridge injected successfully`
- أي أخطاء متعلقة بـ Firebase Messaging

### في JavaScript Console (في WebView):
افتح Chrome DevTools (chrome://inspect) واختبر:

```javascript
// 1. التحقق من وجود AndroidBridge
console.log('AndroidBridge exists?', typeof window.AndroidBridge !== 'undefined');
console.log('getFCMToken exists?', typeof window.AndroidBridge?.getFCMToken === 'function');

// 2. جلب Token مباشرة
const token = window.AndroidBridge.getFCMToken();
console.log('FCM Token:', token);

// 3. استخدام دالة الاختبار المدمجة
window.testAndroidBridge();
```

## المشاكل الشائعة وحلولها

### المشكلة 1: `AndroidBridge is not defined`

**السبب:** `AndroidBridge` لم يتم حقنه أو تم حقنه بعد تحميل الصفحة.

**الحل:**
- تأكد من حقن `AndroidBridge` في `onPageStarted` أو قبل `loadUrl()`
- تأكد من `javaScriptEnabled = true`

### المشكلة 2: `getFCMToken() returns null or empty`

**السبب:** Firebase Messaging لم يتم تهيئته أو Token غير متاح بعد.

**الحل:**
- تأكد من تهيئة Firebase في `Application` class
- تأكد من أن `google-services.json` موجود في `app/`
- انتظر قليلاً بعد فتح التطبيق قبل استدعاء `getFCMToken()`

### المشكلة 3: Token لا يُحفظ في قاعدة البيانات

**السبب:** Edge Function لا يعمل أو user غير مسجل دخول.

**الحل:**
- تأكد من أن المستخدم مسجل دخول
- اختبر Edge Function يدوياً: `window.testEdgeFunctionDirectly("test-token")`
- تحقق من لوجات Edge Function في Supabase Dashboard

## مثال كامل (Kotlin)

```kotlin
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this)
        setContentView(webView)
        
        // إعدادات WebView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
        }
        
        // حقن AndroidBridge
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        
        // WebViewClient
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                // تأكد من حقن AndroidBridge مرة أخرى (للأمان)
                view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
            }
        }
        
        // تحميل الصفحة
        webView.loadUrl("https://your-app-url.com")
    }
    
    // AndroidBridge class
    class AndroidBridge {
        @JavascriptInterface
        fun getFCMToken(): String {
            return try {
                FirebaseMessaging.getInstance().token.await()
            } catch (e: Exception) {
                e.printStackTrace()
                ""
            }
        }
    }
}
```

## ملاحظات مهمة

1. **التوقيت:** حقن `AndroidBridge` يجب أن يكون **قبل** تحميل الصفحة
2. **JavaScript:** يجب تفعيل `javaScriptEnabled = true`
3. **Firebase:** تأكد من تهيئة Firebase Messaging بشكل صحيح
4. **الاختبار:** استخدم `window.testAndroidBridge()` في Console للتحقق

## الخطوات التالية بعد الإعداد

1. ✅ حقن `AndroidBridge` في WebView
2. ✅ اختبار `window.AndroidBridge.getFCMToken()` في Console
3. ✅ التحقق من أن Token يُحفظ تلقائياً في قاعدة البيانات
4. ✅ مراقبة لوجات Edge Function في Supabase Dashboard

## الدعم

إذا واجهت مشاكل:
1. افتح Chrome DevTools (chrome://inspect)
2. تحقق من Console للأخطاء
3. اختبر `window.testAndroidBridge()` مباشرة
4. تحقق من لوجات Android Logcat
