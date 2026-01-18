-- تحديث نظام التوريد ليستخدم يوم محدد من كل أسبوع بدلاً من يوم محدد من كل شهر

-- إضافة إعداد يوم التوريد الأسبوعي (0 = الأحد، 1 = الاثنين، ... 6 = السبت)
INSERT INTO app_settings (setting_key, setting_value, setting_type, description, category) VALUES
  ('settlement_day_of_week', '0', 'number', 'يوم التوريد من كل أسبوع (0 = الأحد، 1 = الاثنين، 2 = الثلاثاء، 3 = الأربعاء، 4 = الخميس، 5 = الجمعة، 6 = السبت)', 'settlement')
ON CONFLICT (setting_key) DO UPDATE 
SET setting_value = '0', 
    description = 'يوم التوريد من كل أسبوع (0 = الأحد، 1 = الاثنين، 2 = الثلاثاء، 3 = الأربعاء، 4 = الخميس، 5 = الجمعة، 6 = السبت)';

-- تم حذف الإعداد القديم 'settlement_day' من قاعدة البيانات
