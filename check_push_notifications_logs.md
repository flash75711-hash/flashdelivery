# كيفية فحص Logs الخاصة بـ Push Notifications

## 1. فحص Logs في Supabase Dashboard

### أ. Edge Function `start-order-search`
1. اذهب إلى **Supabase Dashboard**
2. **Edge Functions** → **start-order-search**
3. **Logs** tab
4. ابحث عن:
   ```
   [start-order-search] ========== Function called ==========
   [start-order-search] Found X drivers in initial radius (5 km)
   [start-order-search] Sending push notification to driver ...
   ✅ [start-order-search] Push notification sent to driver ...
   ```

### ب. Edge Function `send-push-notification`
1. **Edge Functions** → **send-push-notification**
2. **Logs** tab
3. ابحث عن:
   ```
   ✅ Push notification sent successfully to X device(s)
   ⚠️ No devices found or push notification not sent
   ```

### ج. Edge Function `create-order`
1. **Edge Functions** → **create-order**
2. **Logs** tab
3. ابحث عن:
   ```
   [create-order] Starting search for order ...
   ✅ [create-order] Started automatic search for order ...
   ```

## 2. استخدام MCP (Model Context Protocol)

إذا كان لديك MCP متصل:
```javascript
// في Cursor أو IDE
mcp_Flashsupabase_get_logs({ service: 'edge-function' })
```

## 3. فحص Logs عبر Supabase CLI

```bash
# تثبيت Supabase CLI (إذا لم يكن مثبتاً)
npm install -g supabase

# تسجيل الدخول
supabase login

# ربط المشروع
supabase link --project-ref YOUR_PROJECT_REF

# عرض Logs
supabase functions logs start-order-search
supabase functions logs send-push-notification
supabase functions logs create-order
```

## 4. فحص Logs في Vercel (إذا كان مستضافاً هناك)

1. اذهب إلى **Vercel Dashboard**
2. اختر المشروع
3. **Functions** → **Logs**
4. ابحث عن Edge Function calls

## 5. ما الذي تبحث عنه في Logs

### ✅ علامات النجاح:
- `[start-order-search] Found X drivers in initial radius (5 km)`
- `✅ [start-order-search] Push notification sent to driver ...`
- `✅ Push notification sent successfully to X device(s)`

### ⚠️ علامات التحذير:
- `⚠️ [start-order-search] Push notification not sent to driver ...`
- `⚠️ No devices found or push notification not sent`
- `[start-order-search] Found 0 drivers in initial radius (5 km)`

### ❌ علامات الخطأ:
- `❌ [start-order-search] Error sending push notification to driver ...`
- `❌ [create-order] Error starting order search`
- `Error: FCM_SERVICE_ACCOUNT_JSON is not set`

## 6. نصائح للبحث في Logs

1. **استخدم الفلاتر:**
   - Filter by function name
   - Filter by timestamp
   - Filter by log level (error, warn, info)

2. **ابحث عن patterns:**
   - `[start-order-search]` - جميع logs من start-order-search
   - `Push notification` - جميع logs المتعلقة بـ Push Notifications
   - `driver` - جميع logs المتعلقة بالسائقين

3. **رتب حسب الوقت:**
   - ابدأ من الأحدث إلى الأقدم
   - ابحث عن logs قريبة من وقت إنشاء الطلب

## 7. مثال على Logs الناجحة

```
[2024-01-15 10:30:00] [start-order-search] ========== Function called ==========
[2024-01-15 10:30:00] [start-order-search] Environment variables loaded
[2024-01-15 10:30:00] [start-order-search] Request received: { order_id: "...", search_point: { lat: 24.7136, lon: 46.6753 } }
[2024-01-15 10:30:01] [start-order-search] Searching for drivers in radius 5 km from point (24.7136, 46.6753)
[2024-01-15 10:30:01] [start-order-search] ✅ Found 3 drivers in initial radius (5 km)
[2024-01-15 10:30:01] [start-order-search] Notifying driver abc123...
[2024-01-15 10:30:01] [start-order-search] ✅ In-app notification created for driver abc123
[2024-01-15 10:30:01] [start-order-search] Sending push notification to driver abc123...
[2024-01-15 10:30:02] ✅ [start-order-search] Push notification sent to driver abc123
```

## 8. إذا لم تجد Logs

1. **تأكد من أن Edge Functions مُفعّلة:**
   - Supabase Dashboard → Edge Functions → يجب أن تكون Functions موجودة

2. **تحقق من Environment Variables:**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FCM_SERVICE_ACCOUNT_JSON`

3. **تحقق من أن Functions تم deployها:**
   - Supabase Dashboard → Edge Functions → يجب أن تكون Functions موجودة ومُفعّلة

4. **تحقق من Permissions:**
   - تأكد من أن Service Role Key لديه صلاحيات كافية
