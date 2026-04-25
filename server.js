const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err=>console.log(err));

// ================= Upload =================
const storage = multer.diskStorage({
 destination:'public/uploads',
 filename:(req,file,cb)=>{
  cb(null,Date.now()+"-"+file.originalname);
 }
});
const upload = multer({storage});

// ================= Schemas =================
const User = mongoose.model('User',{
 username:String,
 password:String
});

const Client = mongoose.model('Client',{
 name:String,
 container:String,
 phone:String
});

const Shipment = mongoose.model('Shipment',{
 id:String,
 status:String,
 location:String,
 updatedAt:{type:Date,default:Date.now}
});

const News = mongoose.model('News',{
 title:String,
 date:String,
 desc:String,
 image:String
});

// ================= AUTH =================
app.post('/api/login', async (req,res)=>{
 const user = await User.findOne({username:req.body.username});
 if(!user) return res.json({success:false});

 const match = await bcrypt.compare(req.body.password,user.password);
 res.json({success:match});
});

// ================= Create User مرة واحدة =================
app.post('/api/create-admin', async (req,res)=>{
 const hash = await bcrypt.hash(req.body.password,10);
 await User.create({username:req.body.username,password:hash});
 res.send("admin created");
});

// ================= Upload =================
app.post('/api/upload', upload.single('file'), (req,res)=>{
 res.json({url:'/uploads/'+req.file.filename});
});

// ================= Shipments =================
app.post('/api/shipment', async (req,res)=>{
 const {trackingNumber,status,location} = req.body;

 await Shipment.findOneAndUpdate(
  {id:trackingNumber},
  {status,location,updatedAt:Date.now()},
  {upsert:true}
 );

 // 🔥 واتساب
 if(status==="Delivered to Aden Warehouse"){
  const clients = await Client.find({container:trackingNumber});

  clients.forEach(c=>{
   console.log("📲 WhatsApp to:",c.phone);
   // هنا تربط API واتساب
  });
 }

 res.send("done");
});

app.get('/api/shipments', async(req,res)=>{
 res.json(await Shipment.find().sort({updatedAt:-1}));
});

// ================= Clients =================
app.post('/api/clients', async(req,res)=>{
 await Client.create(req.body);
 res.send("ok");
});

app.get('/api/clients', async(req,res)=>{
 res.json(await Client.find());
});

// ================= News =================
app.post('/api/news', async(req,res)=>{
 await News.create(req.body);
 res.send("ok");
});

app.get('/api/news', async(req,res)=>{
 res.json(await News.find());
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 Server Running"));
