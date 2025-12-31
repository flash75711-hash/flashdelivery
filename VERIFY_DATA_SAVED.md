# التحقق من حفظ البيانات في قاعدة البيانات

## 📋 كيفية التحقق من أن الصور والمعلومات محفوظة

### 1. من Console المتصفح (F12)

عند تحديث معلومات السائق أو إضافتها، ستظهر logs مفصلة في Console:

#### عند رفع الصور:
```
📤 [Image Upload] Starting upload for idCard...
🔄 [ImgBB] Converting image to base64...
✅ [ImgBB] Image converted to base64, length: ...
✅ [ImgBB] Image uploaded successfully via Supabase Client: { url: "...", format: "webp" }
✅ [Image Upload] idCard uploaded successfully: { url: "...", fullUrl: "..." }
```

#### عند حفظ البيانات:
```
💾 [Driver Registration] Starting database update...
✅ [Driver Registration] Database update successful: { updatedRows: 1, data: {...} }
🔍 [Driver Registration] Verifying saved data...
✅ [Driver Registration] Data verification successful: { id: "...", full_name: "...", phone: "...", ... }
```

### 2. من Supabase Dashboard

#### التحقق من جدول `profiles`:

1. اذهب إلى Supabase Dashboard → Table Editor → `profiles`
2. ابحث عن المستخدم باستخدام:
   - `id` (User ID)
   - `phone` (رقم التليفون)
3. تحقق من الحقول التالية:
   - ✅ `full_name` - يجب أن يحتوي على الاسم الكامل
   - ✅ `phone` - يجب أن يحتوي على رقم التليفون
   - ✅ `id_card_image_url` - يجب أن يحتوي على رابط الصورة من ImgBB
   - ✅ `selfie_image_url` - يجب أن يحتوي على رابط الصورة من ImgBB
   - ✅ `approval_status` - يجب أن يكون `pending`
   - ✅ `registration_complete` - يجب أن يكون `false`

#### التحقق من روابط الصور:

1. انسخ `id_card_image_url` من قاعدة البيانات
2. الصقه في المتصفح
3. يجب أن تفتح الصورة بشكل صحيح
4. كرر نفس الخطوات لـ `selfie_image_url`

### 3. من الكود (SQL Query)

يمكنك تشغيل هذا الاستعلام في Supabase SQL Editor:

```sql
-- التحقق من بيانات سائق معين
SELECT 
  id,
  full_name,
  phone,
  id_card_image_url,
  selfie_image_url,
  approval_status,
  registration_complete,
  created_at,
  updated_at
FROM profiles
WHERE phone = '+201200006637'  -- استبدل برقم التليفون
  OR id = 'user-id-here';      -- أو استبدل بـ User ID
```

### 4. من التطبيق

#### في صفحة Dashboard للسائق:

1. اذهب إلى `/(tabs)/driver/dashboard`
2. في قسم "بياناتي الشخصية"، يجب أن ترى:
   - ✅ الاسم الكامل
   - ✅ رقم التليفون
   - ✅ صورة البطاقة الشخصية (إذا كانت موجودة)
   - ✅ صورة السيلفي (إذا كانت موجودة)

### 5. استكشاف الأخطاء

#### إذا لم تظهر الصور:

1. **تحقق من Console:**
   - ابحث عن `❌ [Image Upload]` أو `❌ [ImgBB]`
   - تحقق من رسالة الخطأ

2. **تحقق من ImgBB:**
   - تأكد من أن Edge Function `upload-image` يعمل
   - تحقق من logs في Supabase Dashboard → Edge Functions → `upload-image`

3. **تحقق من RLS Policies:**
   - تأكد من أن السائق لديه صلاحية `UPDATE` على `profiles`
   - تحقق من RLS policies في Supabase Dashboard → Authentication → Policies

#### إذا لم يتم حفظ البيانات:

1. **تحقق من Console:**
   - ابحث عن `❌ [Driver Registration] Database update error:`
   - تحقق من رسالة الخطأ

2. **تحقق من User ID:**
   - تأكد من أن `user.id` موجود وصحيح
   - تحقق من logs: `💾 [Driver Registration] Starting database update...`

3. **تحقق من RLS Policies:**
   - تأكد من أن السائق لديه صلاحية `UPDATE` على `profiles`
   - تحقق من أن `user.id` يطابق `id` في جدول `profiles`

### 6. Logs المتوقعة (Success Flow)

```
📤 [Image Upload] Starting upload for idCard...
🔄 [ImgBB] Converting image to base64...
✅ [ImgBB] Image converted to base64, length: 123456
✅ [ImgBB] Image uploaded successfully via Supabase Client: { url: "https://i.ibb.co/...", format: "webp" }
✅ [Image Upload] idCard uploaded successfully: { url: "https://i.ibb.co/...", fullUrl: "https://i.ibb.co/..." }

📤 [Image Upload] Starting upload for selfie...
🔄 [ImgBB] Converting image to base64...
✅ [ImgBB] Image converted to base64, length: 98765
✅ [ImgBB] Image uploaded successfully via Supabase Client: { url: "https://i.ibb.co/...", format: "webp" }
✅ [Image Upload] selfie uploaded successfully: { url: "https://i.ibb.co/...", fullUrl: "https://i.ibb.co/..." }

✅ [Driver Registration] All images uploaded successfully

💾 [Driver Registration] Starting database update... { userId: "...", fullName: "...", phone: "...", ... }
✅ [Driver Registration] Database update successful: { updatedRows: 1, data: {...} }

🔍 [Driver Registration] Verifying saved data...
✅ [Driver Registration] Data verification successful: { id: "...", full_name: "...", phone: "...", idCardUrl: "https://...", selfieUrl: "https://...", approval_status: "pending" }

📧 [Driver Registration] Sending notification to admins...
✅ [Driver Registration] Registration completed successfully, navigating to dashboard
```

### 7. ملاحظات مهمة

- **الصور محفوظة في ImgBB** وليس في Supabase Storage
- **URLs محفوظة في قاعدة البيانات** في حقل `id_card_image_url` و `selfie_image_url`
- **البيانات محفوظة في جدول `profiles`** وليس في `auth.users`
- **حالة المراجعة** هي `pending` حتى يوافق المدير

