-- التحقق من السائقين في نطاق 5 كيلو من نقطة معينة
-- استبدل LAT و LON بالقيم المطلوبة

-- مثال: نقطة في الرياض
-- LAT: 24.7136, LON: 46.6753

-- 1. التحقق من السائقين في النطاق
SELECT 
  p.id AS driver_id,
  p.email,
  p.phone,
  dl.latitude,
  dl.longitude,
  dl.updated_at AS last_location_update,
  -- حساب المسافة (تقريبي)
  (
    6371 * acos(
      cos(radians(24.7136)) * 
      cos(radians(dl.latitude)) * 
      cos(radians(dl.longitude) - radians(46.6753)) + 
      sin(radians(24.7136)) * 
      sin(radians(dl.latitude))
    )
  ) AS distance_km,
  p.fcm_token IS NOT NULL AS has_fcm_token
FROM profiles p
JOIN driver_locations dl ON p.id = dl.driver_id
WHERE p.role = 'driver' 
  AND p.status = 'active'
  AND dl.latitude IS NOT NULL
  AND dl.longitude IS NOT NULL
  -- استخدام RPC function للتحقق من النطاق
  AND (
    SELECT COUNT(*)
    FROM find_drivers_in_radius(
      24.7136,  -- LAT
      46.6753,  -- LON
      5.0       -- RADIUS_KM
    ) AS drivers
    WHERE drivers.driver_id = p.id
  ) > 0
ORDER BY distance_km ASC;

-- 2. استخدام RPC function مباشرة
SELECT * FROM find_drivers_in_radius(
  24.7136,  -- LAT (استبدل بالقيمة المطلوبة)
  46.6753,  -- LON (استبدل بالقيمة المطلوبة)
  5.0       -- RADIUS_KM (5 كيلو)
);

-- 3. التحقق من FCM Tokens للسائقين في النطاق
SELECT 
  p.id AS driver_id,
  p.email,
  p.fcm_token IS NOT NULL AS has_fcm_token,
  CASE 
    WHEN p.fcm_token IS NULL THEN '❌ No FCM Token'
    WHEN LENGTH(p.fcm_token) < 10 THEN '⚠️ Invalid FCM Token'
    ELSE '✅ Valid FCM Token'
  END AS fcm_status,
  dl.latitude,
  dl.longitude
FROM profiles p
JOIN driver_locations dl ON p.id = dl.driver_id
WHERE p.role = 'driver' 
  AND p.status = 'active'
  AND dl.latitude IS NOT NULL
  AND dl.longitude IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM find_drivers_in_radius(
      24.7136,  -- LAT
      46.6753,  -- LON
      5.0       -- RADIUS_KM
    ) AS drivers
    WHERE drivers.driver_id = p.id
  ) > 0;

-- 4. إحصائيات سريعة
SELECT 
  COUNT(*) AS total_drivers_in_radius,
  COUNT(CASE WHEN p.fcm_token IS NOT NULL THEN 1 END) AS drivers_with_fcm_token,
  COUNT(CASE WHEN p.fcm_token IS NULL THEN 1 END) AS drivers_without_fcm_token
FROM profiles p
JOIN driver_locations dl ON p.id = dl.driver_id
WHERE p.role = 'driver' 
  AND p.status = 'active'
  AND dl.latitude IS NOT NULL
  AND dl.longitude IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM find_drivers_in_radius(
      24.7136,  -- LAT
      46.6753,  -- LON
      5.0       -- RADIUS_KM
    ) AS drivers
    WHERE drivers.driver_id = p.id
  ) > 0;
