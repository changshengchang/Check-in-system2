import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Allow large signatures in JSON payloads
app.use(express.json({ limit: '15mb' }));

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');

// Default Seed Data
const DEFAULT_EVENT_INFO = {
  id: 'event-2026-001',
  title: '苗栗縣三義鄉公所培訓或活動簽到系統',
  date: '2026-10-21',
  time: '09:00 - 16:30',
  location: '公所 3F 大禮堂 / 多功能研討室',
  organizer: '苗栗縣三義鄉公所',
  notes: '請準時出席，並記得於簽到及簽退時完成電子手寫簽名與人事覆核'
};

const DEFAULT_ROSTER = [
  { id: 'p1', name: '王大偉', title: '技術研發總監', department: '資訊研發處', phone: '0912-345-678', email: 'dawei.wang@example.com' },
  { id: 'p2', name: '陳建明', title: '高級後端工程師', department: '雲端架構組', phone: '0923-456-789', email: 'jm.chen@example.com' },
  { id: 'p3', name: '林美華', title: '資深產品經理', department: '產品創新中心', phone: '0934-567-890', email: 'meihua.lin@example.com' },
  { id: 'p4', name: '張淑珍', title: '人力資源經理', department: '人資發展部', phone: '0945-678-901', email: 'sc.chang@example.com' },
  { id: 'p5', name: '黃俊彥', title: '行銷企劃專員', department: '品牌推廣組', phone: '0956-789-012', email: 'jy.huang@example.com' },
  { id: 'p6', name: '劉怡君', title: '財務分析師', department: '財務會計處', phone: '0967-890-123', email: 'yc.liu@example.com' },
  { id: 'p7', name: '楊宗緯', title: '品保工程師', department: '品質工程部', phone: '0978-901-234', email: 'zw.yang@example.com' },
  { id: 'p8', name: '蔡雅芳', title: '客戶關係主管', department: '客戶成功處', phone: '0989-012-345', email: 'yf.tsai@example.com' },
  { id: 'p9', name: '許瑞祥', title: '系統維運工程師', department: 'IT基礎維運組', phone: '0990-123-456', email: 'rx.hsu@example.com' },
  { id: 'p10', name: '吳佩蓉', title: 'UI/UX 設計專員', department: '設計體驗中心', phone: '0901-234-567', email: 'pr.wu@example.com' },
  { id: 'p11', name: '詹小鎮', title: '營運管理專員', department: '營運管理部', phone: '0911-222-333', email: 'xz.zhan@example.com' },
  { id: 'p12', name: '楊過', title: '資深系統架構師', department: '技術平台部', phone: '0922-333-444', email: 'guo.yang@example.com' },
  { id: 'p13', name: '張小風', title: '專案管理師', department: '專案管理處', phone: '0933-444-555', email: 'xf.chang@example.com' }
];

interface AppData {
  eventInfo: typeof DEFAULT_EVENT_INFO;
  roster: typeof DEFAULT_ROSTER;
  checkIns: any[];
  version: number;
  updatedAt: string;
}

// In-memory cache + file sync
let db: AppData = {
  eventInfo: DEFAULT_EVENT_INFO,
  roster: DEFAULT_ROSTER,
  checkIns: [],
  version: 1,
  updatedAt: new Date().toISOString()
};

function initData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      let loadedEvent = parsed.eventInfo || DEFAULT_EVENT_INFO;
      if (!loadedEvent.title || loadedEvent.title.includes('2026年度企業核心職能培訓')) {
        loadedEvent = { ...DEFAULT_EVENT_INFO, ...loadedEvent, title: DEFAULT_EVENT_INFO.title, organizer: DEFAULT_EVENT_INFO.organizer };
      }
      db = {
        eventInfo: loadedEvent,
        roster: parsed.roster || DEFAULT_ROSTER,
        checkIns: parsed.checkIns || [],
        version: parsed.version || 1,
        updatedAt: parsed.updatedAt || new Date().toISOString()
      };
      saveData();
      console.log(`[DB] Loaded data from disk. Roster: ${db.roster.length}, CheckIns: ${db.checkIns.length}`);
    } else {
      saveData();
      console.log('[DB] Initialized default database');
    }
  } catch (err) {
    console.error('[DB] Error loading database file:', err);
  }
}

// Active Server-Sent Events subscribers across all devices
const sseClients = new Set<express.Response>();

function broadcastData(action: string) {
  const payload = {
    action,
    eventInfo: db.eventInfo,
    roster: db.roster,
    checkIns: db.checkIns,
    version: db.version,
    updatedAt: db.updatedAt
  };
  const message = `data: ${JSON.stringify(payload)}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

function saveData(action: string = 'UPDATE') {
  try {
    db.version = (db.version || 0) + 1;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
    // Instantly push to all connected phone and computer clients
    broadcastData(action);
  } catch (err) {
    console.error('[DB] Error saving data file:', err);
  }
}

initData();

// --- REST API & REAL-TIME STREAM ROUTES ---

// 1. Server-Sent Events (SSE) Stream for Instant Auto-Sync
app.get('/api/events', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Push immediate current state to the newly connected device
  const initialPayload = {
    action: 'INIT',
    eventInfo: db.eventInfo,
    roster: db.roster,
    checkIns: db.checkIns,
    version: db.version,
    updatedAt: db.updatedAt
  };
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  sseClients.add(res);

  // Keep-alive heartbeat every 15s to prevent mobile timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15000);

  _req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// 2. Get full event data (sync endpoint)
app.get('/api/data', (_req, res) => {
  res.json({
    eventInfo: db.eventInfo,
    roster: db.roster,
    checkIns: db.checkIns,
    version: db.version,
    updatedAt: db.updatedAt
  });
});

// 3. Update event information
app.put('/api/event', (req, res) => {
  const updatedInfo = req.body;
  if (!updatedInfo || !updatedInfo.title) {
    res.status(400).json({ error: '活動標題為必填' });
    return;
  }
  db.eventInfo = { ...db.eventInfo, ...updatedInfo };
  saveData('EVENT_INFO_UPDATED');
  res.json({ success: true, eventInfo: db.eventInfo, version: db.version });
});

// 4. Submit or update check-in (supports mobile & desktop)
app.post('/api/checkins', (req, res) => {
  const record = req.body;
  if (!record || !record.name) {
    res.status(400).json({ error: '姓名為必填' });
    return;
  }

  // Check if existing
  const cleanName = record.name.trim().toLowerCase();
  const existingIndex = db.checkIns.findIndex(
    c => (record.participantId && c.participantId === record.participantId) ||
         c.name.trim().toLowerCase() === cleanName
  );

  if (existingIndex >= 0) {
    db.checkIns[existingIndex] = { ...db.checkIns[existingIndex], ...record };
  } else {
    db.checkIns.unshift(record);
  }

  saveData('CHECKIN_SUBMITTED');
  res.json({ success: true, record, checkIns: db.checkIns, version: db.version });
});

// 5. Delete or cancel a check-in
app.delete('/api/checkins/:id', (req, res) => {
  const { id } = req.params;
  db.checkIns = db.checkIns.filter(c => c.id !== id && c.participantId !== id);
  saveData('CHECKIN_DELETED');
  res.json({ success: true, checkIns: db.checkIns, version: db.version });
});

// 6. Reset all check-in records
app.post('/api/checkins/reset', (_req, res) => {
  db.checkIns = [];
  saveData('CHECKINS_RESET');
  res.json({ success: true, checkIns: [], version: db.version });
});

// 7. Import or update roster (from Excel / CSV)
app.post('/api/roster', (req, res) => {
  const { roster: newParticipants, mode } = req.body;
  if (!Array.isArray(newParticipants)) {
    res.status(400).json({ error: '名冊格式錯誤' });
    return;
  }

  if (mode === 'replace') {
    db.roster = newParticipants;
  } else {
    // Append with name deduplication
    const existingNames = new Set(db.roster.map(p => p.name.trim().toLowerCase()));
    const toAdd = newParticipants.filter(p => !existingNames.has(p.name.trim().toLowerCase()));
    db.roster = [...db.roster, ...toAdd];
  }

  saveData('ROSTER_UPDATED');
  res.json({ success: true, roster: db.roster, version: db.version });
});

// 8. Add single attendee manually
app.post('/api/roster/add', (req, res) => {
  const participant = req.body;
  if (!participant || !participant.name) {
    res.status(400).json({ error: '姓名為必填' });
    return;
  }
  db.roster.push(participant);
  saveData('ROSTER_PARTICIPANT_ADDED');
  res.json({ success: true, roster: db.roster, version: db.version });
});

// 9. Delete attendee from roster
app.delete('/api/roster/:id', (req, res) => {
  const { id } = req.params;
  db.roster = db.roster.filter(p => p.id !== id);
  saveData('ROSTER_PARTICIPANT_DELETED');
  res.json({ success: true, roster: db.roster, version: db.version });
});

// --- SERVER SETUP (Vite in Dev, Static in Prod) ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Training check-in full-stack server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
