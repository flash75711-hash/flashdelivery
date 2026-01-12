-- ============================================
-- التحقق من Push Notifications للسائقين
-- ============================================

-- 1. التحقق من وجود FCM tokens للسائقين النشطين
SELECT 
  id,
  email,
  role,
  status,
  approval_status,
  CASE 
    WHEN fcm_token IS NULL THEN '❌ لا يوجد FCM token'
    WHEN fcm_token = '' THEN '❌ FCM token فارغ'
    ELSE '✅ FCM token موجود'
  END AS fcm_token_status,
  LENGTH(fcm_token) AS token_length,
  updated_at
FROM profiles
WHERE role = 'driver'
  AND status = 'active'
  AND approval_status = 'approved'
ORDER BY updated_at DESC;

-- 2. عدد السائقين الذين لديهم FCM tokens
SELECT 
  COUNT(*) AS total_drivers,
  COUNT(fcm_token) AS drivers_with_fcm_token,
  COUNT(*) - COUNT(fcm_token) AS drivers_without_fcm_token
FROM profiles
WHERE role = 'driver'
  AND status = 'active'
  AND approval_status = 'approved';

-- 3. آخر الإشعارات المرسلة للسائقين
SELECT 
  n.id,
  n.user_id,
  p.email AS driver_email,
  n.title,
  n.message,
  n.type,
  n.order_id,
  n.is_read,
  n.created_at
FROM notifications n
INNER JOIN profiles p ON p.id = n.user_id
WHERE p.role = 'driver'
ORDER BY n.created_at DESC
LIMIT 20;

-- 4. التحقق من الإشعارات المرتبطة بطلبات
SELECT 
  n.id AS notification_id,
  n.user_id AS driver_id,
  p.email AS driver_email,
  n.title,
  n.message,
  n.order_id,
  o.status AS order_status,
  n.created_at AS notification_created_at
FROM notifications n
INNER JOIN profiles p ON p.id = n.user_id
LEFT JOIN orders o ON o.id = n.order_id
WHERE p.role = 'driver'
  AND n.order_id IS NOT NULL
ORDER BY n.created_at DESC
LIMIT 20;

-- 5. السائقين الذين لم يتلقوا إشعارات مؤخراً
SELECT 
  p.id,
  p.email,
  p.status,
  p.approval_status,
  p.fcm_token IS NOT NULL AS has_fcm_token,
  MAX(n.created_at) AS last_notification_date
FROM profiles p
LEFT JOIN notifications n ON n.user_id = p.id
WHERE p.role = 'driver'
  AND p.status = 'active'
  AND p.approval_status = 'approved'
GROUP BY p.id, p.email, p.status, p.approval_status, p.fcm_token
HAVING MAX(n.created_at) IS NULL 
   OR MAX(n.created_at) < NOW() - INTERVAL '1 day'
ORDER BY last_notification_date DESC NULLS LAST;
