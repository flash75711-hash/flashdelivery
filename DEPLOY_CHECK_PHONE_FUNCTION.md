# نشر Edge Function `check-phone`

## الطريقة 1: من Supabase Dashboard (الأسهل) ✅

### الخطوات:

1. **افتح Supabase Dashboard**
   - اذهب إلى: https://supabase.com/dashboard
   - اختر مشروعك

2. **اذهب إلى Edge Functions**
   - من القائمة الجانبية، اختر **Edge Functions**
   - أو اذهب مباشرة إلى: `https://supabase.com/dashboard/project/YOUR_PROJECT_ID/functions`

3. **إنشاء Function جديد**
   - اضغط على **Create a new function**
   - اسم Function: `check-phone`
   - **⚠️ مهم**: اترك **Verify JWT** غير مفعّل (unchecked)

4. **نسخ الكود**
   - افتح الملف: `supabase/functions/check-phone/index.ts`
   - انسخ كل المحتوى
   - الصقه في محرر الكود في Dashboard

5. **إضافة Environment Variables**
   - تأكد من وجود:
     - `SUPABASE_URL` (يتم إضافتها تلقائياً)
     - `SUPABASE_SERVICE_ROLE_KEY` (يتم إضافتها تلقائياً)

6. **النشر**
   - اضغط على **Deploy**

## الطريقة 2: من Terminal (يتطلب ربط المشروع)

### الخطوات:

1. **ربط المشروع بـ Supabase CLI**
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
   
   **للحصول على Project Ref**:
   - اذهب إلى Supabase Dashboard
   - من Settings → General
   - انسخ **Reference ID**

2. **النشر**
   ```bash
   npx supabase functions deploy check-phone --no-verify-jwt
   ```

## التحقق من النشر

### 1. من Dashboard
- اذهب إلى Edge Functions
- تأكد من وجود `check-phone` في القائمة
- تأكد من أن الحالة: **Active**

### 2. اختبار Function
يمكنك اختبار Function من Dashboard:
- اضغط على `check-phone`
- اختر **Invoke function**
- استخدم هذا الـ Body:
  ```json
  {
    "phone": "+201234567890"
  }
  ```

### 3. من المتصفح (اختبار مباشر)
افتح Console في المتصفح وجرب:
```javascript
const response = await fetch('https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-phone', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phone: '+201234567890'
  })
});

const data = await response.json();
console.log(data);
```

## ملاحظات مهمة

1. **JWT Verification**: تم تعطيله (`--no-verify-jwt`) لأن التحقق من وجود الرقم لا يتطلب مصادقة مسبقة

2. **Environment Variables**: 
   - `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` يتم إضافتها تلقائياً من Supabase
   - لا حاجة لإضافتها يدوياً

3. **CORS**: Function يدعم CORS تلقائياً

4. **الاستخدام**: بعد النشر، سيتم استدعاء Function تلقائياً من `checkPhoneExists` في `lib/pinAuth.ts`

## استكشاف الأخطاء

### خطأ: "Cannot find project ref"
- **الحل**: استخدم الطريقة 1 (Dashboard) أو اربط المشروع أولاً

### خطأ: "Function not found"
- **الحل**: تأكد من نشر Function بنجاح من Dashboard

### خطأ: "406 Not Acceptable"
- **الحل**: تأكد من أن `SUPABASE_SERVICE_ROLE_KEY` موجودة في Environment Variables

## الخطوات التالية

بعد نشر Function:
1. ✅ اختبار التسجيل من المتصفح
2. ✅ التحقق من عمل `checkPhoneExists` بشكل صحيح
3. ✅ مراقبة Logs في Supabase Dashboard

