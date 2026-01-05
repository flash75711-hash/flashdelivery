#!/bin/bash

# نشر Edge Function: login-with-pin
# يتطلب: SUPABASE_ACCESS_TOKEN في متغيرات البيئة

PROJECT_REF="tnwrmybyvimlsamnputn"
FUNCTION_NAME="login-with-pin"

echo "🚀 نشر Edge Function: $FUNCTION_NAME"

# التحقق من وجود token
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ خطأ: SUPABASE_ACCESS_TOKEN غير موجود"
  echo "يرجى تعيينه باستخدام:"
  echo "export SUPABASE_ACCESS_TOKEN=your_token_here"
  echo ""
  echo "أو يمكنك النشر من Supabase Dashboard:"
  echo "1. اذهب إلى: https://supabase.com/dashboard/project/$PROJECT_REF/functions"
  echo "2. اضغط على 'Deploy new function'"
  echo "3. ارفع مجلد: supabase/functions/login-with-pin"
  exit 1
fi

# نشر Edge Function
supabase functions deploy $FUNCTION_NAME --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
  echo "✅ تم نشر Edge Function بنجاح!"
else
  echo "❌ فشل نشر Edge Function"
  exit 1
fi

