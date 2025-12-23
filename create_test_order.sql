-- إنشاء طلب تجريبي جديد للاختبار
-- ==================================

-- أولاً: الحصول على معرف عميل موجود
DO $$
DECLARE
  v_customer_id UUID;
  v_new_order_id UUID;
  v_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  -- الحصول على أول عميل في قاعدة البيانات
  SELECT id INTO v_customer_id 
  FROM profiles 
  WHERE role = 'customer' 
  LIMIT 1;
  
  -- إذا لم يوجد عميل، نستخدم معرف عشوائي (للاختبار فقط)
  IF v_customer_id IS NULL THEN
    -- إنشاء عميل تجريبي
    INSERT INTO profiles (id, role, full_name, phone)
    VALUES (
      gen_random_uuid(),
      'customer',
      'عميل تجريبي',
      '+201234567890'
    )
    RETURNING id INTO v_customer_id;
    
    RAISE NOTICE 'تم إنشاء عميل تجريبي: %', v_customer_id;
  ELSE
    RAISE NOTICE 'استخدام عميل موجود: %', v_customer_id;
  END IF;
  
  -- حساب الـ deadline (30 ثانية من الآن)
  v_deadline := NOW() + INTERVAL '30 seconds';
  
  -- إنشاء الطلب الجديد
  INSERT INTO orders (
    id,
    customer_id,
    order_type,
    pickup_address,
    delivery_address,
    package_description,
    total_fee,
    status,
    driver_response_deadline,
    retry_count,
    last_retry_at,
    search_status,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_customer_id,
    'package',
    'شارع التحرير، المنصورة',
    'شارع الجمهورية، المنصورة',
    'طرد صغير - اختبار النظام',
    50.00,
    'pending',
    v_deadline,
    0,
    NOW(),
    'searching',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_order_id;
  
  RAISE NOTICE '✅ تم إنشاء طلب جديد بنجاح!';
  RAISE NOTICE 'معرف الطلب: %', v_new_order_id;
  RAISE NOTICE 'الوقت النهائي للرد: %', v_deadline;
  RAISE NOTICE 'الوقت المتبقي: 30 ثانية';
  
  -- إنشاء إشعار للسائقين (اختياري)
  -- يمكنك تفعيل هذا إذا أردت اختبار الإشعارات أيضاً
  /*
  INSERT INTO notifications (
    id,
    user_id,
    title,
    message,
    type,
    order_id,
    is_read,
    created_at
  )
  SELECT 
    gen_random_uuid(),
    p.id,
    'طلب توصيل جديد',
    'يوجد طلب توصيل جديد في منطقتك',
    'info',
    v_new_order_id,
    false,
    NOW()
  FROM profiles p
  WHERE p.role = 'driver';
  
  RAISE NOTICE '📢 تم إرسال إشعارات لجميع السائقين';
  */
  
END $$;

-- عرض تفاصيل الطلب المُنشأ
SELECT 
  id as "معرف_الطلب",
  order_type as "نوع_الطلب",
  pickup_address as "عنوان_الاستلام",
  delivery_address as "عنوان_التوصيل",
  total_fee as "الأجرة",
  status as "الحالة",
  driver_response_deadline as "الوقت_النهائي",
  EXTRACT(EPOCH FROM (driver_response_deadline - NOW())) as "الثواني_المتبقية"
FROM orders 
WHERE status = 'pending' 
  AND driver_response_deadline > NOW()
ORDER BY created_at DESC 
LIMIT 1;











