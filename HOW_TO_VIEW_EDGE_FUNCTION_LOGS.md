# 📋 كيفية رؤية Logs الخاصة بـ Edge Function

## الطريقة 1: من Supabase Dashboard (الأسهل) ✅

1. **افتح Supabase Dashboard**
   - اذهب إلى: https://app.supabase.com
   - اختر مشروعك

2. **اذهب إلى Edge Functions**
   - من القائمة الجانبية، اختر **Edge Functions**
   - أو اذهب مباشرة إلى: `https://app.supabase.com/project/YOUR_PROJECT_ID/functions`

3. **اختر Function `update-fcm-token`**
   - اضغط على `update-fcm-token` من القائمة

4. **شاهد Logs**
   - اضغط على تبويب **Logs** أو **View Logs**
   - ستجد جميع الـ logs مرتبة حسب الوقت
   - يمكنك تصفية حسب التاريخ والوقت

## الطريقة 2: من Terminal (أكثر تفصيلاً)

### المتطلبات:
- Supabase CLI مثبت
- المشروع مربوط بـ Supabase

### الخطوات:

```bash
# 1. تسجيل الدخول (إذا لم تكن مسجل دخول)
npx supabase login

# 2. ربط المشروع (إذا لم يكن مربوطاً)
npx supabase link --project-ref YOUR_PROJECT_REF

# 3. عرض Logs
npx supabase functions logs update-fcm-token

# أو عرض Logs مع tail (متابعة مباشرة)
npx supabase functions logs update-fcm-token --follow
```

## ما الذي ستراه في Logs:

بعد إضافة الـ logging المفصل، سترى:

```
🔵 [Edge Function] ========== update-fcm-token called ==========
🔵 [Edge Function] Method: POST
🔵 [Edge Function] URL: https://...
🔵 [Edge Function] Step 1: Getting environment variables...
✅ [Edge Function] Environment variables loaded
🔵 [Edge Function] Step 2: Creating Supabase client...
✅ [Edge Function] Supabase client created
🔵 [Edge Function] Step 3: Parsing request body...
📥 [Edge Function] Request body received:
   - user_id: [uuid]
   - fcm_token (first 30 chars): dmYEPXt7S-WlqTTOSoviU6:APA91bF...
   - fcm_token length: 163
🔵 [Edge Function] Step 4: Validating user_id format...
✅ [Edge Function] user_id format is valid
🔵 [Edge Function] Step 5: Updating FCM token in profiles table...
   - Table: profiles
   - Where: id = [uuid]
   - Update: fcm_token = dmYEPXt7S-WlqTTOSoviU6:APA91bF...
✅ [Edge Function] ========== SUCCESS ==========
✅ [Edge Function] FCM token updated successfully in profiles table!
✅ [Edge Function] Updated record:
   - user_id: [uuid]
   - fcm_token (first 30 chars): dmYEPXt7S-WlqTTOSoviU6:APA91bF...
✅ [Edge Function] ========== End ==========
```

## في حالة وجود خطأ:

سترى رسائل خطأ واضحة:

```
❌ [Edge Function] Database error updating FCM token:
   - Error code: [code]
   - Error message: [message]
   - Error details: [details]
```

أو:

```
❌ [Edge Function] ========== EXCEPTION ==========
❌ [Edge Function] Error in update-fcm-token function:
   - Error type: [type]
   - Error message: [message]
   - Error stack: [stack]
```

## نصائح:

1. **راقب Logs في الوقت الفعلي**: استخدم `--follow` في Terminal
2. **تحقق من Logs بعد كل اختبار**: تأكد من أن الطلب وصل بنجاح
3. **ابحث عن رسائل SUCCESS**: إذا رأيت `✅ [Edge Function] ========== SUCCESS ==========`، يعني التوكن تم حفظه بنجاح
