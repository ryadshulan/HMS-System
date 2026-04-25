const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح'))
.catch((err) => console.log('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==========================================
// تعريف الجداول المطورة (Models)
// ==========================================

// 1. جدول الشحنات (تم إضافة المراحل الست)
const shipmentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // رقم الحاوية
    milestones: {
        m1: { type: String, default: 'pending' },
        m2: { type: String, default: 'pending' },
        m3: { type: String, default: 'pending' },
        m4: { type: String, default: 'pending' },
        m5: { type: String, default: 'pending' },
        m6: { type: String, default: 'pending' }
    },
    updatedAt: { type: Date, default: Date.now }
});
const Shipment = mongoose.model('Shipment', shipmentSchema);

// 2. جدول العملاء (جديد)
const customerSchema = new mongoose.Schema({
    name: String,
    phone: String,
    containerId: String, // ربط العميل برقم الحاوية
    createdAt: { type: Date, default: Date.now }
});
const Customer = mongoose.model('Customer', customerSchema);

// 3. جدول الأخبار
const newsSchema = new mongoose.Schema({
    title: String,
    date: String,
    desc: String,
    image: String,
    createdAt: { type: Date, default: Date.now }
});
const News = mongoose.model('News', newsSchema);

// ==========================================
// الروابط (API Routes)
// ==========================================

// --- مسارات الشحنات والمراحل ---
app.post('/api/shipment', async (req, res) => {
    try {
        const { trackingNumber, milestones } = req.body;
        const shipment = await Shipment.findOneAndUpdate(
            { id: trackingNumber },
            { milestones, updatedAt: Date.now() },
            { new: true, upsert: true }
        );

        // إذا اكتملت المرحلة الأخيرة، نبحث عن العملاء المرتبطين
        if (milestones.m6 === 'completed') {
            const customers = await Customer.find({ containerId: trackingNumber });
            // هنا يمكن ربط خدمة WhatsApp API مستقبلاً
            console.log(`إشعار: الحاوية ${trackingNumber} وصلت. عدد العملاء المتأثرين: ${customers.length}`);
        }

        res.status(200).json({ message: "تم تحديث الحالة بنجاح", shipment });
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ أثناء الحفظ" });
    }
});

app.get('/api/shipment/:id', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ id: req.params.id });
        if (shipment) res.status(200).json(shipment);
        else res.status(404).json({ message: "الحاوية غير موجودة" });
    } catch (error) { res.status(500).json({ error: "خطأ في السيرفر" }); }
});

// --- مسارات العملاء ---
app.post('/api/customers', async (req, res) => {
    try {
        const customer = new Customer(req.body);
        await customer.save();
        res.status(201).json({ message: "تم إضافة العميل بنجاح" });
    } catch (error) { res.status(500).json({ error: "خطأ أثناء الحفظ" }); }
});

app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.status(200).json(customers);
    } catch (error) { res.status(500).json({ error: "خطأ في جلب البيانات" }); }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        await Customer.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "تم حذف العميل" });
    } catch (error) { res.status(500).json({ error: "حدث خطأ" }); }
});

// --- مسارات الأخبار (كما هي) ---
app.get('/api/news', async (req, res) => {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
});
app.post('/api/news', async (req, res) => {
    const item = new News(req.body);
    await item.save();
    res.json(item);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على البورت ${PORT}`));
