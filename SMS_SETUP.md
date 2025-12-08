# إعداد SMS OTP في Supabase

## الخطوات المطلوبة:

### 1. تفعيل Phone Auth في Supabase Dashboard

1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **Authentication** > **Providers**
4. فعّل **Phone** provider

### 2. إعداد SMS Provider (Msegat - موصى به)

#### أ. إنشاء حساب في Msegat:
1. اذهب إلى [Msegat.com](https://msegat.com)
2. سجل حساب جديد
3. احصل على:
   - **API Key**
   - **Username**
   - **Sender Name** (اسم المرسل)

#### ب. إعداد Send SMS Hook في Supabase:

1. اذهب إلى **Database** > **Edge Functions** في Supabase Dashboard
2. أنشئ Edge Function جديد باسم `send-sms`
3. استخدم الكود التالي:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { user, sms } = await req.json();
    
    // إعدادات Msegat
    const msegatApiKey = Deno.env.get('MSEGAT_API_KEY');
    const msegatUsername = Deno.env.get('MSEGAT_USERNAME');
    const msegatSenderName = Deno.env.get('MSEGAT_SENDER_NAME') || 'FlashDelivery';
    
    if (!msegatApiKey || !msegatUsername) {
      throw new Error('Msegat credentials not configured');
    }
    
    // إرسال SMS عبر Msegat API
    const response = await fetch('https://www.msegat.com/gw/sendsms.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName: msegatUsername,
        apiKey: msegatApiKey,
        numbers: user.phone.replace('+', ''), // إزالة + من رقم الهاتف
        userSender: msegatSenderName,
        msg: `رمز التحقق الخاص بك هو: ${sms.otp}`,
        msgEncoding: 'UTF8',
      }),
    });
    
    const result = await response.json();
    
    if (result.code === '1') {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      throw new Error(`Msegat API error: ${result.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
```

4. أضف Environment Variables في Supabase:
   - اذهب إلى **Project Settings** > **Edge Functions** > **Secrets**
   - أضف:
     - `MSEGAT_API_KEY`: مفتاح API من Msegat
     - `MSEGAT_USERNAME`: اسم المستخدم من Msegat
     - `MSEGAT_SENDER_NAME`: اسم المرسل (اختياري)

5. اربط Hook بـ Supabase Auth:
   - اذهب إلى **Authentication** > **Hooks**
   - أنشئ Hook جديد من نوع **Send SMS**
   - اختر Edge Function: `send-sms`

### 3. بدائل أخرى (إذا لم تستخدم Msegat):

#### BeOn:
- الموقع: https://beon.chat
- API Documentation: متوفر في الموقع

#### MersalSMS:
- الموقع: https://mersalsms.com
- API Documentation: متوفر في الموقع

### 4. اختبار الإعداد:

1. شغّل التطبيق
2. جرب تسجيل الدخول برقم هاتف
3. تحقق من وصول رسالة SMS برمز التحقق

### 5. ملاحظات مهمة:

- **التكلفة**: حوالي 0.15-0.25 جنيه لكل رسالة SMS
- **السرعة**: عادة ما تصل الرسالة خلال 5-30 ثانية
- **التنسيق**: رقم الهاتف يجب أن يكون بصيغة دولية (+20xxxxxxxxxx)
- **Rate Limiting**: Supabase يحد من عدد الطلبات (افتراضي: مرة كل 60 ثانية)

### 6. استكشاف الأخطاء:

إذا لم تصل رسالة SMS:
1. تحقق من صحة API credentials
2. تحقق من رصيد حساب Msegat
3. تحقق من صحة تنسيق رقم الهاتف
4. راجع logs في Supabase Dashboard > Edge Functions > Logs

