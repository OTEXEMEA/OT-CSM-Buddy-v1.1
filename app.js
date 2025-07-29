/*  OT CSM Buddy – Pure client-side SPA (HTML + CSS + Vanilla JS)
    ----------------------------------------------------------------
    Hash-based routing · Persist data in-memory only (strict_instructions)
    Author: AI ✨
*/

/*************************
 * Helper utilities
 *************************/
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* Date helpers */
const todayStart = () => new Date().setHours(0, 0, 0, 0);
const isToday = (d) => new Date(d).setHours(0, 0, 0, 0) === todayStart();
const isOverdue = (d) => new Date(d).setHours(0, 0, 0, 0) < todayStart();
const daysUntil = (d) => Math.ceil((new Date(d).setHours(0, 0, 0, 0) - todayStart()) / 86_400_000);

/*************************
 * Global in-memory store
 *************************/

/* ────────────────────────────────
 * Store with automatic persistence
 * ────────────────────────────────*/
const STORAGE_KEY = 'ot_csm_buddy_store';
const methodsToWrap = ['push','pop','shift','unshift','splice','sort','reverse','copyWithin','fill'];

/* Save current store snapshot */
function saveStore() {
  try {
    const snapshot = {
      tasks: store.tasks,
      issues: store.issues,
      wins: store.wins,
      notifications: store.notifications
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.error('Could not save data', err);
  }
}

/* Wrap an array so any mutation triggers saveStore() */
function makePersistent(arr) {
  return new Proxy(arr, {
    get(target, prop, receiver) {
      if (methodsToWrap.includes(prop)) {
        return (...args) => {
          const res = Array.prototype[prop].apply(target, args);
          saveStore();
          return res;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      const res = Reflect.set(target, prop, value, receiver);
      if (prop !== 'length') saveStore();
      return res;
    }
  });
}

/* Load previous data from localStorage */
function loadStoreData() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      tasks: Array.isArray(cached.tasks) ? cached.tasks : [],
      issues: Array.isArray(cached.issues) ? cached.issues : [],
      wins: Array.isArray(cached.wins) ? cached.wins : [],
      notifications: Array.isArray(cached.notifications) ? cached.notifications : []
    };
  } catch (err) {
    console.error('Could not parse saved data', err);
    return { tasks:[], issues:[], wins:[], notifications:[] };
  }
}

/* Initialize store proxy */
const store = new Proxy(loadStoreData(), {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (Array.isArray(value)) {
      // ensure the array is wrapped
      if (!value.__persistent) {
        const persistent = makePersistent(value);
        persistent.__persistent = true;
        target[prop] = persistent;
        return persistent;
      }
    }
    return value;
  },
  set(target, prop, value, receiver) {
    if (Array.isArray(value)) {
      value = makePersistent(value);
      value.__persistent = true;
    }
    const res = Reflect.set(target, prop, value, receiver);
    saveStore();
    return res;
  }
});

/* Persist before the tab unloads */
window.addEventListener('beforeunload', saveStore);
/* ──────────────────────────────── */

/*************************
 * Notifications helpers
 *************************/
function addNotification(msg, kind = 'info') {
  store.notifications.push({ id: uuid(), msg, kind, read: false, date: Date.now() });
  renderBadge();
}
function renderBadge() {
  const badge = $('#notificationBadge');
  if (!badge) return;
  const unread = store.notifications.filter((n) => !n.read).length;
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
}

/*************************
 * Modal component (custom)
 *************************/
function closeModal() {
  const overlay = $('.modal-overlay');
  if (overlay) overlay.remove();
}
function openModal({ title = '', bodyNodes = [], onSubmit, labelSubmit = 'Save', extraButtons = [] }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal__header">
        <h3>${title}</h3>
        <button class="modal__close" aria-label="Close">×</button>
      </div>
      <div class="modal__body"></div>
      <div class="modal__footer"></div>
  </div>`;
  $('#modalContainer').appendChild(overlay);
  const body = $('.modal__body', overlay);
  bodyNodes.forEach((n) => body.appendChild(n));

  /* Footer buttons */
  const footer = $('.modal__footer', overlay);
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.id = 'modalCancel';
  cancelBtn.textContent = 'Cancel';
  footer.appendChild(cancelBtn);

  /* Insert any extra button(s) BEFORE submit */
  extraButtons.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = b.className || 'btn';
    btn.textContent = b.text;
    btn.addEventListener('click', () => {
      if (b.onClick) b.onClick();
    });
    footer.appendChild(btn);
  });

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn--primary';
  submitBtn.id = 'modalSubmit';
  submitBtn.textContent = labelSubmit;
  footer.appendChild(submitBtn);

  /* Listeners */
  $('.modal__close', overlay).addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  submitBtn.addEventListener('click', () => {
    if (onSubmit && onSubmit() === false) return; // validation failed, keep modal open
    closeModal();
  });
  /* Escape closes modal */
  function escListener(e) {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escListener);
    }
  }
  document.addEventListener('keydown', escListener);

  /* Outside click closes */
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

/*************************
 * Form field generators
 *************************/
function inputGroup(label, value = '', type = 'text') {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  wrap.innerHTML = `<label class="form-label">${label}</label><input class="form-control" type="${type}" value="${value}">`;
  return { group: wrap, el: $('input', wrap) };
}
function textareaGroup(label, value = '') {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  wrap.innerHTML = `<label class="form-label">${label}</label><textarea class="form-control">${value}</textarea>`;
  return { group: wrap, el: $('textarea', wrap) };
}
function selectGroup(label, opts = [], sel) {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  const select = document.createElement('select');
  select.className = 'form-control';
  opts.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o[0].toUpperCase() + o.slice(1);
    select.appendChild(opt);
  });
  select.value = sel || opts[0];
  wrap.innerHTML = `<label class="form-label">${label}</label>`;
  wrap.appendChild(select);
  return { group: wrap, el: select };
}

/*************************
 * Entity modals
 *************************/
function taskModal(task = null) {
  const isEdit = !!task;
  const title = inputGroup('Title', task?.title || '');
  const desc = textareaGroup('Description', task?.desc || '');
  const due = inputGroup('Due Date', task?.due || new Date().toISOString().slice(0, 10), 'date');
  const prio = selectGroup('Priority', ['low', 'medium', 'high'], task?.priority || 'low');

  openModal({
    title: isEdit ? 'Edit Task' : 'Add Task',
    bodyNodes: [title.group, desc.group, due.group, prio.group],
    extraButtons: isEdit
      ? [
          {
            text: 'Delete',
            className: 'btn btn--danger-outline',
            onClick: () => {
              if (confirm('Delete this task?')) {
                store.tasks = store.tasks.filter((t) => t.id !== task.id);
                closeModal();
                renderCurrent();
              }
            }
          }
        ]
      : [],
    onSubmit() {
      if (!title.el.value.trim()) {
        alert('Title is required');
        return false;
      }
      const data = {
        id: isEdit ? task.id : uuid(),
        title: title.el.value.trim(),
        desc: desc.el.value.trim(),
        due: due.el.value || new Date().toISOString().slice(0, 10),
        priority: prio.el.value,
        status: isEdit ? task.status : 'todo',
        created: task?.created || Date.now()
      };
      if (isEdit) {
        const idx = store.tasks.findIndex((t) => t.id === task.id);
        store.tasks[idx] = data;
      } else {
        store.tasks.push(data);
      }
      maybeAddTaskNotif(data);
      renderCurrent();
    }
  });
}
function issueModal(issue = null) {
  const isEdit = !!issue;
  const title = inputGroup('Title', issue?.title || '');
  const desc = textareaGroup('Description', issue?.desc || '');
  const status = selectGroup('Status', ['open', 'monitoring', 'resolved'], issue?.status || 'open');

  openModal({
    title: isEdit ? 'Edit Issue' : 'Add Issue',
    bodyNodes: [title.group, desc.group, status.group],
    extraButtons: isEdit
      ? [
          {
            text: 'Delete',
            className: 'btn btn--danger-outline',
            onClick: () => {
              if (confirm('Delete this issue?')) {
                store.issues = store.issues.filter((i) => i.id !== issue.id);
                closeModal();
                renderCurrent();
              }
            }
          }
        ]
      : [],
    onSubmit() {
      if (!title.el.value.trim()) {
        alert('Title is required');
        return false;
      }
      const data = {
        id: isEdit ? issue.id : uuid(),
        title: title.el.value.trim(),
        desc: desc.el.value.trim(),
        status: status.el.value,
        date: isEdit ? issue.date : Date.now()
      };
      if (isEdit) {
        const idx = store.issues.findIndex((i) => i.id === issue.id);
        store.issues[idx] = data;
      } else {
        store.issues.push(data);
        addNotification(`New issue logged: ${data.title}`, 'danger');
      }
      renderCurrent();
    }
  });
}
function winModal(win = null) {
  const isEdit = !!win;
  const title = inputGroup('Title', win?.title || '');
  const desc = textareaGroup('Description', win?.desc || '');

  openModal({
    title: isEdit ? 'Edit Win' : 'Add Major Win',
    bodyNodes: [title.group, desc.group],
    extraButtons: isEdit
      ? [
          {
            text: 'Delete',
            className: 'btn btn--danger-outline',
            onClick: () => {
              if (confirm('Delete this win?')) {
                store.wins = store.wins.filter((w) => w.id !== win.id);
                closeModal();
                renderCurrent();
              }
            }
          }
        ]
      : [],
    onSubmit() {
      if (!title.el.value.trim()) {
        alert('Title is required');
        return false;
      }
      const data = {
        id: isEdit ? win.id : uuid(),
        title: title.el.value.trim(),
        desc: desc.el.value.trim(),
        date: isEdit ? win.date : Date.now()
      };
      if (isEdit) {
        const idx = store.wins.findIndex((w) => w.id === win.id);
        store.wins[idx] = data;
      } else {
        store.wins.push(data);
        addNotification(`🎉 Major win: ${data.title}`, 'success');
      }
      renderCurrent();
    }
  });
}

function maybeAddTaskNotif(task) {
  const d = daysUntil(task.due);
  if (d < 0) addNotification(`Task "${task.title}" is overdue!`, 'danger');
  else if (d <= 3) addNotification(`Task "${task.title}" due in ${d === 0 ? 'today' : d + ' day' + (d > 1 ? 's' : '')}.`, 'warning');
}

/*************************
 * Routes and rendering
 *************************/
const viewRoot = () => $('#view');
const ROUTES = ['dashboard', 'tasks', 'issues', 'wins', 'notifications', 'backup'];

function currentRoute() {
  const hash = location.hash || '#dashboard';
  return hash.replace('#', '') || 'dashboard';
}
function navigate(route) {
  if (!ROUTES.includes(route)) route = 'dashboard';
  location.hash = `#${route}`;
}
window.addEventListener('hashchange', renderCurrent);

function renderCurrent() {
  const route = currentRoute();
  highlightNav(route);
  renderBadge();
  const root = viewRoot();
  root.innerHTML = '';
  switch (route) {
    case 'dashboard':
      renderDashboard(root);
      toggleQuickAdd(true);
      break;
    case 'tasks':
      renderTasks(root);
      toggleQuickAdd(false);
      break;
    case 'issues':
      renderIssues(root);
      toggleQuickAdd(false);
      break;
    case 'wins':
      renderWins(root);
      toggleQuickAdd(false);
      break;
    case 'notifications':
      renderNotifications(root);
      toggleQuickAdd(false);
      break;
    case 'backup':
      renderBackup(root);
      toggleQuickAdd(false);
      break;
    default:
      navigate('dashboard');
  }
}

/***** Dashboard *****/
function renderDashboard(root) {
  const grid = document.createElement('div');
  grid.className = 'dashboard-grid';

  // Today's To-Dos
  const todayTasks = store.tasks.filter((t) => isToday(t.due) && t.status !== 'done');
  const todayCard = sectionCard("Today's To-Dos", taskList(todayTasks));
  todayCard.classList.add('dashboard-today');
  grid.appendChild(todayCard);

  // Overdue tasks
  const overdue = store.tasks.filter((t) => isOverdue(t.due) && t.status !== 'done');
  const overdueCard = sectionCard('Overdue Tasks', taskList(overdue));
  overdueCard.classList.add('dashboard-overdue');
  grid.appendChild(overdueCard);

  // Recent notifications (5 latest)
  const recent = document.createElement('div');
  recent.className = 'section-content';
  const latest = store.notifications.slice(-5).reverse();
  if (latest.length === 0) recent.textContent = 'No notifications.';
  else latest.forEach((n) => {
    const div = document.createElement('div');
    div.className = 'notification-item';
    div.textContent = n.msg;
    recent.appendChild(div);
  });
  const notifCard = sectionCard('Recent Notifications', recent);
  notifCard.classList.add('dashboard-notifications');
  grid.appendChild(notifCard);

  root.appendChild(grid);
}
function sectionCard(title, contentNode) {
  const card = document.createElement('div');
  card.className = 'section-card';
  const head = document.createElement('div');
  head.className = 'section-header';
  head.textContent = title;
  card.appendChild(head);
  card.appendChild(contentNode);
  return card;
}
function taskList(arr) {
  const wrap = document.createElement('div');
  wrap.className = 'section-content';
  if (arr.length === 0) {
    wrap.textContent = 'All clear!';
    return wrap;
  }
  arr.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'task-item';
    row.innerHTML = `<span>${t.title}</span><span class="due-badge ${isOverdue(t.due) ? 'due-overdue' : isToday(t.due) ? 'due-today' : 'due-soon'}">${t.due}</span>`;
    wrap.appendChild(row);
  });
  return wrap;
}

/***** Tasks (Kanban) *****/
function renderTasks(root) {
  /* Header with Add Task */
  const header = document.createElement('div');
  header.className = 'tasks-header';
  const titleEl = document.createElement('h3');
  titleEl.textContent = 'Tasks';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.textContent = 'Add Task';
  addBtn.addEventListener('click', () => taskModal());
  header.appendChild(titleEl);
  header.appendChild(addBtn);
  root.appendChild(header);

  /* Filter toolbar */
  const toolbar = document.createElement('div');
  toolbar.className = 'mb-16 flex gap-8 flex-wrap';
  const prioSel = selectGroup('Priority', ['all', 'low', 'medium', 'high'], 'all');
  toolbar.appendChild(prioSel.group);
  // helper text hint for drag‑and‑drop
  const hint = document.createElement('p');
  hint.className = 'tasks-helper';
  hint.textContent = 'Tip: drag tasks between the columns to update their status.';
  toolbar.appendChild(hint);
  root.appendChild(toolbar);

  /* Kanban board */
  const board = document.createElement('div');
  board.className = 'kanban';
  const columns = [
    { key: 'todo', label: 'To Do' },
    { key: 'inprogress', label: 'In Progress' },
    { key: 'done', label: 'Done' }
  ];
  columns.forEach((c) => {
    const col = document.createElement('div');
    col.className = 'kanban__column';
    col.dataset.status = c.key;
    col.innerHTML = `<div class="kanban__column-header">${c.label}</div>`;
    const taskArea = document.createElement('div');
    taskArea.className = 'kanban__tasks';
    col.appendChild(taskArea);
    board.appendChild(col);
  });
  root.appendChild(board);

  /* Paint tasks */
  const paint = () => {
    $$('.kanban__tasks', board).forEach((area) => (area.innerHTML = ''));
    let list = store.tasks.slice();
    if (prioSel.el.value !== 'all') list = list.filter((t) => t.priority === prioSel.el.value);
    list.forEach((t) => {
      const area = $(`.kanban__column[data-status="${t.status}"] .kanban__tasks`, board);
      if (area) area.appendChild(taskCard(t));
    });
  };
  paint();
  prioSel.el.addEventListener('change', paint);

  /* Drag & drop interactions */
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card-task');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.id);
    card.classList.add('dragging');
  });
  board.addEventListener('dragend', (e) => {
    const card = e.target.closest('.card-task');
    if (card) card.classList.remove('dragging');
  });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.kanban__column');
    if (col) {
      e.preventDefault();
      col.classList.add('drag-over');
    }
  });
  board.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.kanban__column');
    if (col) col.classList.remove('drag-over');
  });
  board.addEventListener('drop', (e) => {
    e.preventDefault();
    const col = e.target.closest('.kanban__column');
    if (!col) return;
    const id = e.dataTransfer.getData('text/plain');
    const task = store.tasks.find((t) => t.id === id);
    if (task) {
      task.status = col.dataset.status;
      paint();
    }
    col.classList.remove('drag-over');
  });
}
function taskCard(task) {
  const card = document.createElement('div');
  card.className = 'card-task';
  card.setAttribute('draggable', 'true');
  card.dataset.id = task.id;
  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  const meta = document.createElement('div');
  meta.className = 'task-meta';
  const chip = document.createElement('span');
  chip.className = `priority-chip priority-${task.priority}`;
  chip.textContent = task.priority;
  const due = document.createElement('span');
  due.className = `due-badge ${isOverdue(task.due) ? 'due-overdue' : isToday(task.due) ? 'due-today' : 'due-soon'}`;
  due.textContent = task.due;
  meta.appendChild(chip);
  meta.appendChild(due);
  card.appendChild(title);
  card.appendChild(meta);

  /* Double-click to edit */
  card.addEventListener('dblclick', () => taskModal(task));

  /* Single click also edit for accessibility */
  card.addEventListener('click', (e) => {
    // Prevent dragging click
    if (e.detail === 1) {
      setTimeout(() => {
        if (!card.classList.contains('dragging')) taskModal(task);
      }, 250);
    }
  });

  return card;
}

/***** Issues *****/
/***** Issues *****/
function renderIssues(root) {
  /* Header bar */
  const header = document.createElement('div');
  header.className = 'tasks-header';

  const titleEl = document.createElement('h3');
  titleEl.textContent = 'Major Issues';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.textContent = 'Add Issue';
  addBtn.addEventListener('click', () => issueModal());

  header.appendChild(titleEl);
  header.appendChild(addBtn);
  root.appendChild(header);

  /* ─── Filter toolbar ─── */
  const toolbar = document.createElement('div');
  toolbar.className = 'mb-16 flex gap-8 flex-wrap';
  const statusSel = selectGroup(
    'Status',
    ['all', 'open', 'monitoring', 'resolved'],
    'all'
  );
  toolbar.appendChild(statusSel.group);
  root.appendChild(toolbar);

  /* Table skeleton */
  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML =
    '<thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody></tbody>';
  root.appendChild(table);
  const tbody = $('tbody', table);

  /* Renders rows based on current filter */
  function paint() {
    tbody.innerHTML = '';
    let list = store.issues.slice();

    if (statusSel.el.value !== 'all') {
      list = list.filter((i) => i.status === statusSel.el.value);
    }

    if (list.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td colspan="4" style="text-align:center; padding:16px">No issues found.</td>';
      tbody.appendChild(tr);
      return;
    }

    list.forEach((i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i.title}</td>
        <td><span class="status-chip status-${i.status}">${i.status}</span></td>
        <td>${new Date(i.date).toLocaleDateString()}</td>
        <td></td>`;
      const actionsTd = tr.lastElementChild;

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--sm btn--secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => issueModal(i));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--sm btn--danger-outline';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm('Delete this issue?')) {
          store.issues = store.issues.filter((iss) => iss.id !== i.id);
          paint();
        }
      });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
      tbody.appendChild(tr);
    });
  }

  /* initial paint + reactive repaint */
  paint();
  statusSel.el.addEventListener('change', paint);
}


/***** Wins *****/
function renderWins(root) {
  /* Header */
  const header = document.createElement('div');
  header.className = 'tasks-header';
  const titleEl = document.createElement('h3');
  titleEl.textContent = 'Major Wins';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.textContent = 'Add Win';
  addBtn.addEventListener('click', () => winModal());
  header.appendChild(titleEl);
  header.appendChild(addBtn);
  root.appendChild(header);

  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML = '<thead><tr><th>Title</th><th>Date</th><th>Actions</th></tr></thead><tbody></tbody>';
  const tbody = $('tbody', table);
  if (store.wins.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3" style="text-align:center; padding:16px">No wins yet.</td>';
    tbody.appendChild(tr);
  } else {
    store.wins.forEach((w) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${w.title}</td><td>${new Date(w.date).toLocaleDateString()}</td><td></td>`;
      const actionsTd = $('td:last-child', tr);
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--sm btn--secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => winModal(w));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--sm btn--danger-outline';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm('Delete this win?')) {
          store.wins = store.wins.filter((win) => win.id !== w.id);
          renderCurrent();
        }
      });
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
      tbody.appendChild(tr);
    });
  }
  root.appendChild(table);
}

/***** Notifications *****/
function renderNotifications(root) {
  if (store.notifications.length === 0) {
    root.textContent = 'No notifications.';
    return;
  }
  store.notifications.slice().reverse().forEach((n) => {
    const item = document.createElement('div');
    item.className = `notification-item ${n.read ? '' : 'unread'}`;
    const msg = document.createElement('span');
    msg.textContent = n.msg;
    const actions = document.createElement('div');
    actions.className = 'notification-actions';
    const done = document.createElement('button');
    done.className = 'btn btn--sm btn--primary';
    done.textContent = 'Dismiss';
    done.addEventListener('click', () => {
      n.read = true;
      renderCurrent();
    });
    const snooze = document.createElement('button');
    snooze.className = 'btn btn--sm btn--secondary';
    snooze.textContent = 'Snooze';
    snooze.addEventListener('click', () => {
      // Snooze for 3 hours (demo)
      n.date = Date.now() + 3 * 60 * 60 * 1000;
      n.read = true;
      renderCurrent();
    });
    actions.appendChild(done);
    actions.appendChild(snooze);
    item.appendChild(msg);
    item.appendChild(actions);
    root.appendChild(item);
  });
}

/***** Settings *****/
function renderSettings(root) {
  const toggleTheme = document.createElement('button');
  toggleTheme.className = 'btn btn--primary mb-16';
  toggleTheme.textContent = 'Toggle theme';
  toggleTheme.addEventListener('click', () => {
    const html = document.documentElement;
    const cur = html.getAttribute('data-color-scheme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    html.setAttribute('data-color-scheme', cur === 'dark' ? 'light' : 'dark');
  });
  const reset = document.createElement('button');
  reset.className = 'btn btn--secondary';
  reset.textContent = 'Clear all data';
  reset.addEventListener('click', () => {
    if (confirm('Clear all data (tasks, issues, wins, notifications)?')) {
      store.tasks = [];
      store.issues = [];
      store.wins = [];
      store.notifications = [];
      renderCurrent();
    }
  });
  root.appendChild(toggleTheme);
  root.appendChild(reset);
}

/*************************
 * Layout helpers
 *************************/
function highlightNav(route) {
  $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
}
function toggleQuickAdd(show) {
  $('#quickAddButtons').classList.toggle('hidden', !show);
}

/*************************
 * Init (attach listeners)
 *************************/
function initNavigation() {
  /* Mobile header hamburger */
  const mobileToggle = $('#mobileSidebarToggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      const sb = $('#sidebar');
      sb.classList.toggle('open');
    });
  }

  /* Sidebar collapse / open */
  $('#sidebarToggle').addEventListener('click', () => {
    const sb = $('#sidebar');
    if (window.innerWidth < 640) sb.classList.toggle('open');
    else sb.classList.toggle('collapsed');
  });
  /* Close sidebar on nav-click (mobile) */
  $$('.nav-item').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 640) $('#sidebar').classList.remove('open');
    });
  });
}
function initQuickAdd() {
  $$('.quick-add__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switch (btn.dataset.type) {
        case 'task':
          taskModal();
          break;
        case 'issue':
          issueModal();
          break;
        case 'win':
          winModal();
          break;
      }
    });
  });
}

function boot() {
  // store already hydrated via proxy and localStorage

  initNavigation();
  initQuickAdd();
  if (!location.hash) navigate('dashboard');
  renderCurrent();
}



/***** BackUp *****/
function renderBackup(root) {
  /* Header bar */
  const header = document.createElement('div');
  header.className = 'tasks-header';

  const titleEl = document.createElement('h3');
  titleEl.textContent = 'BackUp';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--primary';
  exportBtn.textContent = 'Export Data';

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn--secondary';
  importBtn.textContent = 'Import Data';

  header.appendChild(titleEl);
  header.appendChild(exportBtn);
  header.appendChild(importBtn);
  root.appendChild(header);

  /* ==== Export ==== */
  exportBtn.addEventListener('click', () => {
    /* Make sure latest snapshot is in localStorage */
    saveStore();

    const dataStr = localStorage.getItem(STORAGE_KEY) || '{}';
    const blob = new Blob([dataStr], { type: 'application/json' });
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const fileName = `ot_csm_buddy_backup_${ts}.json`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification('Data exported successfully ✅', 'success');
  });

  /* ==== Import ==== */
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);

          /* Basic shape-check */
          if (
            !imported ||
            !Array.isArray(imported.tasks) ||
            !Array.isArray(imported.issues) ||
            !Array.isArray(imported.wins) ||
            !Array.isArray(imported.notifications)
          ) {
            throw new Error('File format not recognised');
          }

          /* Replace current store wholesale */
          store.tasks = imported.tasks;
          store.issues = imported.issues;
          store.wins = imported.wins;
          store.notifications = imported.notifications;
          saveStore();

          addNotification('Data import complete 🎉', 'success');
          renderCurrent(); // refresh whichever view user is on
        } catch (err) {
          console.error(err);
          alert(
            'Sorry – that file does not look like a valid OT CSM Buddy backup.'
          );
        }
      };
      reader.readAsText(file);
    });

    /* Trigger the hidden file picker */
    input.click();
  });
}

/* Ensure listeners attach even if script is loaded at end of body (DOMContentLoaded already fired) */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
