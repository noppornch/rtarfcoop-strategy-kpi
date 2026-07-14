const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const dbPath = path.join(__dirname, 'data', 'strategy.db');
const db = new sqlite3.Database(dbPath);
db.run('PRAGMA foreign_keys = ON;', (err) => {
  if (err) console.error('Failed to enable foreign keys:', err.message);
  else console.log('Foreign key support enabled.');
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'rtarfcoop-strategic-secret-key-1234',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Password helper functions
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Database helper functions (Promise-based)
function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// For safe SELECT queries returning one row
function queryGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function queryRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Auth Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden. Admin access required.' });
}

async function checkPermission(req, res, next) {
  const userId = req.session.userId;
  const userRole = req.session.role;
  const activityId = req.params.id || req.body.kpi_activity_id;

  if (userRole === 'admin') {
    return next();
  }

  if (userRole === 'manager') {
    try {
      const row = await queryGet(`
        SELECT 1 FROM kpi_activities ka
        JOIN strategies s ON ka.strategy_id = s.id
        WHERE ka.id = ? AND s.manager_id = ?
      `, [activityId, userId]);
      if (row) {
        return next();
      }
      return res.status(403).json({ error: 'Forbidden. You do not manage this strategy.' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const row = await queryGet('SELECT 1 FROM kpi_assignees WHERE kpi_activity_id = ? AND user_id = ?', [activityId, userId]);
    if (row) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden. You are not assigned to this activity.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ----------------------------------------------------
// AUTHENTICATION APIS
// ----------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await queryGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.password) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.name = user.name;

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    return res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      loggedIn: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role,
        name: req.session.name
      }
    });
  }
  return res.json({ loggedIn: false });
});

// ----------------------------------------------------
// STRATEGIC PLANS & HIERARCHY APIS
// ----------------------------------------------------

// Get all plans
app.get('/api/plans', requireAuth, async (req, res) => {
  try {
    const plans = await queryAll('SELECT * FROM strategic_plans ORDER BY id DESC');
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new strategic plan cycle
app.post('/api/plans', requireAuth, requireAdmin, async (req, res) => {
  const { name, start_year, end_year } = req.body;
  if (!name || !start_year || !end_year) {
    return res.status(400).json({ error: 'Please provide all fields' });
  }
  try {
    const result = await queryRun('INSERT INTO strategic_plans (name, start_year, end_year) VALUES (?, ?, ?)', [name, start_year, end_year]);
    res.status(201).json({ id: result.lastID, name, start_year, end_year });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a strategic plan
app.delete('/api/plans/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await queryRun('DELETE FROM strategic_plans WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get hierarchy (Missions -> Strategies only)
app.get('/api/plans/:id/hierarchy', requireAuth, async (req, res) => {
  try {
    const planId = req.params.id;
    const missions = await queryAll('SELECT * FROM missions WHERE strategic_plan_id = ? ORDER BY seq ASC', [planId]);
    
    for (const mission of missions) {
      const strategies = await queryAll(`
        SELECT s.*, u.name as manager_name 
        FROM strategies s 
        LEFT JOIN users u ON s.manager_id = u.id 
        WHERE s.mission_id = ? 
        ORDER BY s.seq ASC
      `, [mission.id]);
      mission.strategies = strategies;
    }

    res.json(missions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit strategic plan cycle
app.put('/api/plans/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, start_year, end_year } = req.body;
  if (!name || !start_year || !end_year) {
    return res.status(400).json({ error: 'Please provide all fields' });
  }
  try {
    await queryRun('UPDATE strategic_plans SET name = ?, start_year = ?, end_year = ? WHERE id = ?', [name, start_year, end_year, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Mission
app.post('/api/missions', requireAuth, requireAdmin, async (req, res) => {
  const { strategic_plan_id, seq, name } = req.body;
  try {
    const result = await queryRun('INSERT INTO missions (strategic_plan_id, seq, name) VALUES (?, ?, ?)', [strategic_plan_id, seq, name]);
    res.status(201).json({ id: result.lastID, strategic_plan_id, seq, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Mission
app.put('/api/missions/:id', requireAuth, requireAdmin, async (req, res) => {
  const { seq, name } = req.body;
  try {
    await queryRun('UPDATE missions SET seq = ?, name = ? WHERE id = ?', [seq, name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Strategy (with metadata fields and manager_id)
app.post('/api/strategies', requireAuth, requireAdmin, async (req, res) => {
  const { mission_id, seq, name, action_plan_name, objective_name, manager_id } = req.body;
  try {
    const result = await queryRun(
      'INSERT INTO strategies (mission_id, seq, name, action_plan_name, objective_name, manager_id) VALUES (?, ?, ?, ?, ?, ?)', 
      [mission_id, seq, name, action_plan_name, objective_name, manager_id || null]
    );
    res.status(201).json({ id: result.lastID, mission_id, seq, name, action_plan_name, objective_name, manager_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Strategy metadata
app.put('/api/strategies/:id', requireAuth, requireAdmin, async (req, res) => {
  const strategyId = req.params.id;
  const { seq, name, action_plan_name, objective_name, manager_id } = req.body;
  try {
    await queryRun(`
      UPDATE strategies SET 
        seq = ?,
        name = ?,
        action_plan_name = ?,
        objective_name = ?,
        manager_id = ?
      WHERE id = ?
    `, [seq, name, action_plan_name, objective_name, manager_id || null, strategyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generic Delete APIs
app.delete('/api/missions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await queryRun('DELETE FROM missions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/strategies/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await queryRun('DELETE FROM strategies WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// KPI ACTIVITIES & SUB-STEPS APIS
// ----------------------------------------------------

// Get activities directly for a strategy
app.get('/api/strategies/:id/activities', requireAuth, async (req, res) => {
  try {
    const strategyId = req.params.id;
    const activities = await queryAll('SELECT * FROM kpi_activities WHERE strategy_id = ? ORDER BY seq ASC', [strategyId]);
    
    for (const activity of activities) {
      // Get assignees
      const assignees = await queryAll(`
        SELECT u.id, u.name, u.username, u.role
        FROM users u
        JOIN kpi_assignees ka ON u.id = ka.user_id
        WHERE ka.kpi_activity_id = ?
      `, [activity.id]);
      activity.assignees = assignees;

      // Get sub-steps
      const steps = await queryAll('SELECT * FROM activity_steps WHERE kpi_activity_id = ? ORDER BY seq ASC', [activity.id]);
      activity.steps = steps;

      // Calculate progress percent automatically
      if (steps.length > 0) {
        const sum = steps.reduce((acc, curr) => acc + curr.progress_percent, 0);
        activity.progress_percent = Math.round(sum / steps.length);
      } else {
        activity.progress_percent = activity.progress_status === 'completed' ? 100 : (activity.progress_status === 'pending' ? 0 : 50);
      }
    }
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create KPI Activity under strategy
app.post('/api/activities', requireAuth, async (req, res) => {
  const {
    strategy_id, seq, kpi_name, kpi_type, target_value,
    activity, start_date, end_date, budget_allocated, assignees = []
  } = req.body;

  const userId = req.session.userId;
  const userRole = req.session.role;

  if (userRole !== 'admin') {
    if (userRole === 'manager') {
      try {
        const strategy = await queryGet('SELECT manager_id FROM strategies WHERE id = ?', [strategy_id]);
        if (!strategy || strategy.manager_id !== userId) {
          return res.status(403).json({ error: 'Forbidden. You do not manage this strategy.' });
        }
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    } else {
      return res.status(403).json({ error: 'Forbidden. Normal users cannot create activities.' });
    }
  }

  try {
    const result = await queryRun(`
      INSERT INTO kpi_activities (
        strategy_id, seq, kpi_name, kpi_type, target_value, actual_value,
        activity, start_date, end_date, budget_allocated, budget_spent, health_status, progress_status
      ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 0, 'on_track', 'pending')
    `, [strategy_id, seq, kpi_name, kpi_type, target_value, activity, start_date, end_date, budget_allocated]);
    
    const activityId = result.lastID;

    // Add assignees
    if (assignees && assignees.length > 0) {
      for (const userId of assignees) {
        await queryRun('INSERT OR IGNORE INTO kpi_assignees (kpi_activity_id, user_id) VALUES (?, ?)', [activityId, userId]);
      }
    }

    res.status(201).json({ id: activityId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update KPI Activity (Includes status, progress, budget, assignees)
app.put('/api/activities/:id', requireAuth, checkPermission, async (req, res) => {
  const activityId = req.params.id;
  const {
    kpi_name, kpi_type, target_value, actual_value,
    activity, start_date, end_date, budget_allocated, budget_spent,
    health_status, progress_status, assignees, steps
  } = req.body;

  try {
    // 1. Update activity columns
    await queryRun(`
      UPDATE kpi_activities SET
        kpi_name = COALESCE(?, kpi_name),
        kpi_type = COALESCE(?, kpi_type),
        target_value = COALESCE(?, target_value),
        actual_value = COALESCE(?, actual_value),
        activity = COALESCE(?, activity),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        budget_allocated = COALESCE(?, budget_allocated),
        budget_spent = COALESCE(?, budget_spent),
        health_status = COALESCE(?, health_status),
        progress_status = COALESCE(?, progress_status)
      WHERE id = ?
    `, [
      kpi_name, kpi_type, target_value, actual_value,
      activity, start_date, end_date, budget_allocated, budget_spent,
      health_status, progress_status, activityId
    ]);

    // 2. Update Assignees (only Admins/Managers can change assignments)
    if (assignees && (req.session.role === 'admin' || req.session.role === 'manager')) {
      await queryRun('DELETE FROM kpi_assignees WHERE kpi_activity_id = ?', [activityId]);
      for (const userId of assignees) {
        await queryRun('INSERT INTO kpi_assignees (kpi_activity_id, user_id) VALUES (?, ?)', [activityId, userId]);
      }
    }

    // 3. Update/Save sub-steps (Steps)
    if (steps) {
      // Fetch existing steps to determine deletes
      const existingSteps = await queryAll('SELECT id FROM activity_steps WHERE kpi_activity_id = ?', [activityId]);
      const existingIds = existingSteps.map(s => s.id);
      const incomingIds = steps.filter(s => s.id).map(s => s.id);

      // Delete removed steps
      const toDelete = existingIds.filter(id => !incomingIds.includes(id));
      for (const id of toDelete) {
        await queryRun('DELETE FROM activity_steps WHERE id = ?', [id]);
      }

      // Insert/Update steps
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.id) {
          // Update
          await queryRun(`
            UPDATE activity_steps SET
              seq = ?,
              step_name = ?,
              progress_percent = ?,
              actual_result = ?,
              due_date = ?
            WHERE id = ?
          `, [i + 1, step.step_name, step.progress_percent, step.actual_result, step.due_date, step.id]);
        } else {
          // Insert new
          await queryRun(`
            INSERT INTO activity_steps (kpi_activity_id, seq, step_name, progress_percent, actual_result, due_date)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [activityId, i + 1, step.step_name, step.progress_percent || 0, step.actual_result || '', step.due_date || '']);
        }
      }
    }

    res.json({ success: true, message: 'Activity updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete KPI Activity
app.delete('/api/activities/:id', requireAuth, checkPermission, async (req, res) => {
  try {
    await queryRun('DELETE FROM kpi_activities WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// MY TASKS API
// ----------------------------------------------------

app.get('/api/my-tasks', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  try {
    const activities = await queryAll(`
      SELECT ka.*, s.name as strategy_name, s.action_plan_name, s.objective_name, m.name as mission_name, sp.name as plan_name
      FROM kpi_activities ka
      JOIN kpi_assignees kas ON ka.id = kas.kpi_activity_id
      JOIN strategies s ON ka.strategy_id = s.id
      JOIN missions m ON s.mission_id = m.id
      JOIN strategic_plans sp ON m.strategic_plan_id = sp.id
      WHERE kas.user_id = ?
      ORDER BY ka.end_date ASC
    `, [userId]);

    for (const activity of activities) {
      const steps = await queryAll('SELECT * FROM activity_steps WHERE kpi_activity_id = ? ORDER BY seq ASC', [activity.id]);
      activity.steps = steps;
      if (steps.length > 0) {
        const sum = steps.reduce((acc, curr) => acc + curr.progress_percent, 0);
        activity.progress_percent = Math.round(sum / steps.length);
      } else {
        activity.progress_percent = activity.progress_status === 'completed' ? 100 : (activity.progress_status === 'pending' ? 0 : 50);
      }
    }

    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// USERS / USER MANAGEMENT APIS (Admin only)
// ----------------------------------------------------

app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const usersList = await queryAll('SELECT id, username, name, role FROM users ORDER BY name ASC');
    res.json(usersList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Please fill all user details.' });
  }

  try {
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const result = await queryRun('INSERT INTO users (username, password, salt, name, role) VALUES (?, ?, ?, ?, ?)', [username, hash, salt, name, role]);
    res.status(201).json({ id: result.lastID, username, name, role });
  } catch (err) {
    res.status(500).json({ error: 'Username already exists or database error: ' + err.message });
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { username, password, name, role } = req.body;

  try {
    if (password && password.trim() !== '') {
      const salt = generateSalt();
      const hash = hashPassword(password, salt);
      await queryRun('UPDATE users SET username = ?, password = ?, salt = ?, name = ?, role = ? WHERE id = ?', [username, hash, salt, name, role, userId]);
    } else {
      await queryRun('UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?', [username, name, role, userId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  if (parseInt(userId) === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  try {
    await queryRun('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DB ADMIN CRUD APIS (Admin only)
// ----------------------------------------------------

app.get('/api/db-admin/tables', requireAuth, requireAdmin, (req, res) => {
  res.json(['users', 'strategic_plans', 'missions', 'strategies', 'kpi_activities', 'kpi_assignees', 'activity_steps']);
});

app.get('/api/db-admin/schema/:table', requireAuth, requireAdmin, async (req, res) => {
  const table = req.params.table;
  const allowed = ['users', 'strategic_plans', 'missions', 'strategies', 'kpi_activities', 'kpi_assignees', 'activity_steps'];
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }
  try {
    const columns = await queryAll(`PRAGMA table_info(${table})`);
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db-admin/data/:table', requireAuth, requireAdmin, async (req, res) => {
  const table = req.params.table;
  const allowed = ['users', 'strategic_plans', 'missions', 'strategies', 'kpi_activities', 'kpi_assignees', 'activity_steps'];
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const totalCountRow = await queryGet(`SELECT COUNT(*) as count FROM ${table}`);
    const rows = await queryAll(`SELECT * FROM ${table} LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({
      total: totalCountRow.count,
      limit,
      offset,
      rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db-admin/data/:table', requireAuth, requireAdmin, async (req, res) => {
  const table = req.params.table;
  const allowed = ['users', 'strategic_plans', 'missions', 'strategies', 'kpi_activities', 'kpi_assignees', 'activity_steps'];
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }
  const record = req.body;
  const keys = Object.keys(record).filter(k => record[k] !== '' && record[k] !== undefined && k !== 'id');
  if (keys.length === 0) {
    return res.status(400).json({ error: 'Empty record' });
  }
  const values = keys.map(k => record[k]);
  
  if (table === 'users' && record.password && !record.salt) {
    const salt = generateSalt();
    const hash = hashPassword(record.password, salt);
    const passIdx = keys.indexOf('password');
    values[passIdx] = hash;
    keys.push('salt');
    values.push(salt);
  }
  
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  try {
    const result = await queryRun(sql, values);
    res.status(201).json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/db-admin/data/:table/:id', requireAuth, requireAdmin, async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  const allowed = ['users', 'strategic_plans', 'missions', 'strategies', 'kpi_activities', 'kpi_assignees', 'activity_steps'];
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }
  const record = req.body;
  const keys = Object.keys(record).filter(k => k !== 'id' && k !== 'salt');
  if (keys.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  const values = keys.map(k => record[k]);
  
  if (table === 'users' && record.password) {
    const passwordStr = record.password;
    if (passwordStr.length < 50) {
      const salt = generateSalt();
      const hash = hashPassword(passwordStr, salt);
      const passIdx = keys.indexOf('password');
      values[passIdx] = hash;
      keys.push('salt');
      values.push(salt);
    }
  }
  
  if (table === 'kpi_assignees') {
    const [actId, usrId] = id.split('-');
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE kpi_activity_id = ? AND user_id = ?`;
    try {
      await queryRun(sql, [...values, actId, usrId]);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  try {
    await queryRun(sql, [...values, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/db-admin/data/:table/:id', requireAuth, requireAdmin, async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  const allowed = ['users', 'strategic_plans', 'missions', 'strategies', 'kpi_activities', 'kpi_assignees', 'activity_steps'];
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }
  try {
    if (table === 'kpi_assignees') {
      const [actId, usrId] = id.split('-');
      await queryRun(`DELETE FROM ${table} WHERE kpi_activity_id = ? AND user_id = ?`, [actId, usrId]);
    } else {
      await queryRun(`DELETE FROM ${table} WHERE id = ?`, [id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DASHBOARD STATS API
// ----------------------------------------------------

app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  const planId = req.query.planId || 1;
  try {
    // 1. Get total missions and strategies count
    const stats = await queryGet(`
      SELECT 
        (SELECT COUNT(*) FROM missions WHERE strategic_plan_id = ?) as total_missions,
        (SELECT COUNT(*) FROM strategies s JOIN missions m ON s.mission_id = m.id WHERE m.strategic_plan_id = ?) as total_strategies
    `, [planId, planId]);

    // 2. Get activities metrics (budget, health, status)
    const activities = await queryAll(`
      SELECT ka.id, ka.budget_allocated, ka.budget_spent, ka.health_status, ka.progress_status
      FROM kpi_activities ka
      JOIN strategies s ON ka.strategy_id = s.id
      JOIN missions m ON s.mission_id = m.id
      WHERE m.strategic_plan_id = ?
    `, [planId]);

    let totalBudgetAllocated = 0;
    let totalBudgetSpent = 0;
    let healthCounts = { on_track: 0, at_risk: 0, off_track: 0 };
    let statusCounts = { pending: 0, in_progress: 0, completed: 0, delayed: 0 };
    let totalProgressSum = 0;
    let completedKpisCount = 0;

    for (const act of activities) {
      totalBudgetAllocated += act.budget_allocated || 0;
      totalBudgetSpent += act.budget_spent || 0;
      healthCounts[act.health_status] = (healthCounts[act.health_status] || 0) + 1;
      statusCounts[act.progress_status] = (statusCounts[act.progress_status] || 0) + 1;

      // Calculate progress of this activity based on its sub-steps
      const steps = await queryAll('SELECT progress_percent FROM activity_steps WHERE kpi_activity_id = ?', [act.id]);
      let progress = 0;
      if (steps.length > 0) {
        progress = Math.round(steps.reduce((acc, curr) => acc + curr.progress_percent, 0) / steps.length);
      } else {
        progress = act.progress_status === 'completed' ? 100 : (act.progress_status === 'pending' ? 0 : 50);
      }
      totalProgressSum += progress;
      if (act.progress_status === 'completed' || progress === 100) {
        completedKpisCount++;
      }
    }

    const avgProgress = activities.length > 0 ? Math.round(totalProgressSum / activities.length) : 0;

    // 3. Get progress by Mission
    const missionsProgress = await queryAll(`
      SELECT m.id, m.name, m.seq
      FROM missions m
      WHERE m.strategic_plan_id = ?
      ORDER BY m.seq ASC
    `, [planId]);

    for (const mission of missionsProgress) {
      const mActivities = await queryAll(`
        SELECT ka.id, ka.progress_status
        FROM kpi_activities ka
        JOIN strategies s ON ka.strategy_id = s.id
        WHERE s.mission_id = ?
      `, [mission.id]);

      let mProgressSum = 0;
      for (const act of mActivities) {
        const steps = await queryAll('SELECT progress_percent FROM activity_steps WHERE kpi_activity_id = ?', [act.id]);
        if (steps.length > 0) {
          mProgressSum += Math.round(steps.reduce((acc, curr) => acc + curr.progress_percent, 0) / steps.length);
        } else {
          mProgressSum += act.progress_status === 'completed' ? 100 : (act.progress_status === 'pending' ? 0 : 50);
        }
      }
      mission.avg_progress = mActivities.length > 0 ? Math.round(mProgressSum / mActivities.length) : 0;
      mission.total_activities = mActivities.length;
    }

    res.json({
      counts: stats,
      total_activities: activities.length,
      completed_activities: completedKpisCount,
      avg_progress: avgProgress,
      budget: {
        allocated: totalBudgetAllocated,
        spent: totalBudgetSpent
      },
      health: healthCounts,
      status: statusCounts,
      missions_progress: missionsProgress
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend routing fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
