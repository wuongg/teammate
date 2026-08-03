---
name: team-profile
description: >-
  Tạo và quản lý profile nhóm: tên nhóm, thành viên, trưởng nhóm (lead),
  vai trò từng thành viên. Use when the user asks about team profiles, group
  management, nhóm, thành viên, lead, vai trò, or checkpoint team tracking.
---

# Team Profile

## Mục đích

Skill này hướng dẫn agent tạo/cập nhật profile nhóm trong project `checkpoint`.

## Cấu trúc dữ liệu nhóm

Mỗi nhóm gồm:

```json
{
  "id": "uuid",
  "name": "Tên nhóm",
  "description": "Mô tả ngắn",
  "members": [
    {
      "id": "uuid",
      "name": "Họ tên",
      "role": "Vai trò tự ghi",
      "isLead": true,
      "doing": "Công việc đang làm",
      "done": "Công việc đã hoàn thành"
    }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

## Quy tắc

1. **Một lead duy nhất** — chỉ một thành viên có `isLead: true`. Khi đặt lead mới, bỏ lead cũ.
2. **Vai trò** — user tự ghi text tự do cho từng thành viên.
3. **Công việc** — mỗi thành viên có `doing` (đang làm) và `done` (đã làm), text tự do. Cập nhật bằng cách nhấn vào thẻ nhóm.
4. **Lưu trữ** — PostgreSQL (Neon) qua API Express. Biến môi trường `DATABASE_URL`.

## Database

- Provider: [Neon Postgres](https://neon.tech) (free tier)
- Schema: `server/schema.sql` — bảng `groups`, `members`
- API: Express server trong `server/index.js`

## Deploy

1. Tạo project Neon → copy connection string
2. Copy `.env.example` → `.env`, điền `DATABASE_URL`
3. `npm install && npm start`
4. Deploy lên Railway / Render / Fly.io — set env `DATABASE_URL` và `PORT`

## Web app

- Chạy: `npm start` → http://localhost:3000
- Frontend: `public/` · Backend: `server/`

## Khi user yêu cầu tạo/sửa profile

1. Mở hoặc chạy web app trong project.
2. Hướng dẫn user: **Tạo nhóm** → điền tên → thêm thành viên → ghi vai trò → chọn lead. **Nhấn vào nhóm** để cập nhật công việc đang làm / đã làm của từng thành viên.
3. Nếu cần seed dữ liệu mẫu, thêm vào `localStorage` theo schema trên.

## Template báo cáo nhóm (markdown)

```markdown
# [Tên nhóm]

**Lead:** [Tên lead]

## Thành viên

| Tên | Vai trò | Đang làm | Đã làm | Lead |
|-----|---------|----------|--------|------|
| ... | ...     | ...      | ...    | ✓/   |

## Mô tả

[Mô tả nhóm]
```
