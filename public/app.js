let groups = [];
let editingId = null;
let deletingId = null;
let progressGroupId = null;

const CACHE_KEY = 'team-profiles-cache';

const $ = (sel) => document.querySelector(sel);

const groupModal = $('#groupModal');
const progressModal = $('#progressModal');
const deleteModal = $('#deleteModal');
const groupsGrid = $('#groupsGrid');
const emptyState = $('#emptyState');
const membersList = $('#membersList');
const progressList = $('#progressList');
const dbBanner = $('#dbBanner');

function uuid() {
  return crypto.randomUUID();
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

function showDbError(message) {
  if (!dbBanner) return;
  dbBanner.hidden = false;
  dbBanner.textContent = `Không kết nối được database: ${message}. Kiểm tra DATABASE_URL trong file .env rồi chạy npm start.`;
}

function hideDbError() {
  if (dbBanner) dbBanner.hidden = true;
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    groups = JSON.parse(raw);
    return groups.length > 0;
  } catch {
    return false;
  }
}

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(groups));
}

function normalizeGroups(data) {
  return data.map((g) => ({
    ...g,
    members: (g.members || []).map((m) => ({
      ...m,
      doing: m.doing ?? '',
      done: m.done ?? ''
    }))
  }));
}

async function refreshGroups() {
  groups = normalizeGroups(await api('/groups'));
  saveCache();
  renderGroups();
}

async function loadGroups() {
  groups = normalizeGroups(await api('/groups'));
  saveCache();
}

function upsertGroup(saved) {
  const idx = groups.findIndex((g) => g.id === saved.id);
  if (idx === -1) groups.unshift(saved);
  else groups[idx] = saved;
}

function removeGroup(id) {
  groups = groups.filter((g) => g.id !== id);
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function renderGroups() {
  emptyState.hidden = groups.length > 0;
  groupsGrid.innerHTML = '';

  groups.forEach((group, index) => {
    const lead = group.members.find((m) => m.isLead);
    const card = document.createElement('article');
    card.className = 'group-card';
    card.style.animationDelay = `${index * 0.08}s`;
    card.dataset.groupId = group.id;

    const membersHtml = group.members.length
      ? group.members
          .map(
            (m) => `
        <div class="member-row">
          <div class="member-avatar ${m.isLead ? 'lead' : ''}">${getInitials(m.name)}</div>
          <div class="member-info">
            <div class="member-name">${escapeHtml(m.name)}</div>
            <div class="member-role">${escapeHtml(m.role || '—')}</div>
            <div class="member-work">
              <div class="work-line">
                <span class="work-label doing">Đang làm</span>
                <span class="work-text">${m.doing ? escapeHtml(m.doing) : '—'}</span>
              </div>
              <div class="work-line">
                <span class="work-label done">Đã làm</span>
                <span class="work-text">${m.done ? escapeHtml(m.done) : '—'}</span>
              </div>
            </div>
          </div>
          ${m.isLead ? '<span class="lead-badge">Lead</span>' : ''}
        </div>`
          )
          .join('')
      : '<p class="no-members">Chưa có thành viên</p>';

    card.innerHTML = `
      <div class="card-top">
        <div class="card-main">
          <h3 class="card-title">${escapeHtml(group.name)}</h3>
          ${group.description ? `<p class="card-desc">${escapeHtml(group.description)}</p>` : ''}
          <span class="card-hint">Nhấn để cập nhật công việc</span>
        </div>
        <div class="card-actions">
          <button type="button" data-edit="${group.id}">Sửa</button>
          <button type="button" class="delete-btn" data-delete="${group.id}">Xóa</button>
        </div>
      </div>
      <div class="members-preview">
        <h4>Thành viên (${group.members.length})${lead ? ` · Lead: ${escapeHtml(lead.name)}` : ''}</h4>
        ${membersHtml}
      </div>`;

    groupsGrid.appendChild(card);
  });

  groupsGrid.querySelectorAll('.group-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      openProgressModal(card.dataset.groupId);
    });
  });

  groupsGrid.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.edit);
    });
  });

  groupsGrid.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.delete);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function createMemberRow(member = {}, index = 0) {
  const row = document.createElement('div');
  row.className = 'member-form-row' + (member.isLead ? ' is-lead' : '');
  row.dataset.memberId = member.id || uuid();

  row.innerHTML = `
    <div class="member-index">${index + 1}</div>
    <div class="member-fields">
      <label class="member-field">
        <span>Họ tên</span>
        <input type="text" class="member-name-input" placeholder="Nguyễn Văn A" value="${escapeHtml(member.name || '')}" required>
      </label>
      <label class="member-field">
        <span>Vai trò</span>
        <input type="text" class="member-role-input" placeholder="Developer, Designer..." value="${escapeHtml(member.role || '')}">
      </label>
    </div>
    <div class="member-actions">
      <button type="button" class="btn-lead ${member.isLead ? 'active' : ''}" title="Đặt làm trưởng nhóm">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${member.isLead ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        Lead
      </button>
      <input type="radio" name="groupLead" class="member-lead-radio" ${member.isLead ? 'checked' : ''}>
      <button type="button" class="btn-remove-member" title="Xóa thành viên">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`;

  const leadBtn = row.querySelector('.btn-lead');
  const leadRadio = row.querySelector('.member-lead-radio');

  leadBtn.addEventListener('click', () => {
    membersList.querySelectorAll('.member-form-row').forEach((r) => {
      r.classList.remove('is-lead');
      r.querySelector('.btn-lead').classList.remove('active');
      r.querySelector('.btn-lead svg').setAttribute('fill', 'none');
      r.querySelector('.member-lead-radio').checked = false;
    });
    row.classList.add('is-lead');
    leadBtn.classList.add('active');
    leadBtn.querySelector('svg').setAttribute('fill', 'currentColor');
    leadRadio.checked = true;
  });

  row.querySelector('.btn-remove-member').addEventListener('click', () => {
    if (membersList.children.length <= 1) return;
    const wasLead = leadRadio.checked;
    row.remove();
    reindexMembers();
    if (wasLead) {
      const first = membersList.querySelector('.member-form-row');
      if (first) first.querySelector('.btn-lead').click();
    }
  });

  return row;
}

function reindexMembers() {
  membersList.querySelectorAll('.member-form-row').forEach((row, i) => {
    row.querySelector('.member-index').textContent = i + 1;
  });
}

function appendMemberRow(member = {}) {
  const index = membersList.children.length;
  membersList.appendChild(createMemberRow(member, index));
}

function openCreateModal() {
  editingId = null;
  $('#modalTitle').textContent = 'Tạo nhóm';
  $('#modalEyebrow').textContent = 'Nhóm mới';
  $('#groupName').value = '';
  $('#groupDesc').value = '';

  membersList.innerHTML = '';
  appendMemberRow({ isLead: true });

  groupModal.showModal();
  $('#groupName').focus();
}

function openEditModal(id) {
  const group = groups.find((g) => g.id === id);
  if (!group) return;

  editingId = id;
  $('#modalTitle').textContent = group.name;
  $('#modalEyebrow').textContent = 'Chỉnh sửa';
  $('#groupName').value = group.name;
  $('#groupDesc').value = group.description || '';

  membersList.innerHTML = '';
  if (group.members.length) {
    group.members.forEach((m, i) => membersList.appendChild(createMemberRow(m, i)));
  } else {
    appendMemberRow({ isLead: true });
  }

  groupModal.showModal();
}

function openProgressModal(id) {
  const group = groups.find((g) => g.id === id);
  if (!group) return;

  progressGroupId = id;
  $('#progressModalTitle').textContent = group.name;
  progressList.innerHTML = '';

  if (!group.members.length) {
    progressList.innerHTML = '<p class="no-members">Nhóm chưa có thành viên.</p>';
  } else {
    group.members.forEach((member) => {
      const row = document.createElement('div');
      row.className = 'progress-row' + (member.isLead ? ' is-lead' : '');
      row.dataset.memberId = member.id;

      row.innerHTML = `
        <div class="progress-row-head">
          <div class="member-avatar ${member.isLead ? 'lead' : ''}">${getInitials(member.name)}</div>
          <div class="progress-row-info">
            <div class="member-name">${escapeHtml(member.name)}</div>
            <div class="member-role">${escapeHtml(member.role || '—')}${member.isLead ? ' · Lead' : ''}</div>
          </div>
        </div>
        <label class="work-field">
          <span class="work-field-label doing">Công việc đang làm</span>
          <textarea class="work-doing-input" rows="2" placeholder="VD: Đang thiết kế giao diện trang chủ...">${escapeHtml(member.doing || '')}</textarea>
        </label>
        <label class="work-field">
          <span class="work-field-label done">Công việc đã làm</span>
          <textarea class="work-done-input" rows="2" placeholder="VD: Hoàn thành wireframe, setup database...">${escapeHtml(member.done || '')}</textarea>
        </label>`;

      progressList.appendChild(row);
    });
  }

  progressModal.showModal();
}

async function saveProgress() {
  if (!progressGroupId) return;

  const group = groups.find((g) => g.id === progressGroupId);
  if (!group) return;

  const updates = [];
  progressList.querySelectorAll('.progress-row').forEach((row) => {
    updates.push({
      id: row.dataset.memberId,
      doing: row.querySelector('.work-doing-input').value.trim(),
      done: row.querySelector('.work-done-input').value.trim()
    });
  });

  updates.forEach((u) => {
    const member = group.members.find((m) => m.id === u.id);
    if (member) {
      member.doing = u.doing;
      member.done = u.done;
    }
  });
  group.updatedAt = new Date().toISOString();

  const groupId = progressGroupId;
  progressGroupId = null;
  saveCache();
  renderGroups();
  progressModal.close();

  try {
    await api(`/groups/${groupId}/work`, {
      method: 'PATCH',
      body: JSON.stringify({ members: updates })
    });
    hideDbError();
  } catch (err) {
    alert(`Lưu thất bại: ${err.message}`);
    try {
      await refreshGroups();
    } catch {
      showDbError(err.message);
    }
  }
}

function openDeleteModal(id) {
  deletingId = id;
  deleteModal.showModal();
}

function collectMembersFromForm() {
  const rows = membersList.querySelectorAll('.member-form-row');
  const members = [];
  const existingGroup = editingId ? groups.find((g) => g.id === editingId) : null;

  rows.forEach((row) => {
    const name = row.querySelector('.member-name-input').value.trim();
    if (!name) return;

    const memberId = row.dataset.memberId;
    const existingMember = existingGroup?.members.find((m) => m.id === memberId);

    members.push({
      id: memberId,
      name,
      role: row.querySelector('.member-role-input').value.trim(),
      isLead: row.querySelector('.member-lead-radio').checked,
      doing: existingMember?.doing ?? '',
      done: existingMember?.done ?? ''
    });
  });

  const leadCount = members.filter((m) => m.isLead).length;
  if (members.length > 0 && leadCount === 0) members[0].isLead = true;
  if (leadCount > 1) {
    let found = false;
    members.forEach((m) => {
      if (m.isLead && !found) found = true;
      else m.isLead = false;
    });
  }

  return members;
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const name = $('#groupName').value.trim();
  if (!name) return;

  const members = collectMembersFromForm();
  const now = new Date().toISOString();
  const wasEditing = editingId;
  const data = {
    id: editingId || uuid(),
    name,
    description: $('#groupDesc').value.trim(),
    members,
    createdAt: wasEditing ? groups.find((g) => g.id === wasEditing)?.createdAt || now : now,
    updatedAt: now
  };

  upsertGroup(data);
  saveCache();
  renderGroups();
  groupModal.close();
  editingId = null;

  try {
    const saved = wasEditing
      ? await api(`/groups/${wasEditing}`, { method: 'PUT', body: JSON.stringify(data) })
      : await api('/groups', { method: 'POST', body: JSON.stringify(data) });

    upsertGroup(saved);
    saveCache();
    renderGroups();
    hideDbError();
  } catch (err) {
    alert(`Lưu thất bại: ${err.message}`);
    try {
      await refreshGroups();
    } catch {
      showDbError(err.message);
    }
  }
}

async function confirmDelete() {
  if (!deletingId) return;

  const id = deletingId;
  removeGroup(id);
  saveCache();
  renderGroups();
  deletingId = null;
  deleteModal.close();

  try {
    await api(`/groups/${id}`, { method: 'DELETE' });
    hideDbError();
  } catch (err) {
    alert(`Xóa thất bại: ${err.message}`);
    try {
      await refreshGroups();
    } catch {
      showDbError(err.message);
    }
  }
}

function bindEvents() {
  $('#btnNewGroup').addEventListener('click', openCreateModal);
  $('#btnEmptyCreate').addEventListener('click', openCreateModal);
  $('#btnCloseModal').addEventListener('click', () => groupModal.close());
  $('#btnCancel').addEventListener('click', () => groupModal.close());
  $('#btnAddMember').addEventListener('click', () => appendMemberRow());

  $('#groupForm').addEventListener('submit', handleFormSubmit);

  $('#btnCloseDelete').addEventListener('click', () => deleteModal.close());
  $('#btnCancelDelete').addEventListener('click', () => deleteModal.close());
  $('#btnConfirmDelete').addEventListener('click', confirmDelete);

  $('#btnCloseProgress').addEventListener('click', () => progressModal.close());
  $('#btnCancelProgress').addEventListener('click', () => progressModal.close());
  $('#btnSaveProgress').addEventListener('click', saveProgress);

  groupModal.addEventListener('click', (e) => {
    if (e.target === groupModal) groupModal.close();
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) deleteModal.close();
  });
  progressModal.addEventListener('click', (e) => {
    if (e.target === progressModal) progressModal.close();
  });
}

async function init() {
  bindEvents();
  const hasCache = loadFromCache();
  if (hasCache) renderGroups();

  try {
    await loadGroups();
    hideDbError();
    renderGroups();
  } catch (err) {
    if (!hasCache) showDbError(err.message);
    else renderGroups();
  }
}

init();
