# إنشاء Twilio Message Service SID

## المشكلة:
Supabase يطلب "Twilio Message Service SID" وهو مطلوب الآن.

## الحل: إنشاء Message Service في Twilio

### الخطوات:

1. **اذهب إلى Twilio Console:**
   - https://console.twilio.com/us1/develop/sms/services

2. **اضغط "Create Messaging Service"** (أو "Create Service")

3. **أدخل المعلومات:**
   - **Friendly Name**: `Flash Delivery SMS` (أو أي اسم تريده)
   - **Use Case**: اختر "Transactional" أو "Marketing" (Transactional أفضل لـ OTP)

4. **اضغط "Create"**

5. **بعد الإنشاء:**
   - ستجد **Service SID** في الصفحة
   - يبدأ بـ `MG...` (مثل: `MG1234567890abcdef1234567890abcdef`)
   - انسخ هذا الـ SID

6. **إضافة رقم الهاتف إلى Service:**
   - في نفس الصفحة، ابحث عن قسم "Sender Pool" أو "Phone Numbers"
   - اضغط "Add Sender" أو "Add Phone Number"
   - اختر رقم الهاتف المحقق لديك (`+201200006637`)
   - احفظ

7. **انسخ Service SID:**
   - انسخ الـ SID الذي يبدأ بـ `MG...`
   - الصقه في Supabase في حقل "Twilio Message Service SID"

## بديل سريع (إذا لم يعمل):

إذا لم تستطع إنشاء Message Service، جرب:

1. اترك حقل "Twilio Message Service SID" فارغاً
2. تأكد من وجود رقم هاتف نشط في Twilio
3. احفظ في Supabase
4. إذا ظهر خطأ، ستحتاج لإنشاء Message Service

## ملاحظة:
Message Service يجعل إدارة الرسائل أسهل ويدعم أرقام متعددة.

