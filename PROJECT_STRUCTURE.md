# Project Structure - بنية المشروع

توثيق شامل لجميع الصفحات والمكونات في المشروع.

---

## 📁 البنية العامة (General Structure)

```
flash/
├── app/                    # صفحات التطبيق (Expo Router)
├── components/             # المكونات القابلة لإعادة الاستخدام
├── constants/              # الثوابت والألوان والثيمات
├── contexts/               # React Contexts
├── hooks/                  # Custom React Hooks
├── i18n/                   # ملفات الترجمة (i18n)
├── lib/                    # المكتبات والمساعدات
├── supabase/               # Edge Functions
├── utils/                  # مساعدات وأدوات
├── assets/                 # الصور والملفات الثابتة
└── migrations/             # ملفات SQL للهجرة
```

---

## 🎯 الصفحات الرئيسية (Main App Pages)

### 📂 `app/_layout.tsx`
**نوع:** Root Layout  
**الوصف:** تخطيط الجذر - يحتوي على AuthProvider وI18nextProvider  
**الميزات:**
- Deep link handling للـ OAuth
- Global CSS styles (M3 Material Design 3)
- Stack navigation configuration

---

## 🔐 صفحات المصادقة (Auth Pages)

### `app/(auth)/login.tsx`
**نوع:** Login Screen  
**المسار:** `/login`  
**الوصف:** شاشة تسجيل الدخول باستخدام رقم الموبايل و PIN  
**المكونات المستخدمة:**
- `PinInput` - إدخال PIN
- M3 Theme buttons و inputs
**الحالة:** ✅ محدث بـ M3

### `app/(auth)/register.tsx`
**نوع:** Register Screen  
**المسار:** `/register`  
**الوصف:** شاشة التسجيل - اختيار الدور (Customer/Driver/Vendor/Admin)  
**المكونات المستخدمة:**
- Role selection cards
- Phone number input
- PIN confirmation
**الحالة:** ✅ محدث بـ M3

### `app/(auth)/forgot-pin.tsx`
**نوع:** Forgot PIN Screen  
**المسار:** `/forgot-pin`  
**الوصف:** استعادة PIN المنسي

---

## 👤 صفحات العميل (Customer Pages)

### `app/(tabs)/customer/home.tsx`
**نوع:** Customer Home  
**المسار:** `/customer/home`  
**الوصف:** الشاشة الرئيسية للعميل  
**المكونات:**
- `CurrentLocationDisplay` - عرض الموقع الحالي
- `NotificationCard` - بطاقة الإشعارات
- Order type cards (توصيل طلب / طلب شراء)
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/customer/my-orders.tsx`
**نوع:** My Orders  
**المسار:** `/customer/my-orders`  
**الوصف:** قائمة طلبات العميل النشطة والمكتملة  
**المكونات المستخدمة:**
- `OrderCard` - بطاقة الطلب
- `OrderTypeCards` - بطاقات أنواع الطلبات
- `CompletedOrdersCard` - بطاقة الطلبات المكتملة
**الميزات:**
- تقسيم الطلبات إلى نشطة ومكتملة
- Pull to refresh
- إعادة البحث عن سائق
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/customer/history.tsx`
**نوع:** Order History  
**المسار:** `/customer/history`  
**الوصف:** سجل الطلبات المكتملة والملغاة  
**المكونات:**
- FlatList للطلبات
- Order cards مع تفاصيل كاملة
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/customer/profile.tsx`
**نوع:** Customer Profile  
**المسار:** `/customer/profile`  
**الوصف:** الملف الشخصي للعميل - إدارة العناوين والبيانات  
**الميزات:**
- إدارة العناوين (إضافة/تعديل/حذف)
- تحديد العنوان الافتراضي
- دليل الأماكن (`places-directory`)
- رصيد المحفظة (عرض فقط)
**الحالة:** ✅ محدث بـ M3

### `app/customer/track-order.tsx`
**نوع:** Track Order (مخفي من tabs)  
**المسار:** `/customer/track-order?orderId=...`  
**الوصف:** تتبع الطلب في الوقت الفعلي - خريطة ورسم الطريق

### `app/customer/places-directory.tsx`
**نوع:** Places Directory (مخفي من tabs)  
**المسار:** `/customer/places-directory`  
**الوصف:** دليل الأماكن - خريطة Google مع iframe

---

## 🚗 صفحات السائق (Driver Pages)

### `app/(tabs)/driver/dashboard.tsx`
**نوع:** Driver Dashboard  
**المسار:** `/driver/dashboard`  
**الوصف:** الشاشة الرئيسية للسائق  
**المكونات:**
- Online/Offline toggle switch
- Current location display
- Wallet balance
- Statistics cards (عدد الطلبات، الرصيد)
- Settlement status check (تعطيل الزر إذا مر يوم التوريد)
**الميزات:**
- التحقق من حالة التوريد تلقائياً
- Realtime location updates
- Notification cards
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/driver/trips.tsx`
**نوع:** Available Trips  
**المسار:** `/driver/trips`  
**الوصف:** قائمة الرحلات المتاحة للقبول  
**المكونات:**
- `OrderCard` - بطاقات الطلبات المتاحة
- Sections (متاحة / نشطة)
**الميزات:**
- Pull to refresh
- Realtime order updates
- قبول/رفض/تفاوض على الطلبات
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/driver/wallet.tsx`
**نوع:** Driver Wallet  
**المسار:** `/driver/wallet`  
**الوصف:** محفظة السائق - المعاملات والعمولات  
**المكونات:**
- Balance card (إجمالي الرصيد)
- Statistics (الإيرادات، العمولة، الخصومات)
- Transaction list (FlatList)
- Settlement button (زر توريد العمولة)
- Settlement modal (طلب التوريد)
**الميزات:**
- حساب العمولة المستحقة للتوريد
- التحقق من يوم التوريد
- التحقق من طلبات التوريد المعلقة
- Realtime balance updates
- Upload receipt image (ImgBB)
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/driver/history.tsx`
**نوع:** Driver Order History  
**المسار:** `/driver/history`  
**الوصف:** سجل رحلات السائق المكتملة

### `app/(tabs)/driver/my-orders.tsx`
**نوع:** Driver My Orders (مخفي من tabs)  
**المسار:** `/driver/my-orders`  
**الوصف:** طلبات السائق النشطة - يستخدم OrderSearchCountdown

---

## 🏪 صفحات التاجر (Vendor Pages)

### `app/(tabs)/vendor/store.tsx`
**نوع:** Vendor Store  
**المسار:** `/vendor/store`  
**الوصف:** إدارة متجر التاجر - معلومات المتجر

### `app/(tabs)/vendor/history.tsx`
**نوع:** Vendor History  
**المسار:** `/vendor/history`  
**الوصف:** سجل الطلبات للتاجر

### `app/(tabs)/vendor/profile.tsx`
**نوع:** Vendor Profile  
**المسار:** `/vendor/profile`  
**الوصف:** الملف الشخصي للتاجر

---

## 👨‍💼 صفحات الإدارة (Admin Pages)

### `app/(tabs)/admin/dashboard.tsx`
**نوع:** Admin Dashboard  
**المسار:** `/admin/dashboard`  
**الوصف:** لوحة تحكم الإدارة - إحصائيات عامة

### `app/(tabs)/admin/drivers.tsx`
**نوع:** Drivers Management  
**المسار:** `/admin/drivers`  
**الوصف:** إدارة السائقين - الموافقة/الرفض/التعليق  
**الميزات:**
- Filter buttons (الكل / في انتظار الموافقة / معتمدين / معطلين)
- Driver cards مع actions
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/admin/accounting.tsx`
**نوع:** Accounting  
**المسار:** `/admin/accounting`  
**الوصف:** المحاسبة - إدارة المحافظ والعمولات

### `app/(tabs)/admin/orders.tsx`
**نوع:** Orders Management (مخفي من tabs)  
**المسار:** `/admin/orders`  
**الوصف:** إدارة جميع الطلبات

### `app/(tabs)/admin/my-orders.tsx`
**نوع:** Admin My Orders  
**المسار:** `/admin/my-orders`  
**الوصف:** طلبات الإدارة

### `app/(tabs)/admin/places.tsx`
**نوع:** Places Management  
**المسار:** `/admin/places`  
**الوصف:** إدارة الأماكن - دليل الأماكن مع Google Maps iframe

### `app/(tabs)/admin/places-sync-settings.tsx`
**نوع:** Places Sync Settings (مخفي من tabs)  
**المسار:** `/admin/places-sync-settings`  
**الوصف:** إعدادات مزامنة الأماكن مع Google Places API

### `app/(tabs)/admin/search-settings.tsx`
**نوع:** Search Settings (مخفي من tabs)  
**المسار:** `/admin/search-settings`  
**الوصف:** إعدادات البحث عن السائقين (مدة البحث، إلخ)

### `app/(tabs)/admin/settings.tsx`
**نوع:** Admin Settings (مخفي من tabs)  
**المسار:** `/admin/settings`  
**الوصف:** الإعدادات العامة للإدارة  
**الميزات:**
- Payment info (معلومات الدفع للتوريد)
- Settlement day of week (يوم التوريد)
- App settings (إعدادات التطبيق)
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/admin/settlement-requests.tsx`
**نوع:** Settlement Requests (مخفي من tabs)  
**المسار:** `/admin/settlement-requests`  
**الوصف:** مراجعة طلبات التوريد من السائقين  
**الميزات:**
- عرض جميع طلبات التوريد
- Approve/Reject buttons
- عرض صورة الوصل (مع modal)
- تفاصيل السائق والعمولة
**الحالة:** ✅ محدث بـ M3

### `app/(tabs)/admin/users.tsx`
**نوع:** Users Management  
**المسار:** `/admin/users`  
**الوصف:** إدارة المستخدمين

---

## 🧩 المكونات (Components)

### `components/OrderCard.tsx`
**الوصف:** بطاقة عرض الطلب - يعرض تفاصيل الطلب وأزرار الإجراءات  
**الاستخدام:** في قوائم الطلبات (trips, my-orders, history)  
**الميزات:**
- عرض معلومات الطلب (العنوان، السعر، الحالة)
- أزرار الإجراءات (قبول/رفض/تفاوض/إلغاء)
- Negotiation UI (للتفاوض على السعر)
- Order search countdown integration
- Multi-point order support
**الحالة:** ✅ محدث بـ M3

### `components/OrderSearchCountdown.tsx`
**الوصف:** عداد تنازلي للبحث عن سائق - يتحقق من انتهاء وقت البحث  
**الاستخدام:** في OrderCard و my-orders screens  
**الميزات:**
- Countdown timer
- إعادة البحث عن سائق
- Realtime updates

### `components/NotificationCard.tsx`
**الوصف:** بطاقة عرض الإشعارات - قائمة الإشعارات غير المقروءة  
**الاستخدام:** في dashboards (customer/home, driver/dashboard)  
**الميزات:**
- عرض الإشعارات الحديثة
- Mark as read

### `components/FloatingNotification.tsx`
**الوصف:** إشعار عائم - يظهر في الأعلى للإشعارات المهمة  
**الاستخدام:** Global (في _layout.tsx)  
**الميزات:**
- Slide animation
- Type-based colors (success/error/warning/info)
- Auto-dismiss
- Navigate to order on click
**الحالة:** ✅ محدث بـ M3

### `components/FloatingOrderNotification.tsx`
**الوصف:** إشعار عائم للطلبات - عند إنشاء طلب جديد أو تغيير حالة  
**الاستخدام:** Web only - في _layout.tsx  
**الميزات:**
- Order-specific notifications
- Accept/Reject buttons

### `components/PinInput.tsx`
**الوصف:** حقل إدخال PIN - 4 خانات  
**الاستخدام:** login.tsx, register.tsx

### `components/CurrentLocationDisplay.tsx`
**الوصف:** عرض الموقع الحالي - يعرض العنوان الحالي للمستخدم  
**الاستخدام:** customer/home, driver/dashboard  
**الميزات:**
- Reverse geocoding
- Manual refresh
- Location updates

### `components/OrderTypeCards.tsx`
**الوصف:** بطاقات أنواع الطلبات - اختيار نوع الطلب  
**الاستخدام:** customer/my-orders (عند عدم وجود طلبات)

### `components/CompletedOrdersCard.tsx`
**الوصف:** بطاقة الطلبات المكتملة - ملخص الطلبات المكتملة  
**الاستخدام:** customer/my-orders

---

## 🗄️ قاعدة البيانات (Database Tables)

### `orders`
**الوصف:** جدول الطلبات  
**الأعمدة الرئيسية:**
- `id`, `customer_id`, `driver_id`
- `status` (pending, accepted, pickedUp, inTransit, completed, cancelled)
- `order_type` (package, outside)
- `pickup_address`, `delivery_address`
- `total_fee`, `negotiated_price`
- `search_status` (searching, stopped, expanded)
- `search_started_at`, `search_expires_at`

### `wallets`
**الوصف:** جدول المحافظ - المعاملات المالية  
**الأعمدة الرئيسية:**
- `driver_id`, `order_id`
- `type` (earning, deduction)
- `amount`, `commission`
- `commission_paid`, `settlement_date`

### `settlement_requests`
**الوصف:** طلبات توريد العمولة  
**الأعمدة الرئيسية:**
- `driver_id`, `total_commission`
- `receipt_image_url`
- `status` (pending, approved, rejected)
- `rejection_reason`

### `notifications`
**الوصف:** جدول الإشعارات  
**الأعمدة الرئيسية:**
- `user_id`, `order_id`
- `title`, `message`, `type`
- `is_read`, `created_at`

### `profiles`
**الوصف:** الملفات الشخصية للمستخدمين  
**الأعمدة الرئيسية:**
- `id`, `role` (customer, driver, vendor, admin)
- `full_name`, `phone`
- `approval_status` (pending, approved, rejected)
- `status` (active, suspended)
- `is_online` (للسائقين)

### `app_settings`
**الوصف:** إعدادات التطبيق العامة  
**الأعمدة الرئيسية:**
- `setting_key`, `setting_value`
- مثال: `settlement_day_of_week`, `payment_info`

---

## ⚙️ Edge Functions (Supabase)

### `supabase/functions/create-order/index.ts`
**الوصف:** إنشاء طلب جديد  
**المسار:** `/functions/v1/create-order`  
**الاستخدام:** عند إنشاء طلب من العميل

### `supabase/functions/update-order/index.ts`
**الوصف:** تحديث حالة الطلب  
**المسار:** `/functions/v1/update-order`  
**الاستخدام:** قبول الطلب، تحديث الحالة

### `supabase/functions/start-order-search/index.ts`
**الوصف:** بدء البحث عن سائق  
**المسار:** `/functions/v1/start-order-search`

### `supabase/functions/stop-order-search/index.ts`
**الوصف:** إيقاف البحث عن سائق  
**المسار:** `/functions/v1/stop-order-search`

### `supabase/functions/expand-order-search/index.ts`
**الوصف:** توسيع نطاق البحث  
**المسار:** `/functions/v1/expand-order-search`

### `supabase/functions/get-driver-wallet/index.ts`
**الوصف:** جلب بيانات محفظة السائق  
**المسار:** `/functions/v1/get-driver-wallet`  
**الاستخدام:** driver/wallet.tsx

### `supabase/functions/deduct-from-driver-wallet/index.ts`
**الوصف:** خصم من محفظة السائق  
**المسار:** `/functions/v1/deduct-from-driver-wallet`

### `supabase/functions/settle-commissions/index.ts`
**الوصف:** تسوية العمولات بعد الموافقة على التوريد  
**المسار:** `/functions/v1/settle-commissions`

### `supabase/functions/create-settlement-request/index.ts`
**الوصف:** إنشاء طلب توريد من السائق  
**المسار:** `/functions/v1/create-settlement-request`  
**الاستخدام:** driver/wallet.tsx (Settlement modal)

### `supabase/functions/review-settlement-request/index.ts`
**الوصف:** مراجعة طلب التوريد (Approve/Reject)  
**المسار:** `/functions/v1/review-settlement-request`  
**الاستخدام:** admin/settlement-requests.tsx

### `supabase/functions/get-settlement-requests/index.ts`
**الوصف:** جلب جميع طلبات التوريد (للمدير)  
**المسار:** `/functions/v1/get-settlement-requests`  
**الاستخدام:** admin/settlement-requests.tsx

### `supabase/functions/get-settlement-payment-info/index.ts`
**الوصف:** جلب معلومات الدفع للتوريد  
**المسار:** `/functions/v1/get-settlement-payment-info`  
**الاستخدام:** driver/wallet.tsx (Settlement modal)

### `supabase/functions/upload-image/index.ts`
**الوصف:** رفع صورة إلى ImgBB  
**المسار:** `/functions/v1/upload-image`  
**الاستخدام:** رفع صورة الوصل

---

## 📚 Hooks (Custom Hooks)

### `hooks/useMyOrders.ts`
**الوصف:** Hook لجلب طلبات المستخدم  
**الاستخدام:** customer/my-orders, driver/my-orders

### `hooks/useFloatingNotifications.ts`
**الوصف:** Hook للإشعارات العائمة  
**الاستخدام:** Global في _layout.tsx

### `hooks/useOrderNotifications.ts`
**الوصف:** Hook لإشعارات الطلبات  
**الاستخدام:** Web only - في _layout.tsx

---

## 🎨 Themes & Constants

### `constants/M3Theme.ts` ⭐ NEW
**الوصف:** نظام Material Design 3 الكامل  
**المحتويات:**
- M3 Colors (Primary, Secondary, Surface, Error, etc.)
- Typography scale (14px base, 16px inputs)
- Spacing system (16px mobile-first)
- Shape system (16px corner radius)
- Elevation system (subtle shadows)
- Touch targets (44x44px minimum)
- Button variants (Filled, Tonal, Outlined, Text)
- Status styles (Tonal palettes)
**الحالة:** ✅ Ready for use

### `constants/Colors.ts`
**الوصف:** نظام الألوان (Legacy + M3)  
**الحالة:** ✅ محدث مع M3 colors (backward compatible)

---

## 🛠️ Utilities

### `utils/responsive.ts`
**الوصف:** مساعدات Responsive Design  
**الدوال:**
- `getResponsivePadding()` → الآن 16px (M3)
- `getResponsiveFontSize()` → 14px minimum
- `getM3HorizontalPadding()` → 16px (NEW)
- `getM3CardStyle()` → Elevated card style (NEW)
- `getM3ButtonStyle(fullWidth)` → Button with 48px height (NEW)
- `getM3TouchTarget(size)` → 44x44px minimum (NEW)
- `createShadowStyle()` → Shadow for cards

### `lib/supabase.ts`
**الوصف:** إعداد Supabase client  
**الميزات:**
- Auth helpers
- `isRegistrationComplete()` check

### `lib/pinAuth.ts`
**الوصف:** Authentication باستخدام PIN  
**الدوال:**
- `loginWithPin()`
- `registerWithPin()`
- `checkPhoneExists()`

### `lib/imgbb.ts`
**الوصف:** رفع الصور إلى ImgBB  
**الدوال:**
- `uploadImageToImgBB()`

---

## 🌐 Navigation (Tabs Layout)

### `app/(tabs)/_layout.tsx`
**الوصف:** Bottom Navigation Bar configuration  
**الميزات:**
- Role-based tab visibility
- M3-style navigation (تم تحديثه جزئياً)
- Tab icons و labels
- Responsive tab bar

**Tabs Visible:**
- **Customer:** Home, My Orders, History, Profile
- **Driver:** Dashboard, Trips, Wallet, History
- **Vendor:** Store, History, Profile
- **Admin:** Dashboard, Drivers, Accounting, Places, My Orders, Users

---

## 📋 صفحات مخفية من Navigation

الصفحات التالية موجودة لكن مخفية من Bottom Navigation:
- `admin/orders`
- `admin/search-settings`
- `admin/settings`
- `admin/settlement-requests`
- `admin/places-sync-settings`
- `driver/my-orders`
- `customer/track-order`
- `customer/places-directory`

يمكن الوصول إليها عبر الروابط المباشرة أو Navigation programmatic.

---

## 📊 حالة التحديثات (M3 Status)

### ✅ محدث بالكامل بـ M3:
1. OrderCard
2. FloatingNotification
3. Driver Dashboard
4. Customer Home
5. Login
6. Register

### ✅ محدث جزئياً (Container, Header, Typography):
7. Customer: my-orders, history, profile
8. Driver: trips, wallet
9. Admin: settlement-requests, drivers, settings

### 📝 قالب للتحديث:
جميع الملفات الأخرى يمكن تحديثها باستخدام:
- `M3_REFACTORING_GUIDE.md` - دليل شامل
- `M3_QUICK_UPDATE_GUIDE.md` - دليل سريع

---

## 🔄 Data Flow

### Order Flow:
1. **Customer** يخلق طلب → `create-order` Edge Function
2. **System** يبدأ البحث → `start-order-search`
3. **Driver** يقبل الطلب → `update-order` (status = accepted)
4. **Driver** يبدأ الرحلة → `update-order` (status = pickedUp/inTransit)
5. **Driver** يكمل → `update-order` (status = completed)
6. **System** يضيف للـ wallet (earning + deduction)

### Settlement Flow:
1. **Driver** يضغط "توريد العمولة" → `create-settlement-request`
2. **System** يرفع صورة الوصل → `upload-image` (ImgBB)
3. **Admin** يراجع → `review-settlement-request`
4. **System** يسوي العمولات → `settle-commissions` (إذا approved)

---

## 📱 Platform Support

- **Web:** ✅ Full support (WebView optimized)
- **iOS:** ✅ Supported
- **Android:** ✅ Supported

**WebView Optimizations:**
- 16px minimum font (prevents iOS auto-zoom)
- No hover states
- user-select: none on buttons
- 44x44px minimum touch targets

---

## 🎨 Design System

**Material Design 3 (M3):**
- Primary Color: `#6750A4` (Purple)
- Surface: `#FFFBFE`
- Typography: 14px base, 16px inputs
- Spacing: 16px horizontal padding
- Cards: 16px radius, subtle shadow
- Buttons: 48px min height for primary

---

## 📝 ملاحظات مهمة

1. **RLS Policies:** بعض الجداول تستخدم RLS - Edge Functions تستخدم SERVICE_ROLE_KEY لتجاوز RLS
2. **Realtime:** استخدام Supabase Realtime للـ wallets و orders
3. **Caching:** بعض البيانات محفوظة في localStorage (مثل is_online)
4. **Image Upload:** استخدام ImgBB لرفع الصور (ليس Supabase Storage)

---

**آخر تحديث:** تم تطبيق Material Design 3 على معظم الصفحات الأساسية.
