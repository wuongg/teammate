import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, initDb, mapGroupRow } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

let dbReady = false;

async function ensureDb(_req, res, next) {
  try {
    if (!dbReady) {
      await initDb();
      dbReady = true;
    }
    next();
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
}

app.use(express.json());
app.use('/api', ensureDb);

app.get('/api/health', async (_req, res) => {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get('/api/groups', async (_req, res) => {
  try {
    const sql = getDb();
    const groupRows = await sql`
      SELECT id, name, description, created_at, updated_at
      FROM groups
      ORDER BY updated_at DESC
    `;

    if (!groupRows.length) {
      return res.json([]);
    }

    const memberRows = await sql`
      SELECT id, group_id, name, role, is_lead, doing, done, sort_order
      FROM members
      WHERE group_id = ANY(${groupRows.map((g) => g.id)})
      ORDER BY sort_order ASC
    `;

    const membersByGroup = memberRows.reduce((acc, row) => {
      if (!acc[row.group_id]) acc[row.group_id] = [];
      acc[row.group_id].push(row);
      return acc;
    }, {});

    res.json(groupRows.map((g) => mapGroupRow(g, membersByGroup[g.id] || [])));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const group = req.body;
    if (!group?.name?.trim()) {
      return res.status(400).json({ error: 'Tên nhóm là bắt buộc' });
    }

    const sql = getDb();
    const id = group.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const members = normalizeMembers(group.members);

    await sql`
      INSERT INTO groups (id, name, description, created_at, updated_at)
      VALUES (${id}, ${group.name.trim()}, ${group.description?.trim() || ''}, ${now}, ${now})
    `;

    await insertMembers(sql, id, members);

    const [created] = await sql`
      SELECT id, name, description, created_at, updated_at FROM groups WHERE id = ${id}
    `;
    const memberRows = await sql`
      SELECT id, group_id, name, role, is_lead, doing, done, sort_order
      FROM members WHERE group_id = ${id} ORDER BY sort_order ASC
    `;

    res.status(201).json(mapGroupRow(created, memberRows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const group = req.body;
    if (!group?.name?.trim()) {
      return res.status(400).json({ error: 'Tên nhóm là bắt buộc' });
    }

    const sql = getDb();
    const now = new Date().toISOString();
    const members = normalizeMembers(group.members);

    const updated = await sql`
      UPDATE groups
      SET name = ${group.name.trim()},
          description = ${group.description?.trim() || ''},
          updated_at = ${now}
      WHERE id = ${id}
      RETURNING id, name, description, created_at, updated_at
    `;

    if (!updated.length) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

    await sql`DELETE FROM members WHERE group_id = ${id}`;
    await insertMembers(sql, id, members);

    const memberRows = await sql`
      SELECT id, group_id, name, role, is_lead, doing, done, sort_order
      FROM members WHERE group_id = ${id} ORDER BY sort_order ASC
    `;

    res.json(mapGroupRow(updated[0], memberRows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    const sql = getDb();
    const deleted = await sql`
      DELETE FROM groups WHERE id = ${req.params.id} RETURNING id
    `;

    if (!deleted.length) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '../public')));
}

function normalizeMembers(members = []) {
  const list = members.filter((m) => m.name?.trim());
  const leadCount = list.filter((m) => m.isLead).length;

  if (list.length && leadCount === 0) list[0].isLead = true;
  if (leadCount > 1) {
    let found = false;
    list.forEach((m) => {
      if (m.isLead && !found) found = true;
      else m.isLead = false;
    });
  }

  return list;
}

async function insertMembers(sql, groupId, members) {
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    await sql`
      INSERT INTO members (id, group_id, name, role, is_lead, doing, done, sort_order)
      VALUES (
        ${m.id || crypto.randomUUID()},
        ${groupId},
        ${m.name.trim()},
        ${m.role?.trim() || ''},
        ${!!m.isLead},
        ${m.doing?.trim() || ''},
        ${m.done?.trim() || ''},
        ${i}
      )
    `;
  }
}

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ Thiếu DATABASE_URL. Copy .env.example → .env và điền connection string Neon.');
    process.exit(1);
  }

  await initDb();
  dbReady = true;
  console.log('✓ Database schema ready');

  app.listen(PORT, () => {
    console.log(`✓ Server chạy tại http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

export default app;
