const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('public')); // قراءة مجلد التصميم

// 1. الاتصال بقاعدة البيانات
mongoose.connect('mongodb://127.0.0.1:27017/alnajm_database')
  .then(() => console.log('✅ ممتاز! تم الاتصال بقاعدة البيانات بنجاح.'))
  .catch((err) => console.error('❌ عذراً، هناك مشكلة في الاتصال:', err));

// 2. تصميم "هيكل" الشحنة في قاعدة البيانات
const shipmentSchema = new mongoose.Schema({
  trackingNumber: String, // رقم التتبع أو الحاوية
  status: String,         // حالة الشحنة (مثال: في البحر، وصلت عدن)
  location: String        // الموقع الحالي
});
const Shipment = mongoose.model('Shipment', shipmentSchema);

// 3. برمجة زر "إضافة/تحديث شحنة" (للوحة التحكم)
app.post('/api/shipment', async (req, res) => {
  const { trackingNumber, status, location } = req.body;
  // هذا الأمر يقوم بتحديث الشحنة إذا كان الرقم موجوداً، أو ينشئ شحنة جديدة إذا لم يكن موجوداً
  await Shipment.findOneAndUpdate(
    { trackingNumber: trackingNumber },
    { status: status, location: location },
    { upsert: true, new: true }
  );
  res.send({ message: 'تم حفظ بيانات الشحنة بنجاح!' });
});

// 4. برمجة زر "تتبع" (للعميل في الصفحة الرئيسية)
app.get('/api/shipment/:number', async (req, res) => {
  const shipment = await Shipment.findOne({ trackingNumber: req.params.number });
  if (shipment) {
    res.send(shipment);
  } else {
    res.status(404).send({ message: 'عذراً، لم نتمكن من العثور على شحنة بهذا الرقم.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 محرك الموقع يعمل الآن.. الرابط: http://localhost:${PORT}`);
});