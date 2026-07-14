const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'strategy.db');

// Delete the old database file if it exists to ensure a clean slate
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('Deleted old database file.');
  } catch (err) {
    console.error('Could not delete database file, continuing anyway:', err.message);
  }
}

const db = new sqlite3.Database(dbPath);

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Promise wrapper for db.run
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function init() {
  try {
    console.log('Initializing database tables...');
    await runQuery('PRAGMA foreign_keys = ON;');

    await runQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user'
      );
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS strategic_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        start_year INTEGER NOT NULL,
        end_year INTEGER NOT NULL
      );
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS missions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategic_plan_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE
      );
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        name TEXT NOT NULL,
        action_plan_name TEXT,
        objective_name TEXT,
        manager_id INTEGER,
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
        FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS kpi_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        kpi_name TEXT NOT NULL,
        kpi_type TEXT DEFAULT 'percentage',
        target_value TEXT,
        actual_value TEXT,
        activity TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        budget_allocated REAL DEFAULT 0,
        budget_spent REAL DEFAULT 0,
        health_status TEXT DEFAULT 'on_track',
        progress_status TEXT DEFAULT 'pending',
        FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
      );
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS kpi_assignees (
        kpi_activity_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        PRIMARY KEY (kpi_activity_id, user_id),
        FOREIGN KEY (kpi_activity_id) REFERENCES kpi_activities(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS activity_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kpi_activity_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        step_name TEXT NOT NULL,
        progress_percent INTEGER DEFAULT 0,
        actual_result TEXT,
        due_date TEXT,
        FOREIGN KEY (kpi_activity_id) REFERENCES kpi_activities(id) ON DELETE CASCADE
      );
    `);

    console.log('Tables created. Seeding initial user data...');

    // Seed Users (manager ID is 2)
    const users = [
      { username: 'admin', name: 'ผู้ดูแลระบบ (Admin)', role: 'admin', password: 'admin1234' },
      { username: 'manager', name: 'ผู้บริหาร (Manager)', role: 'manager', password: 'manager1234' },
      { username: 'user1', name: 'สมชาย รักดี (User 1)', role: 'user', password: 'user1234' },
      { username: 'user2', name: 'สมหญิง จริงใจ (User 2)', role: 'user', password: 'user1234' }
    ];

    for (const u of users) {
      const salt = generateSalt();
      const hash = hashPassword(u.password, salt);
      await runQuery('INSERT INTO users (username, password, salt, name, role) VALUES (?, ?, ?, ?, ?)', [u.username, hash, salt, u.name, u.role]);
    }

    // Seed Strategic Plan
    await runQuery(
      `INSERT INTO strategic_plans (id, name, start_year, end_year) VALUES (1, 'แผนกลยุทธ์ ฉบับที่ 3 พ.ศ. 2568 – 2570', 2568, 2570)`
    );
    const planId = 1;
    const defaultManagerId = 2;

    // Mission 1
    const m1 = await runQuery(`INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, 1, 'พัฒนาการบริหารจัดการสหกรณ์อย่างถูกต้องและโปร่งใส')`, [planId]);
    const m1Id = m1.lastID;

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 1, 'ขับเคลื่อนสหกรณ์ให้มีการปฏิบัติงานอย่างถูกต้องและโปร่งใส', 'แผนพัฒนาระบบงาน', 
      '1. เพื่อให้สหกรณ์มีระบบงานและคู่มือการปฏิบัติงานที่เหมาะสม\n2. เพื่อให้สหกรณ์มีระเบียบที่เป็นไปตามกฎหมาย และสอดคล้องกับการดำเนินธุรกิจของสหกรณ์\n3. เพื่อให้สหกรณ์มีแผนกลยุทธ์ที่เหมาะสมกับสถานการณ์ปัจจุบัน', ?)
    `, [m1Id, defaultManagerId]);

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 2, 'พัฒนาการบริหารจัดการเงินทุนของสหกรณ์ให้ขับเคลื่อนอย่างมีประสิทธิภาพ', 'แผนบริหารเงินทุน', 
      '1. เพื่อให้สหกรณ์มีระบบงานและคู่มือการปฏิบัติงานที่เหมาะสม\n2. เพื่อให้สหกรณ์มีระเบียบที่เป็นไปตามกฎหมาย และสอดคล้องกับการดำเนินธุรกิจของสหกรณ์\n3. เพื่อให้สหกรณ์มีแผนกลยุทธ์ที่เหมาะสมกับสถานการณ์ปัจจุบัน', ?)
    `, [m1Id, defaultManagerId]);

    // Mission 2
    const m2 = await runQuery(`INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, 2, 'เพิ่มประสิทธิภาพการให้บริการแก่สมาชิก')`, [planId]);
    const m2Id = m2.lastID;

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 1, 'พัฒนาระบบบริการสมาชิกให้มีความทันสมัย', 'แผนการให้บริการ', 
      '1. เพื่อทราบความคิดเห็นของสมาชิกที่มีต่อการบริหารจัดการสหกรณ์ ปัญหา อุปสรรค และข้อเสนอแนะ เพื่อการพัฒนาสหกรณ์\n2. เพื่อให้สมาชิกสหกรณ์ได้รับความสะดวกในการรับบริการจากสหกรณ์\n3. มุ่งเน้นข้อมูลส่วนบุคคลในการติดต่อช่องทางออนไลน์ของสมาชิกเพื่อติดต่อหรือขอข้อมูลของสมาชิก', ?)
    `, [m2Id, defaultManagerId]);

    // Mission 3
    const m3 = await runQuery(`INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, 3, 'เสริมสร้างสวัสดิการแก่สมาชิก')`, [planId]);
    const m3Id = m3.lastID;

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 1, 'เสริมสร้างสวัสดิการแก่สมาชิกเพื่อคุณภาพชีวิต', 'แผนสวัสดิการสมาชิก', 
      'สมาชิกได้รับทุนสวัสดิการจากสหกรณ์', ?)
    `, [m3Id, defaultManagerId]);

    // Mission 4
    const m4 = await runQuery(`INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, 4, 'เสริมสร้างความรู้แก่สมาชิกและบุคลากรของสหกรณ์')`, [planId]);
    const m4Id = m4.lastID;

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 1, 'ส่งเสริมความรู้ให้สมาชิกและบุคลากรของสหกรณ์ได้รับการพัฒนาความรู้และทักษะเพิ่มขึ้น', 'แผนพัฒนาบุคลากรสหกรณ์', 
      '1. เพื่อให้สมาชิกและบุคลากรสหกรณ์มีความรู้ความเข้าใจในกิจการและการบริหารงานของสหกรณ์ ตามที่ได้รับการอบรม\n2. เพื่อให้สมาชิกมีคุณภาพชีวิตที่ดีขึ้น', ?)
    `, [m4Id, defaultManagerId]);

    // Mission 5
    const m5 = await runQuery(`INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, 5, 'พัฒนาระบบข้อมูลข่าวสารและการประชาสัมพันธ์ให้ทันสมัย')`, [planId]);
    const m5Id = m5.lastID;

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 1, 'พัฒนาข้อมูลข่าวสารและการประชาสัมพันธ์', 'แผนพัฒนาข้อมูลข่าวสารและการประชาสัมพันธ์สหกรณ์', 
      '1. เพื่อให้สหกรณ์เผยแพร่ข้อมูลข่าวสารให้มีความทันสมัยเป็นปัจจุบัน\n2. เพื่อให้สมาชิกสหกรณ์และหน่วยงาน อื่น ๆ ได้รับทราบข่าวสารของสหกรณ์ได้อย่างรวดเร็วทันเหตุการณ์\n3. เพื่อให้สหกรณ์มีสื่อประชาสัมพันธ์ที่เหมาะสม\n4. เพื่อให้สมาชิกสหกรณ์ได้รับทราบข้อมูลข่าวสารของสหกรณ์ได้หลายช่องทาง', ?)
    `, [m5Id, defaultManagerId]);

    // Mission 6
    const m6 = await runQuery(`INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, 6, 'เสริมสร้างความสัมพันธ์ที่ดีต่อสหกรณ์อื่นและสังคม')`, [planId]);
    const m6Id = m6.lastID;

    await runQuery(`
      INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) 
      VALUES (?, 1, 'เสริมสร้างการมีส่วนร่วมและความสัมพันธ์ ระหว่างสหกรณ์เครือข่ายหรือสหกรณ์อื่นและสังคม', 'แผนการมีส่วนร่วมและสร้างความสัมพันธ์', 
      'เพื่อแลกเปลี่ยนความรู้ประสบการณ์ ในการทำงานระหว่างสหกรณ์เครือข่ายสร้างปฏิสัมพันธ์ที่ดี เพื่อนำมาใช้พัฒนาสหกรณ์', ?)
    `, [m6Id, defaultManagerId]);

    console.log('Database initialized successfully with default users and seeded 3rd Strategic Plan.');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    db.close((err) => {
      if (err) console.error('Error closing database:', err.message);
      else console.log('Database connection closed.');
    });
  }
}

init();
