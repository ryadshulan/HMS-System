const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// إعدادات الميدل وير (Middlewares)
app.use(cors());
app.use(express.json({ limit: '50mb' })); // لرفع الصور بصيغة Base64 بدون مشاكل في الحجم
app.use(express.static('public')); // مجلد الواجهات الذي سنضع فيه HTML

// الاتصال بقاعدة بيانات MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح'))
.catch((err) => console.log('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==========================================
// تعريف الجداول (Schemas & Models)
// ==========================================

// 1. جدول الشحنات
const shipmentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // رقم التتبع
    status: String,
    location: String,
    updatedAt: { type: Date, default: Date.now }
});
const Shipment = mongoose.model('Shipment', shipmentSchema);

// 2. جدول الأخبار
const newsSchema = new mongoose.Schema({
    title: String,
    date: String,
    desc: String,
    image: String, // صورة الخبر بصيغة Base64
    createdAt: { type: Date, default: Date.now }
});
const News = mongoose.model('News', newsSchema);


// ==========================================
// برمجة الروابط (API Routes) للواجهات
// ==========================================

// --- مسارات الشحنات ---

// إضافة أو تحديث شحنة
app.post('/api/shipment', async (req, res) => {
    try {
        const { trackingNumber, status, location } = req.body;
        // تحديث إذا كانت موجودة، أو إضافة جديدة إذا لم تكن موجودة
        const shipment = await Shipment.findOneAndUpdate(
            { id: trackingNumber },
            { status, location, updatedAt: Date.now() },
            { new: true, upsert: true }
        );
        res.status(200).json({ message: "تم الحفظ بنجاح", shipment });
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ أثناء حفظ الشحنة" });
    }
});

// البحث عن شحنة (للتتبع)
app.get('/api/shipment/:id', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ id: req.params.id });
        if (shipment) {
            res.status(200).json(shipment);
        } else {
            res.status(404).json({ message: "الشحنة غير موجودة" });
        }
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
});

// جلب جميع الشحنات (للوحة التحكم)
app.get('/api/shipments', async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ updatedAt: -1 });
        res.status(200).json(shipments);
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ" });
    }
});

// حذف شحنة
app.delete('/api/shipment/:id', async (req, res) => {
    try {
        await Shipment.findOneAndDelete({ id: req.params.id });
        res.status(200).json({ message: "تم الحذف" });
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ" });
    }
});

// --- مسارات الأخبار ---

// إضافة خبر جديد
app.post('/api/news', async (req, res) => {
    try {
        const newNews = new News(req.body);
        await newNews.save();
        res.status(201).json({ message: "تم إضافة الخبر", news: newNews });
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ أثناء الحفظ" });
    }
});

// جلب الأخبار (للصفحة الرئيسية ولوحة التحكم)
app.get('/api/news', async (req, res) => {
    try {
        const news = await News.find().sort({ createdAt: -1 });
        res.status(200).json(news);
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ" });
    }
});

// حذف خبر
app.delete('/api/news/:id', async (req, res) => {
    try {
        await News.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "تم حذف الخبر" });
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ" });
    }
});

// ==========================================
// تشغيل السيرفر
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على البورت ${PORT}`);
});