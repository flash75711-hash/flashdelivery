# إعداد محافظ العملاء

## نظرة عامة
تم إضافة دعم محافظ العملاء للتعامل مع الباقي من المبالغ المدفوعة في الطلبات. عندما يدفع العميل أكثر من المبلغ المطلوب، يتم إضافة الباقي تلقائياً إلى محفظته.

## الخطوات المطلوبة

### 1. تطبيق Migration على قاعدة البيانات

قم بتطبيق migration التالية على Supabase:

```sql
-- ملف: migrations/add_customer_wallet_support.sql
```

يمكن تطبيقها من خلال:
- Supabase Dashboard > SQL Editor
- أو استخدام Supabase CLI

### 2. نشر Edge Function

قم بنشر Edge Function الجديدة:

```bash
supabase functions deploy add-to-customer-wallet
```

أو من خلال Supabase Dashboard > Edge Functions > Deploy

### 3. التحقق من RLS Policies

تأكد من وجود RLS policies مناسبة لجدول `wallets` للسماح للعملاء بقراءة محافظهم:

```sql
-- Policy للسماح للعملاء بقراءة محافظهم
CREATE POLICY "Customers can view their own wallet"
ON wallets FOR SELECT
USING (customer_id = auth.uid());

-- Policy للسماح للخدمة بإضافة محافظ العملاء (عبر Edge Function)
-- (Edge Functions تستخدم service role key، لذلك لا تحتاج policy)
```

## كيفية العمل

1. **عند التحصيل**: عندما يضغط السائق على "تم التحصيل" ويدخل المبلغ المدفوع
2. **حساب الباقي**: يتم حساب الفرق بين المبلغ المدفوع والمبلغ المطلوب
3. **إضافة للمحفظة**: إذا كان الباقي > 0، يتم استدعاء Edge Function `add-to-customer-wallet`
4. **إشعار العميل**: يتم إرسال إشعار للعميل بإضافة المبلغ لمحفظته

## بنية البيانات

### جدول wallets
- `customer_id`: معرف العميل (للعملاء)
- `driver_id`: معرف السائق (للسائقين)
- `amount`: المبلغ
- `type`: نوع المعاملة ('earning' للباقي)
- `order_id`: معرف الطلب المرتبط
- `description`: وصف المعاملة

## Edge Function: add-to-customer-wallet

### Request Body
```json
{
  "customerId": "uuid",
  "amount": 10.50,
  "orderId": "uuid (optional)",
  "description": "string (optional)"
}
```

### Response
```json
{
  "success": true,
  "walletEntry": { ... },
  "message": "تم إضافة المبلغ إلى محفظة العميل"
}
```

## ملاحظات

- المحفظة خاصة بالعميل ويتم التعامل بها داخل البرنامج بين الأدوار
- يمكن للعميل استخدام الرصيد في محفظته لدفع الطلبات المستقبلية
- يمكن إضافة واجهة لعرض رصيد المحفظة للعميل في المستقبل

