# 🚀 نشر Edge Function: update-order (محدث)

## التحديثات المضافة:
✅ إصلاح معالجة الحقول `is_prepaid` و `prepaid_amount`  
✅ تحسين معالجة الأخطاء عند وجود حقول غير موجودة في قاعدة البيانات  
✅ إضافة retry mechanism عند فشل التحديث بسبب عمود غير موجود  

## طريقة النشر:

### الطريقة 1: من Supabase Dashboard (الأسهل) ✅

1. **افتح Supabase Dashboard**
   - اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/functions

2. **ابحث عن Edge Function `update-order`**
   - إذا كان موجوداً، اضغط عليه
   - إذا لم يكن موجوداً، اضغط على **"Create a new function"** واسمه `update-order`

3. **نسخ الكود المحدث**
   - افتح الملف: `supabase/functions/update-order/index.ts`
   - انسخ كل المحتوى
   - الصقه في محرر الكود في Dashboard

4. **النشر**
   - اضغط على **Deploy** أو **Save**

### الطريقة 2: من Terminal (يتطلب token)

```bash
# 1. تعيين Access Token
export SUPABASE_ACCESS_TOKEN=your_access_token_here

# 2. نشر Edge Function
cd /home/zero/Desktop/flash
npx supabase functions deploy update-order --project-ref tnwrmybyvimlsamnputn
```

**للحصول على Access Token:**
- اذهب إلى: https://supabase.com/dashboard/account/tokens
- أنشئ token جديد أو استخدم token موجود

## التحقق من النشر:

1. **من Dashboard**
   - اذهب إلى Edge Functions
   - تأكد من وجود `update-order` في القائمة
   - تأكد من أن الحالة: **Active**
   - تحقق من آخر تحديث (يجب أن يكون الآن)

2. **اختبار Function**
   - اضغط على `update-order`
   - اختر **Invoke function**
   - استخدم هذا الـ Body للاختبار:
     ```json
     {
       "orderId": "YOUR_ORDER_ID",
       "status": "pickedUp"
     }
     ```

## ملاحظات مهمة:

⚠️ **إذا كانت الحقول `is_prepaid` و `prepaid_amount` غير موجودة في جدول `orders`:**

يمكنك إضافتها بهذا SQL:

```sql
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_prepaid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS prepaid_amount DECIMAL(10, 2);
```

✅ **الآن Edge Function سيعمل حتى لو كانت هذه الحقول غير موجودة** - سيتم تحديث الحقول الأخرى فقط.


