const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { initDatabase, brochureDb, ematerialDb, enquiryDb, adminDb, run } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'afc-secret-change-in-production';
const JWT_EXPIRES = '7d';

// Ensure upload directories exist
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BROCHURE_DIR = path.join(UPLOAD_DIR, 'brochures');
const EMATERIAL_DIR = path.join(UPLOAD_DIR, 'ematerials');
[UPLOAD_DIR, BROCHURE_DIR, EMATERIAL_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.route.path.includes('brochure') ? 'brochures' : 'ematerials';
    cb(null, path.join(UPLOAD_DIR, type));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// Auth middleware
function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  const token = auth.slice(7);
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Generate JWT
function generateToken(admin) {
  return jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ===== AUTH ROUTES =====
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'Username and password required'
    });
  }

  try {
    const admin = await adminDb.findByUsername(username);

    if (!admin || !adminDb.verifyPassword(admin, password)) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const token = generateToken(admin);

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username
      }
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Login failed'
    });
  }
});


app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ admin: req.admin });
});

// ===== BROCHURE ROUTES =====
// ===== BROCHURE ROUTES =====

app.get('/api/brochures', async (req, res) => {
  try {
    const brochures = (await brochureDb.getAll()).map(b => ({
      ...b,
      downloadUrl: `/uploads/brochures/${path.basename(b.file_path)}`
    }));

    res.json(brochures);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});


app.post(
  '/api/brochures',
  authRequired,
  upload.single('file'),
  async (req, res) => {

    const { title, description } = req.body;

    if (!title || !req.file) {
      return res.status(400).json({
        error: 'Title and PDF file required'
      });
    }

    const date = new Date().toLocaleDateString(
      'en-IN',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }
    );

    try {

      const doc = await brochureDb.create({
        title,
        description: description || '',
        fileName: req.file.originalname,
        filePath: req.file.path,
        date
      });

      res.status(201).json({
        ...doc,

        downloadUrl:
          `/uploads/brochures/${path.basename(doc.filePath)}`
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);
app.delete('/api/brochures/:id', authRequired, async (req, res) => {
  try {
    const brochure = await brochureDb.getById(req.params.id);

    if (!brochure) {
      return res.status(404).json({
        error: 'Brochure not found'
      });
    }

    if (fs.existsSync(brochure.file_path)) {
      fs.unlinkSync(brochure.file_path);
    }

    await brochureDb.delete(req.params.id);

    res.json({
      success: true
    });

  } catch (err) {
    console.error('Brochure delete error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ===== E-MATERIAL ROUTES =====
app.get('/api/ematerials', async (req, res) => {
  try {
    const ematerials = (await ematerialDb.getAll()).map(e => ({
      ...e,
      downloadUrl: `/uploads/ematerials/${path.basename(e.filePath)}`,
    }));
    res.json(ematerials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ematerials', authRequired, upload.single('file'), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !req.file) return res.status(400).json({ error: 'Title and PDF file required' });

  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  try {
    const doc = await ematerialDb.create({
      title,
      description: description || '',
      fileName: req.file.originalname,
      filePath: req.file.path,
      date,
    });

    res.status(201).json({ ...doc, downloadUrl: `/uploads/ematerials/${path.basename(doc.file_path)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ematerials/:id', authRequired, async (req, res) => {
  try {
    const ematerial = await ematerialDb.getById(req.params.id);
    if (!ematerial) return res.status(404).json({ error: 'Not found' });

    if (fs.existsSync(ematerial.file_path)) fs.unlinkSync(ematerial.file_path);
    await ematerialDb.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ENQUIRY ROUTES =====
app.post('/api/enquiries', async (req, res) => {
  const { name, email, phone, language, mode, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  try {
    const enquiry = await enquiryDb.create({ name, email, phone, language, mode, message });
    res.status(201).json(enquiry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/enquiries', authRequired, async (req, res) => {
  try {
    res.json(await enquiryDb.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/enquiries/:id', authRequired, async (req, res) => {
  try {
    await run('DELETE FROM enquiries WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// ===== SPA FALLBACK =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

// Init DB and start
initDatabase();
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Uploads: ${UPLOAD_DIR}`);
  console.log(`🗄️  Database: ${path.join(__dirname, 'database.sqlite')}`);
});