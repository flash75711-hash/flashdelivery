# كيفية Deploy Edge Functions المحدثة

## Edge Functions المحدثة:
1. `create-order` - ✅ تم deployها بنجاح (version 8)
2. `start-order-search` - ⚠️ تحتاج إلى deploy

## الطريقة 1: استخدام Supabase CLI

```bash
# 1. تسجيل الدخول
npx supabase login

# 2. ربط المشروع
npx supabase link --project-ref tnwrmybyvimlsamnputn

# 3. Deploy Edge Functions
npx supabase functions deploy start-order-search
```

## الطريقة 2: استخدام Supabase Dashboard

1. اذهب إلى **Supabase Dashboard**
2. **Edge Functions** → **start-order-search**
3. **Deploy** → **Upload files**
4. ارفع ملف `supabase/functions/start-order-search/index.ts`

## الطريقة 3: استخدام MCP (إذا كان متاحاً)

تم محاولة deploy عبر MCP لكن واجهنا مشكلة في parsing. يمكنك:
1. استخدام Supabase CLI (الطريقة 1)
2. أو استخدام Supabase Dashboard (الطريقة 2)

## ملاحظات:

- ✅ `create-order` تم deployها بنجاح وتحتوي على Logging الجديد
- ⚠️ `start-order-search` تحتاج إلى deploy يدوي
- بعد Deploy، ستظهر Logs الجديدة في Supabase Dashboard

## التحقق من Deploy:

بعد Deploy، تحقق من:
1. Supabase Dashboard → Edge Functions → start-order-search
2. يجب أن تكون Version الجديدة active
3. Logs يجب أن تحتوي على `[start-order-search] ========== Function called ==========`
