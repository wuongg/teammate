import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true;

let sql;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL chưa được cấu hình. Xem .env.example');
  }
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

export async function initDb() {
  const db = getDb();

  await db`
    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY,
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT DEFAULT '',
      is_lead BOOLEAN DEFAULT FALSE,
      doing TEXT DEFAULT '',
      done TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_members_group_id ON members(group_id)
  `;

  await db`
    ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `;
}

export function mapGroupRow(row, members) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members: members.map(mapMemberRow)
  };
}

export function mapMemberRow(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role || '',
    isLead: row.is_lead,
    doing: row.doing || '',
    done: row.done || '',
    updatedAt: row.updated_at || null
  };
}

export function buildGroupFromInput(groupRow, members) {
  return {
    id: groupRow.id,
    name: groupRow.name,
    description: groupRow.description || '',
    createdAt: groupRow.created_at,
    updatedAt: groupRow.updated_at,
    members: members.map((m, i) => ({
      id: m.id,
      name: m.name.trim(),
      role: m.role?.trim() || '',
      isLead: !!m.isLead,
      doing: m.doing?.trim() || '',
      done: m.done?.trim() || '',
      updatedAt: m.updatedAt || null
    }))
  };
}
