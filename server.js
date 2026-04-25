const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ DB Error:', err));

// ================= Upload =================
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// ================= Schemas =================

// Users
const userSchema = new mongoose.Schema({
    username: String,
    password: String
});
const User = mongoose.model('User', userSchema);

// Clients
const clientSchema = new mongoose.Schema({
    name: String,
    container: String,
    phone: String
});
const Client = mongoose.model('Client', clientSchema);

// Shipments
const shipmentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    status: String,
    location: String,
    updatedAt: { type: Date, default: Date.now },
    milestones: {
        m1: { type: String, default: 'pending' },
        m2: { type: String, default: 'pending' },
        m3: { type: String, default: 'pending' },
        m4: { type: String, default: 'pending' },
        m5: { type: String, default: 'pending' },
        m6: { type: String, default: 'pending' }
    }
});
const Shipment = mongoose.model('Shipment', shipmentSchema);

// News
const newsSchema = new mongoose.Schema({
    title: String,
    date: String,
    desc: String,
    image: String,
    createdAt: { type: Date, default: Date.now }
});
const News = mongoose.model('News', newsSchema);

// ================= AUTH =================
app.post('/api/login', async (req, res) => {
    const user = await User.findOne(req.body);
    res.json({ success: !!user });
});

// ================= Upload API =================
app.post('/api/upload', upload.single('file'), (req, res) => {
    res.json({ url: '/uploads/' + req.file.filename });
});

// ================= Shipments =================
app.post('/api/shipment', async (req, res) => {
    try {
        const { trackingNumber, status, location, milestones } = req.body;

        const shipment = await Shipment.findOneAndUpdate(
            { id: trackingNumber },
            {
                status,
                location,
                milestones,
                updatedAt: Date.now()
            },
            { new: true, upsert: true }
        );

        // 📱 إشعار عند آخر مرحلة
        if (milestones?.m6 === 'completed') {
            const clients = await Client.find({ container: trackingNumber });

            clients.forEach(c => {
                console.log(`📲 ارسال واتساب الى ${c.phone}`);
                // 🔥 اربط API واتساب هنا
            });
        }

        res.status(200).json({ message: "تم الحفظ", shipment });

    } catch (error) {
        res.status(500).json({ error: "خطأ في الحفظ" });
    }
});

app.get('/api/shipments', async (req, res) => {
    const data = await Shipment.find().sort({ updatedAt: -1 });
    res.json(data);
});

app.get('/api/shipment/:id', async (req, res) => {
    const data = await Shipment.findOne({ id: req.params.id });
    res.json(data);
});

app.delete('/api/shipment/:id', async (req, res) => {
    await Shipment.findOneAndDelete({ id: req.params.id });
    res.json({ message: "تم الحذف" });
});

// ================= Clients =================
app.post('/api/clients', async (req, res) => {
    await Client.create(req.body);
    res.json({ message: "تم إضافة العميل" });
});

app.get('/api/clients', async (req, res) => {
    const data = await Client.find();
    res.json(data);
});

// ================= News =================
app.post('/api/news', async (req, res) => {
    const n = new News(req.body);
    await n.save();
    res.json(n);
});

app.get('/api/news', async (req, res) => {
    const data = await News.find().sort({ createdAt: -1 });
    res.json(data);
});

app.delete('/api/news/:id', async (req, res) => {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: "تم الحذف" });
});

// ================= Start =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on ${PORT}`);
});
