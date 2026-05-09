# Launch Checklist

## قبل فتح الموقع للعملاء

- تأكد أن آخر commit موجود على GitHub.
- افتح Render Dashboard وتأكد أن الخدمة مربوطة بريبو `ryadshulan/HMS-System` والفرع `main`.
- Build Command:

```bash
npm install
```

- Start Command:

```bash
npm start
```

- أضف متغيرات البيئة السرية في Render، ولا تضعها في GitHub.
- افتح `/healthz` بعد النشر وتأكد أن `database.connected` تساوي `true`.
- افتح `/admin.html` وأنشئ أول مستخدم مدير.
- أضف عميلًا تجريبيًا وحاوية تجريبية واختبر آخر مرحلة.
- إذا كنت تستخدم رقم WhatsApp Test Number، أضف رقم العميل في Meta API Setup قبل الاختبار.
- ضع رابط Webhook في Meta:

```text
https://YOUR-RENDER-DOMAIN/api/webhooks/whatsapp
```

## بعد الإطلاق

- اربط دومين رسمي بدل رابط Render المجاني.
- فعّل Cloudinary للصور.
- أنشئ قالب WhatsApp رسمي معتمد.
- جهز صفحة سياسة الخصوصية وشروط الاستخدام.
- فعّل نسخ احتياطي لقاعدة MongoDB Atlas.
- أضف Google Analytics أو Plausible لمتابعة زيارات الموقع.
