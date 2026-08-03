import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, initDb, mapGroupRow, buildGroupFromInput } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

let dbReady = false;

app.use(express.json());

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
    const rows = await sql`
      SELECT
        g.id,
        g.name,
        g.description,
        g.created_at,
        g.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', m.id,
              'name', m.name,
              'role', m.role,
              'is_lead', m.is_lead,
              'doing', m.doing,
              'done', m.done,
              'sort_order', m.sort_order,
              'updated_at', m.updated_at
            )
            ORDER BY m.sort_order
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'::json
        ) AS members
      FROM groups g
      LEFT JOIN members m ON m.group_id = g.id
      GROUP BY g.id
      ORDER BY g.updated_at DESC
    `;

    res.json(
      rows.map((row) =>
        mapGroupRow(row, (row.members || []).sort((a, b) => a.sort_order - b.sort_order))
      )
    );
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
    const members = normalizeMembers(group.members).map((m) => ({
      ...m,
      id: m.id || crypto.randomUUID()
    }));

    await sql`
      INSERT INTO groups (id, name, description, created_at, updated_at)
      VALUES (${id}, ${group.name.trim()}, ${group.description?.trim() || ''}, ${now}, ${now})
    `;

    await insertMembers(sql, id, members);

    res.status(201).json(
      buildGroupFromInput(
        {
          id,
          name: group.name.trim(),
          description: group.description?.trim() || '',
          created_at: now,
          updated_at: now
        },
        members
      )
    );
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
    const members = normalizeMembers(group.members).map((m) => ({
      ...m,
      id: m.id || crypto.randomUUID()
    }));

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

    res.json(
      buildGroupFromInput(
        { ...updated[0], updated_at: now },
        members
      )
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/groups/:id/work', async (req, res) => {
  try {
    const { id } = req.params;
    const { members } = req.body;

    if (!Array.isArray(members) || !members.length) {
      return res.status(400).json({ error: 'Dữ liệu thành viên không hợp lệ' });
    }

    const sql = getDb();
    const now = new Date().toISOString();
    const ids = members.map((m) => m.id);
    const doings = members.map((m) => m.doing?.trim() || '');
    const dones = members.map((m) => m.done?.trim() || '');

    await sql`
      UPDATE members AS m
      SET
        doing = v.doing,
        done = v.done,
        updated_at = ${now}::timestamptz
      FROM (
        SELECT
          unnest(${ids}::uuid[]) AS id,
          unnest(${doings}::text[]) AS doing,
          unnest(${dones}::text[]) AS done
      ) AS v
      WHERE m.id = v.id AND m.group_id = ${id}
    `;

    await sql`UPDATE groups SET updated_at = ${now} WHERE id = ${id}`;

    res.json({ ok: true, updatedAt: now, memberIds: ids });
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
  if (!members.length) return;

  await Promise.all(
    members.map((m, i) =>
      sql`
        INSERT INTO members (id, group_id, name, role, is_lead, doing, done, sort_order, updated_at)
        VALUES (
          ${m.id},
          ${groupId},
          ${m.name.trim()},
          ${m.role?.trim() || ''},
          ${!!m.isLead},
          ${m.doing?.trim() || ''},
          ${m.done?.trim() || ''},
          ${i},
          ${m.updatedAt || null}
        )
      `
    )
  );
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
