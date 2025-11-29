-- ============================================
-- Supabase Storage Policies - صور السائقين
-- ============================================

-- السماح للسائقين برفع ملفاتهم
CREATE POLICY "Drivers can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- السماح للسائقين بقراءة ملفاتهم
CREATE POLICY "Drivers can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- السماح للسائقين بتحديث ملفاتهم
CREATE POLICY "Drivers can update own documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- السماح للسائقين بحذف ملفاتهم
CREATE POLICY "Drivers can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- المديرون يمكنهم قراءة جميع الملفات
CREATE POLICY "Admins can read all driver documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'driver-documents' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

