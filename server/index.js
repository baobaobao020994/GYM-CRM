const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_RAILWAY";
const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add a PostgreSQL database in Railway and connect it to this service.");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
const q = (text, params=[]) => pool.query(text, params);

async function initDb(){
  await q(`
  CREATE TABLE IF NOT EXISTS users (
   id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
   role TEXT NOT NULL DEFAULT 'Sale', name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sales (
   id SERIAL PRIMARY KEY, date DATE NOT NULL, customer_name TEXT NOT NULL, source TEXT DEFAULT '', branch TEXT DEFAULT '',
   package TEXT DEFAULT '', total_amount NUMERIC DEFAULT 0, paid_amount NUMERIC DEFAULT 0, payment_method TEXT DEFAULT 'Tiền mặt',
   consultant TEXT DEFAULT '', status TEXT DEFAULT 'Đã đăng ký', note TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS leads (
   id SERIAL PRIMARY KEY, date DATE NOT NULL, name TEXT NOT NULL, phone TEXT DEFAULT '', contact_status TEXT DEFAULT 'Mới',
   booking_date DATE, branch TEXT DEFAULT '', trainer TEXT DEFAULT '', result TEXT DEFAULT '', after_appointment TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS bonuses (id SERIAL PRIMARY KEY, date DATE NOT NULL, bonus TEXT NOT NULL, amount NUMERIC DEFAULT 0);
  CREATE TABLE IF NOT EXISTS targets (id SERIAL PRIMARY KEY, period_type TEXT NOT NULL, period TEXT NOT NULL, target NUMERIC DEFAULT 0, UNIQUE(period_type, period));
  CREATE TABLE IF NOT EXISTS reservations (id SERIAL PRIMARY KEY, sales_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE, months INTEGER DEFAULT 0, status TEXT DEFAULT 'Đang bảo lưu');
  `);
  const admin = await q("SELECT id FROM users WHERE username=$1", ["admin"]);
  if(!admin.rowCount){
    const hash=bcrypt.hashSync("kpmf0209@admin",10);
    await q("INSERT INTO users(username,password_hash,role,name) VALUES($1,$2,$3,$4)",["admin",hash,"Admin","Administrator"]);
  }
}

const payRates={"Tiền mặt":0,"Chuyển khoản":0,"Home":0,"Việt Tín":0,"POS":0.02,"MPOS 12TH":0.10,"MPOS 18TH":0.20,"MPOS 24TH":0.20,"HD":0};
const taxRates={"Tiền mặt":0.10,"Chuyển khoản":0.20,"Home":0.20,"Việt Tín":0.20,"POS":0.20,"MPOS 12TH":0.20,"MPOS 18TH":0.20,"MPOS 24TH":0.20,"HD":0.20};
function enrichSale(row){const feeRate=payRates[row.payment_method]??0,taxRate=taxRates[row.payment_method]??0,paid=Number(row.paid_amount||0),afterFee=paid*(1-feeRate),afterTax=afterFee*(1-taxRate);return {...row,fee_rate:feeRate,tax_rate:taxRate,fee_amount:paid*feeRate,after_fee:afterFee,after_tax:afterTax,net_received:afterTax};}
function auth(req,res,next){const h=req.headers.authorization||"";try{req.user=jwt.verify(h.replace("Bearer ",""),JWT_SECRET);next()}catch{res.status(401).json({error:"Phiên đăng nhập hết hạn"})}}
function adminOnly(req,res,next){if(req.user.role!=="Admin")return res.status(403).json({error:"Không có quyền"});next()}
function monthKey(d){return String(d).slice(0,7)}
function weekOfMonth(d){const day=Number(String(d).slice(8,10));return Math.floor((day-1)/7)+1}

app.get("/health",(req,res)=>res.json({ok:true}));
app.post("/api/login",async(req,res)=>{try{const {username,password}=req.body;const r=await q("SELECT * FROM users WHERE username=$1",[username]);const u=r.rows[0];if(!u||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:"Sai tài khoản hoặc mật khẩu"});const token=jwt.sign({id:u.id,username:u.username,role:u.role,name:u.name},JWT_SECRET,{expiresIn:"12h"});res.json({token,user:{id:u.id,username:u.username,role:u.role,name:u.name}})}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/change-password",auth,async(req,res)=>{try{const {currentPassword,newPassword}=req.body;const r=await q("SELECT * FROM users WHERE id=$1",[req.user.id]);const u=r.rows[0];if(!u||!bcrypt.compareSync(currentPassword,u.password_hash))return res.status(400).json({error:"Mật khẩu hiện tại không đúng"});if(!newPassword||newPassword.length<6)return res.status(400).json({error:"Mật khẩu mới tối thiểu 6 ký tự"});await q("UPDATE users SET password_hash=$1 WHERE id=$2",[bcrypt.hashSync(newPassword,10),u.id]);res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.get("/api/sales",auth,async(req,res)=>{try{const r=await q("SELECT * FROM sales ORDER BY date DESC,id DESC");res.json(r.rows.map(enrichSale))}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/sales",auth,async(req,res)=>{try{const x=req.body;const r=await q(`INSERT INTO sales(date,customer_name,source,branch,package,total_amount,paid_amount,payment_method,consultant,status,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[x.date,x.customer_name,x.source||"",x.branch||"",x.package||"",x.total_amount||0,x.paid_amount||0,x.payment_method||"Tiền mặt",x.consultant||"",x.status||"Đã đăng ký",x.note||""]);res.json(enrichSale(r.rows[0]))}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/sales/:id",auth,async(req,res)=>{try{const x=req.body;const r=await q(`UPDATE sales SET date=$1,customer_name=$2,source=$3,branch=$4,package=$5,total_amount=$6,paid_amount=$7,payment_method=$8,consultant=$9,status=$10,note=$11 WHERE id=$12 RETURNING *`,[x.date,x.customer_name,x.source||"",x.branch||"",x.package||"",x.total_amount||0,x.paid_amount||0,x.payment_method||"Tiền mặt",x.consultant||"",x.status||"Đã đăng ký",x.note||"",req.params.id]);res.json(enrichSale(r.rows[0]))}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/sales/:id",auth,adminOnly,async(req,res)=>{await q("DELETE FROM sales WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/leads",auth,async(req,res)=>res.json((await q("SELECT * FROM leads ORDER BY date DESC,id DESC")).rows));
app.post("/api/leads",auth,async(req,res)=>{try{const x=req.body;const r=await q(`INSERT INTO leads(date,name,phone,contact_status,booking_date,branch,trainer,result,after_appointment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[x.date,x.name,x.phone||"",x.contact_status||"Mới",x.booking_date||null,x.branch||"",x.trainer||"",x.result||"",x.after_appointment||""]);res.json(r.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/leads/:id",auth,async(req,res)=>{try{const x=req.body;const r=await q(`UPDATE leads SET date=$1,name=$2,phone=$3,contact_status=$4,booking_date=$5,branch=$6,trainer=$7,result=$8,after_appointment=$9 WHERE id=$10 RETURNING *`,[x.date,x.name,x.phone||"",x.contact_status||"Mới",x.booking_date||null,x.branch||"",x.trainer||"",x.result||"",x.after_appointment||"",req.params.id]);res.json(r.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/leads/:id",auth,adminOnly,async(req,res)=>{await q("DELETE FROM leads WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/bonuses",auth,async(req,res)=>res.json((await q("SELECT * FROM bonuses ORDER BY date DESC,id DESC")).rows));
app.post("/api/bonuses",auth,async(req,res)=>{const x=req.body,r=await q("INSERT INTO bonuses(date,bonus,amount) VALUES($1,$2,$3) RETURNING *",[x.date,x.bonus,x.amount||0]);res.json(r.rows[0])});
app.put("/api/bonuses/:id",auth,async(req,res)=>{const x=req.body,r=await q("UPDATE bonuses SET date=$1,bonus=$2,amount=$3 WHERE id=$4 RETURNING *",[x.date,x.bonus,x.amount||0,req.params.id]);res.json(r.rows[0])});
app.delete("/api/bonuses/:id",auth,adminOnly,async(req,res)=>{await q("DELETE FROM bonuses WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/targets",auth,async(req,res)=>res.json((await q("SELECT * FROM targets ORDER BY period DESC")).rows));
app.post("/api/targets",auth,async(req,res)=>{const x=req.body;await q("INSERT INTO targets(period_type,period,target) VALUES($1,$2,$3) ON CONFLICT(period_type,period) DO UPDATE SET target=EXCLUDED.target",[x.period_type,x.period,x.target||0]);res.json({ok:true})});

app.get("/api/checkins",auth,async(req,res)=>{const r=await q(`SELECT s.id,s.customer_name,s.package,s.branch,s.consultant,s.date,(s.date + ((COALESCE(r.months,12)::text || ' months')::interval))::date AS expiry,COALESCE(r.status,'Chưa check-in') AS status FROM sales s LEFT JOIN reservations r ON r.sales_id=s.id WHERE s.status='Đã đăng ký' ORDER BY s.date DESC`);res.json(r.rows)});
app.put("/api/checkins/:id",auth,async(req,res)=>{const {status}=req.body;const ex=await q("SELECT id FROM reservations WHERE sales_id=$1",[req.params.id]);if(ex.rowCount)await q("UPDATE reservations SET status=$1 WHERE sales_id=$2",[status,req.params.id]);else await q("INSERT INTO reservations(sales_id,months,status) VALUES($1,$2,$3)",[req.params.id,12,status]);res.json({ok:true})});
app.get("/api/holds",auth,async(req,res)=>res.json((await q(`SELECT r.id,r.sales_id,r.months,r.status,s.customer_name,s.package,s.branch,s.consultant,s.date FROM reservations r JOIN sales s ON s.id=r.sales_id ORDER BY s.date DESC`)).rows));
app.post("/api/holds",auth,async(req,res)=>{const x=req.body,r=await q("INSERT INTO reservations(sales_id,months,status) VALUES($1,$2,$3) RETURNING *",[x.sales_id,x.months||0,x.status||"Đang bảo lưu"]);res.json(r.rows[0])});
app.put("/api/holds/:id",auth,async(req,res)=>{const x=req.body;await q("UPDATE reservations SET months=$1,status=$2 WHERE id=$3",[x.months||0,x.status||"Đang bảo lưu",req.params.id]);res.json({ok:true})});
app.delete("/api/holds/:id",auth,adminOnly,async(req,res)=>{await q("DELETE FROM reservations WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/users",auth,adminOnly,async(req,res)=>res.json((await q("SELECT id,username,name,role,created_at FROM users ORDER BY id")).rows));
app.post("/api/users",auth,adminOnly,async(req,res)=>{try{const x=req.body;await q("INSERT INTO users(username,password_hash,role,name) VALUES($1,$2,$3,$4)",[x.username,bcrypt.hashSync(x.password||"123456",10),x.role||"Sale",x.name||x.username]);res.json({ok:true})}catch(e){res.status(400).json({error:"Tên tài khoản đã tồn tại"})}});

app.get("/api/dashboard",auth,async(req,res)=>{try{const sr=await q("SELECT * FROM sales"),lr=await q("SELECT * FROM leads"),tr=await q("SELECT target FROM targets WHERE period_type='month' AND period=$1",[new Date().toISOString().slice(0,7)]);const sales=sr.rows.map(enrichSale),leads=lr.rows,ym=new Date().toISOString().slice(0,7),today=new Date().toISOString().slice(0,10),monthSales=sales.filter(x=>monthKey(x.date)===ym),todaySales=sales.filter(x=>String(x.date).slice(0,10)===today),monthLeads=leads.filter(x=>monthKey(x.date)===ym),booked=monthLeads.filter(x=>["Booked","Đã book","Đã đặt lịch"].includes(x.contact_status)||x.booking_date).length,visited=monthLeads.filter(x=>["Đã ghé","Visited","Ghé"].includes(x.result)).length,registered=monthSales.length,target=Number(tr.rows[0]?.target||0),weekly=Array.from({length:5},(_,i)=>({week:`Tuần ${i+1}`,sales:monthSales.filter(x=>weekOfMonth(x.date)===i+1).reduce((a,b)=>a+Number(b.paid_amount||0),0),net:monthSales.filter(x=>weekOfMonth(x.date)===i+1).reduce((a,b)=>a+Number(b.net_received||0),0)}));res.json({todaySales:todaySales.reduce((a,b)=>a+Number(b.paid_amount||0),0),monthSales:monthSales.reduce((a,b)=>a+Number(b.paid_amount||0),0),netReceived:monthSales.reduce((a,b)=>a+Number(b.net_received||0),0),leads:monthLeads.length,booked,visited,registered,conversion:monthLeads.length?registered/monthLeads.length:0,target,completion:target?monthSales.reduce((a,b)=>a+Number(b.paid_amount||0),0)/target:0,weekly})}catch(e){res.status(500).json({error:e.message})}});

const dist=path.join(__dirname,"..","dist");
if(fs.existsSync(dist)){app.use(express.static(dist));app.get("*",(req,res)=>res.sendFile(path.join(dist,"index.html")))}

initDb().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`CRM server running on port ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
