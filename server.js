const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// إعدادات الميدل وير
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // تأكيد قراءة ملفات مجلد public

// الاتصال بـ MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- الموديلات (Models) ---
const Shipment = mongoose.model('Shipment', new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    milestones: {
        m1: String, m2: String, m3: String, m4: String, m5: String, m6: String
    },
    updatedAt: { type: Date, default: Date.now }
}));

const Customer = mongoose.model('Customer', new mongoose.Schema({
    name: String, phone: String, containerId: String, createdAt: { type: Date, default: Date.now }
}));

// --- الروابط (API Routes) ---

// 1. تحديث/إضافة شحنة
app.post('/api/shipment', async (req, res) => {
    try {
        const { trackingNumber, milestones } = req.body;
        const shipment = await Shipment.findOneAndUpdate(
            { id: trackingNumber },
            { milestones, updatedAt: Date.now() },
            { new: true, upsert: true }
        );
        res.json({ success: true, shipment });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. تتبع شحنة
app.get('/api/shipment/:id', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ id: req.params.id });
        if (!shipment) return res.status(404).json({ message: "Not Found" });
        res.json(shipment);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. إضافة عميل
app.post('/api/customers', async (req, res) => {
    try {
        const customer = new Customer(req.body);
        await customer.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. جلب العملاء
app.get('/api/customers', async (req, res) => {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
});

// 5. تصدير العملاء CSV
app.get('/api/customers/export', async (req, res) => {
    const customers = await Customer.find();
    let csv = "\uFEFFالاسم,الهاتف,الحاوية\n";
    customers.forEach(c => csv += `${c.name},${c.phone},${c.containerId}\n`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=hms_customers.csv');
    res.send(csv);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
