# تعليمات لـ Cursor - إعداد Android WebView

## ما يجب أن تقوله لـ Cursor:

```
أحتاج إعداد Android WebView لجعل AndroidBridge.getFCMToken() متاحاً في JavaScript.

المتطلبات:
1. إنشاء class AndroidBridge يحتوي على method getFCMToken() الذي يجلب FCM token من Firebase
2. حقن AndroidBridge في WebView باستخدام addJavascriptInterface
3. التأكد من حقن AndroidBridge قبل تحميل الصفحة (في onPageStarted أو قبل loadUrl)
4. تفعيل JavaScript في WebView settings

الكود المطلوب:
- Kotlin أو Java
- استخدام @JavascriptInterface annotation
- جلب FCM token من FirebaseMessaging.getInstance().token
- حقن AndroidBridge باسم "AndroidBridge" (بدون علامات اقتباس في الكود)

المرجع: راجع ملف ANDROID_WEBVIEW_SETUP_AR.md للتفاصيل الكاملة
```

## الكود المطلوب بالتفصيل:

### 1. AndroidBridge Class (Kotlin):
```kotlin
import android.webkit.JavascriptInterface
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

class AndroidBridge {
    @JavascriptInterface
    fun getFCMToken(): String {
        return try {
            FirebaseMessaging.getInstance().token.await()
        } catch (e: Exception) {
            ""
        }
    }
}
```

### 2. حقن AndroidBridge في WebView:
```kotlin
// في onCreate أو onViewCreated
webView.settings.javaScriptEnabled = true
webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

// أو في onPageStarted
webView.webViewClient = object : WebViewClient() {
    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
    }
}
```

## النقاط المهمة:

1. ✅ **اسم JavaScript:** يجب أن يكون `"AndroidBridge"` (حرفياً)
2. ✅ **Method name:** يجب أن يكون `getFCMToken` (حرفياً)
3. ✅ **Return type:** يجب أن يكون `String`
4. ✅ **Timing:** حقن AndroidBridge **قبل** تحميل الصفحة
5. ✅ **JavaScript:** يجب تفعيل `javaScriptEnabled = true`

## الاختبار:

بعد الإعداد، افتح Chrome DevTools (chrome://inspect) واختبر:

```javascript
// يجب أن يعمل
window.AndroidBridge.getFCMToken()

// أو استخدم دالة الاختبار المدمجة
window.testAndroidBridge()
```

## الملفات المرجعية:

- `ANDROID_WEBVIEW_SETUP_AR.md` - دليل شامل بالعربية
- `FCM_TOKEN_SETUP.md` - دليل إعداد FCM Token
- `contexts/AuthContext.tsx` - الكود JavaScript الذي يستخدم AndroidBridge
