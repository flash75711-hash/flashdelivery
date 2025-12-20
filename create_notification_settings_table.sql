-- ============================================
-- إنشاء جدول إعدادات الإشعارات
-- ============================================
-- نفذ هذا الملف في Supabase SQL Editor

-- جدول notification_settings (إعدادات الإشعارات)
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  driver_status_changes BOOLEAN DEFAULT true,
  customer_registrations BOOLEAN DEFAULT true,
  order_updates BOOLEAN DEFAULT true,
  general_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء Index لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- ============================================
-- RLS Policies (Row Level Security)
-- ============================================

-- تفعيل RLS
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- المستخدمون يمكنهم قراءة وتحديث إعداداتهم فقط
CREATE POLICY "Users can read own notification settings"
ON notification_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
ON notification_settings FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- المستخدمون يمكنهم إنشاء إعداداتهم
CREATE POLICY "Users can insert own notification settings"
ON notification_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- دالة مساعدة للتحقق من حالة الإشعارات
-- ============================================
CREATE OR REPLACE FUNCTION should_send_notification(
  p_user_id UUID,
  p_notification_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_settings notification_settings%ROWTYPE;
BEGIN
  -- جلب إعدادات المستخدم
  SELECT * INTO v_settings
  FROM notification_settings
  WHERE user_id = p_user_id;
  
  -- إذا لم توجد إعدادات، افترض أن الإشعارات مفعلة
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- إذا كانت الإشعارات معطلة بالكامل
  IF NOT v_settings.enabled THEN
    RETURN false;
  END IF;
  
  -- التحقق من نوع الإشعار
  CASE p_notification_type
    WHEN 'driver_status_change' THEN
      RETURN v_settings.driver_status_changes;
    WHEN 'customer_registration' THEN
      RETURN v_settings.customer_registrations;
    WHEN 'order_update' THEN
      RETURN v_settings.order_updates;
    WHEN 'general' THEN
      RETURN v_settings.general_notifications;
    ELSE
      RETURN true; -- افتراضي: إرسال الإشعار
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;




