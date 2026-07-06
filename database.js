const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

// Enable WAL mode for better concurrency
db.run('PRAGMA journal_mode = WAL');

// Initialize tables
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Admins table
      db.run(`
        CREATE TABLE IF NOT EXISTS admins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Brochures table
      db.run(`
        CREATE TABLE IF NOT EXISTS brochures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // E-Materials table
      db.run(`
        CREATE TABLE IF NOT EXISTS ematerials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Enquiries table
      db.run(`
        CREATE TABLE IF NOT EXISTS enquiries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          language TEXT,
          mode TEXT,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);

        // Create default admin if not exists
        db.get('SELECT id FROM admins WHERE username = ?', ['admin'], (err, row) => {
          if (err) return reject(err);
          if (!row) {
            const hash = bcrypt.hashSync('afc2024', 10);
            db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash], (err) => {
              if (err) return reject(err);
              console.log('Default admin created: admin / afc2024');
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
  });
}

// Promise wrappers
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      err ? reject(err) : resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

// Brochure helpers
const brochureDb = {
  getAll: () => all('SELECT * FROM brochures ORDER BY created_at DESC'),
  getById: (id) => get('SELECT * FROM brochures WHERE id = ?', [id]),
  create: async (data) => {
    const result = await run(`
      INSERT INTO brochures (title, description, file_name, file_path, date)
      VALUES (?, ?, ?, ?, ?)
    `, [data.title, data.description, data.fileName, data.filePath, data.date]);
    return { id: result.lastInsertRowid, ...data };
  },
  delete: (id) => run('DELETE FROM brochures WHERE id = ?', [id]),
};

// E-Material helpers
const ematerialDb = {
  getAll: () => all('SELECT * FROM ematerials ORDER BY created_at DESC'),
  getById: (id) => get('SELECT * FROM ematerials WHERE id = ?', [id]),
  create: async (data) => {
    const result = await run(`
      INSERT INTO ematerials (title, description, file_name, file_path, date)
      VALUES (?, ?, ?, ?, ?)
    `, [data.title, data.description, data.fileName, data.filePath, data.date]);
    return { id: result.lastInsertRowid, ...data };
  },
  delete: (id) => run('DELETE FROM ematerials WHERE id = ?', [id]),
};

// Enquiry helpers
const enquiryDb = {
  create: async (data) => {
    const result = await run(`
      INSERT INTO enquiries (name, email, phone, language, mode, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [data.name, data.email, data.phone, data.language, data.mode, data.message]);
    return { id: result.lastInsertRowid, ...data, created_at: new Date().toISOString() };
  },
  getAll: () => all('SELECT * FROM enquiries ORDER BY created_at DESC'),
};

// Admin helpers
const adminDb = {
  findByUsername: (username) => get('SELECT * FROM admins WHERE username = ?', [username]),
  verifyPassword: (admin, password) => bcrypt.compareSync(password, admin.password_hash),
};

module.exports = {
  db,
  initDatabase,
  brochureDb,
  ematerialDb,
  enquiryDb,
  adminDb,
};