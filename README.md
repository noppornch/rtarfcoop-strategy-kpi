# ระบบบริหารจัดการและติดตามแผนกลยุทธ์ (Strategic & Project Management Web Application)

ระบบเว็บแอปพลิเคชันสำหรับบริหารจัดการ ติดตามแผนกลยุทธ์ โครงการ และตัวชี้วัด (KPI) เพื่อช่วยขับเคลื่อนและประเมินผลการดำเนินงานของสหกรณ์อย่างเป็นระบบ มีประสิทธิภาพ และโปร่งใส

---

## 1. ความสามารถของระบบ (System Capabilities)

ระบบออกแบบมาเพื่อรองรับโครงสร้างการจัดการแผนงานในรูปแบบ Hierarchy (ลำดับขั้น) และการควบคุมสิทธิ์ตามบทบาทหน้าที่ (Role-Based Access Control):

### 1.1 โครงสร้างข้อมูลแผนกลยุทธ์ (Strategy Hierarchy)
* **แผนกลยุทธ์ (Strategic Plans)**: กำหนดรอบปีของแผน (เช่น แผนกลยุทธ์ พ.ศ. 2568 – 2570)
* **พันธกิจ (Missions)**: กำหนดแนวทางหลักภายใต้แผนกลยุทธ์
* **ยุทธศาสตร์ (Strategies)**: รายละเอียดแผนงาน วัตถุประสงค์ และระบุผู้รับผิดชอบหลักระดับผู้บริหาร (Manager)
* **กิจกรรมตัวชี้วัด (KPI Activities)**: กำหนดกิจกรรม ยอดงบประมาณที่จัดสรร (Budget Allocated) ยอดที่ใช้จริง (Budget Spent) รูปแบบตัวชี้วัด (KPI Type) และช่วงวันดำเนินงาน
* **ขั้นตอนการปฏิบัติงานย่อย (Activity Steps / Sub-steps)**: รายละเอียดขั้นตอนย่อยในการดำเนินงาน พร้อมระบบระบุร้อยละความคืบหน้า (Progress %) และผลการดำเนินงานจริง

### 1.2 ระบบควบคุมสิทธิ์การเข้าใช้งาน (Role-Based Access Control - RBAC)
* **ผู้ดูแลระบบ (Admin)**:
  * มีสิทธิ์การจัดการสูงสุดในการ CRUD (สร้าง, อ่าน, แก้ไข, ลบ) ข้อมูลในทุกระดับชั้น (Plans, Missions, Strategies, Users)
  * มีสิทธิ์เข้าใช้งานหน้า **"จัดการฐานข้อมูลดิบ SQLite"** สำหรับดูโครงสร้างตาราง ค้นหา เพิ่ม แก้ไข และลบข้อมูลดิบในฐานข้อมูลจำลองได้โดยตรง
* **ผู้บริหาร (Manager)**:
  * สามารถบริหารจัดการ เพิ่ม แก้ไข และลบ กิจกรรมหลัก (KPI Activity) และกำหนดผู้รับผิดชอบเฉพาะใน **ยุทธศาสตร์ที่ตนเองได้รับมอบหมายให้ดูแลเท่านั้น**
  * ดูภาพรวมแดชบอร์ดสถิติความคืบหน้าของโครงการและงบประมาณได้
* **ผู้ใช้งานทั่วไป (User)**:
  * สามารถดูเฉพาะกิจกรรมและงานย่อยที่ตนเองได้รับมอบหมายผ่านระบบ **"งานของฉัน (My Tasks)"**
  * รายงานความก้าวหน้าการดำเนินงาน (Progress Details) เป็นรายขั้นตอนย่อย (Sub-steps) และบันทึกผลสัมฤทธิ์จริงเป็นข้อความอธิบายความสำเร็จได้อย่างชัดเจน

### 1.3 ระบบสถิติและแดชบอร์ด (Interactive Dashboard)
* แสดงสรุปจำนวนพันธกิจและยุทธศาสตร์ทั้งหมด
* รายงานสรุปสถานะงบประมาณที่ได้รับการจัดสรรเปรียบเทียบกับงบประมาณที่ใช้ไปจริง
* สรุปสถานะความคืบหน้าเฉลี่ยของกิจกรรมทั้งหมด
* แสดงกราฟวงกลมและแผนภูมิสรุปสถานะสุขภาพโครงการ (Health Status: On Track, At Risk, Off Track) และสถานะความก้าวหน้า (Progress Status: Pending, In Progress, Completed, Delayed)

---

## 2. วิธีการติดตั้งและ Deploy ระบบสำหรับ OS Ubuntu

คู่มือแนะนำขั้นตอนการนำระบบนี้ขึ้นใช้งาน (Deployment) บนเซิร์ฟเวอร์ระบบปฏิบัติการ Ubuntu ตั้งแต่การติดตั้ง Git, Node.js, PM2 และ Caddy เพื่อทำ Reverse Proxy ภายใต้ชื่อโดเมนภายใน `http://strategy.local/` (HTTP ธรรมดา)

### ขั้นตอนที่ 1: อัปเดตแพ็กเกจระบบ
เชื่อมต่อ SSH เข้าสู่ Ubuntu Server จากนั้นรันคำสั่งเพื่ออัปเดตดัชนีแพ็กเกจ:
```bash
sudo apt update && sudo apt upgrade -y
```

### ขั้นตอนที่ 2: ติดตั้ง Git
ติดตั้งเครื่องมือ Git สำหรับดึง source code จาก GitHub:
```bash
sudo apt install git -y
```

### ขั้นตอนที่ 3: ติดตั้ง Node.js (Version 24 LTS)
ติดตั้ง Node.js v24 ผ่าน NodeSource Distribution:
```bash
# ดาวน์โหลดและรันสคริปต์ติดตั้ง NodeSource สำหรับ Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -

# ติดตั้ง Node.js และ build tools ที่จำเป็น
sudo apt install -y nodejs build-essential
```
ตรวจสอบเวอร์ชันที่ติดตั้งสำเร็จ:
```bash
node -v
npm -v
```

### ขั้นตอนที่ 4: Clone Repository และเตรียมไฟล์โครงการ
ทำการดึงไฟล์โปรเจกต์จาก Git Repository และตั้งค่าโฟลเดอร์ทำงาน:
```bash
# โคลนโปรเจกต์มาไว้ที่เซิร์ฟเวอร์
git clone https://github.com/noppornch/rtarfcoop-strategy-kpi.git

# เข้าสู่โฟลเดอร์ของโปรเจกต์
cd rtarfcoop-strategy-kpi

# ติดตั้ง Dependencies
npm install
```

### ขั้นตอนที่ 5: ตั้งค่า Environment Variables (.env)
สร้างไฟล์ `.env` ไว้ที่โฟลเดอร์หลักของโปรเจกต์ เพื่อตั้งค่ารันระบบ:
```bash
nano .env
```
ใส่ข้อความการตั้งค่าด้านล่างนี้ลงในไฟล์ (จากนั้นกด `Ctrl + O` เพื่อบันทึก และ `Ctrl + X` เพื่อออก):
```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=rtarfcoop-strategic-secret-key-1234
```

### ขั้นตอนที่ 6: เตรียมฐานข้อมูลเริ่มต้น (Initial Database)
ทำการเตรียมตารางและข้อมูลตัวอย่างเบื้องต้นลงใน SQLite Database:
```bash
npm run init-db
```
*คำสั่งนี้จะสร้างไฟล์ฐานข้อมูล `data/strategy.db` และสร้างตารางพร้อมผู้ใช้งานเริ่มต้น ได้แก่ `admin`, `manager`, `user1`, `user2`*

### ขั้นตอนที่ 7: ติดตั้งและตั้งค่า PM2 (Process Manager)
ใช้ PM2 เพื่อให้แอปพลิเคชัน Node.js รันเป็นเบื้องหลัง (Background Service) และทำงานใหม่อัตโนมัติเมื่อเกิดการ Crash หรือ Server รีบูต:

```bash
# ติดตั้ง PM2 ทั่วทั้งระบบ
sudo npm install -g pm2

# เริ่มต้นระบบด้วย PM2
pm2 start server.js --name "rtarfcoop-strategy"

# ตั้งค่าให้ PM2 รันอัตโนมัติเมื่อเซิร์ฟเวอร์เปิดขึ้นใหม่
pm2 startup
```
*ระบบจะแสดงคำสั่ง `sudo env PATH=...` ขึ้นมา ให้คัดลอกคำสั่งนั้นมารันเพื่อบันทึกสถานะการเปิดระบบอัตโนมัติ*

บันทึกกระบวนการที่กำลังทำงานอยู่ของ PM2:
```bash
pm2 save
```

### ขั้นตอนที่ 8: ติดตั้งและตั้งค่า Caddy Server
ติดตั้งเว็บเซิร์ฟเวอร์ Caddy เพื่อใช้ทำ Reverse Proxy ไปยังแอปพลิเคชัน Node.js ที่พอร์ต `3000`:

```bash
# ติดตั้ง Caddy keyring และสิทธิ์การเข้าถึง repository
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# อัปเดตและทำการติดตั้ง Caddy
sudo apt update
sudo apt install caddy -y
```

แก้ไขไฟล์การตั้งค่าของ Caddy (Caddyfile):
```bash
sudo nano /etc/caddy/Caddyfile
```
ลบข้อมูลเดิมออกทั้งหมด และใส่การตั้งค่าสำหรับใช้งาน `http://strategy.local/` แบบไม่เข้ารหัส (HTTP ธรรมดา) ไปยัง Node.js App ที่พอร์ต `3000`:
```caddy
http://strategy.local {
    reverse_proxy 127.0.0.1:3000
}
```
บันทึกไฟล์และทำการเริ่มการทำงานของ Caddy ใหม่:
```bash
sudo systemctl restart caddy
```

---

## 3. การเข้าใช้งานผ่านคอมพิวเตอร์ลูกข่าย (Client Configuration)

เนื่องจากโดเมน `strategy.local` เป็นโดเมนจำลองภายในเครื่อง หากเข้าใช้งานจากเครื่องภายนอกในวงเน็ตเวิร์กเดียวกัน จะต้องทำการตั้งค่าดังนี้:

### กรณีตั้งค่าผ่านเครื่อง Client โดยตรง
แก้ไขไฟล์ `hosts` บนเครื่องคอมพิวเตอร์ของผู้ใช้ที่จะเปิดเว็บแอปพลิเคชัน:
* **สำหรับ Windows:** แก้ไขไฟล์ `C:\Windows\System32\drivers\etc\hosts`
* **สำหรับ macOS / Linux:** แก้ไขไฟล์ `/etc/hosts`

เพิ่มบรรทัดดังต่อไปนี้ (ระบุ IP ของเซิร์ฟเวอร์ Ubuntu ของคุณ):
```text
192.168.x.x  strategy.local
```
*(เปลี่ยน `192.168.x.x` เป็น IP Address จริงของ Ubuntu Server)*

เมื่อตั้งค่าเสร็จสิ้น สามารถเปิดใช้งานผ่าน Web Browser ได้ทาง: **[http://strategy.local](http://strategy.local)**
