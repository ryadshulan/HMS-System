# HMS System

نظام موقع ولوحة تحكم لشركة النجم الحديث للشحن، مبني على Node.js وMongoDB مع لوحة إدارة React، تتبع مراحل الشحن، قاعدة عملاء، أخبار، وإشعارات WhatsApp Cloud API.

## المزايا

- صفحة عامة لتتبع الشحنات وعرض الأخبار والخدمات.
- لوحة تحكم محمية بتسجيل دخول JWT وملفات Cookie آمنة.
- استرجاع كلمة المرور برمز مؤقت عبر واتساب أو البريد، مع إبطال الجلسات القديمة بعد التغيير.
- إدارة الشحنات عبر مراحل لوجستية واضحة من مخازن الصين حتى مستودعات عدن.
- قاعدة بيانات عملاء مرتبطة بأرقام الحاويات.
- إرسال إشعار WhatsApp عند اكتمال مرحلة الاستلام في مستودعات عدن.
- إدارة الأخبار ورفع الصور.
- تصدير العملاء بصيغ CSV وExcel.
- سجل عمليات وسجل إشعارات.

## التشغيل المحلي

```bash
npm install
npm start
```

ثم افتح:

```text
http://localhost:3000/admin.html
```

## النشر على Render

الملف `render.yaml` جاهز للنشر كـ Web Service. بعد ربط GitHub مع Render، تأكد من إضافة المتغيرات السرية في Render Environment Variables:

```text
MONGO_URI
JWT_SECRET
FACEBOOK_PAGE_ID
FACEBOOK_PAGE_ACCESS_TOKEN
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_VERIFY_TOKEN
WHATSAPP_TEMPLATE_NAME
WHATSAPP_PASSWORD_RESET_ENABLED
WHATSAPP_PASSWORD_RESET_TEMPLATE_NAME
RESEND_API_KEY
PASSWORD_RESET_EMAIL_FROM
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

القيم غير السرية مضبوطة في `render.yaml`.

## روابط مهمة بعد النشر

```text
/                 صفحة الموقع الرئيسية
/admin.html       لوحة التحكم
/healthz          فحص صحة السيرفر وقاعدة البيانات
/api/webhooks/whatsapp  رابط Webhook الخاص بواتساب
```

## ملاحظات تشغيل

- لا ترفع ملف `.env` إلى GitHub.
- في وضع Meta WhatsApp التجريبي، يجب إضافة رقم المستلم إلى قائمة الأرقام المسموحة داخل Meta.
- للإنتاج، استخدم قالب WhatsApp معتمد في `WHATSAPP_TEMPLATE_NAME`.
- لاسترجاع كلمة المرور عبر واتساب، اعتمد قالب Authentication باسم `hms_password_reset` ثم فعّل `WHATSAPP_PASSWORD_RESET_ENABLED=true`.
- للاسترجاع عبر البريد، اضبط `RESEND_API_KEY` و`PASSWORD_RESET_EMAIL_FROM` بعنوان مرسل موثق.
- رفع الصور المحلي على Render غير دائم بعد إعادة النشر؛ للإنتاج يفضل تفعيل Cloudinary.
