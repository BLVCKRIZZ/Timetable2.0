const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const USERS_KEY = "tt_users_v1";
const SESSION_USER_KEY = "tt_session_user_v1";

let weekOffset = 0;
let editingId = null;
let pendingDay = null;
let selectedColor = "color1";
let calendarCursor = new Date();
let calendarSelectedDate = "";
let myEventsDate = "";
let modalSource = "timetable";
let editSource = "timetable";
let viewDays = 7;
let focusDate = "";

let activeLoginUser = "";
let activeDataAccount = "";
let isReadOnlySession = false;
let timezoneOffsetMin = -new Date().getTimezoneOffset();
let timetableEvents = [];
let calendarEvents = [];
let pendingAvatarDataUrl = "";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function normalizeEmail(value) {
  return (value || "").trim().toLowerCase();
}

function normalizeDisplayName(value) {
  return (value || "").trim().slice(0, 30);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function findUserKeyByEmail(users, email) {
  if (users[email]) {
    return email;
  }

  return Object.keys(users).find((key) => normalizeEmail(users[key].email || key) === email) || "";
}

function getDisplayNameForUser(user, fallback) {
  const name = normalizeDisplayName(user?.displayName || "");
  if (name) {
    return name;
  }
  const source = normalizeEmail(user?.email || fallback || "");
  return source.split("@")[0] || source || "User";
}

function avatarDataUrlFromName(name) {
  const initial = (name || "U").trim().charAt(0).toUpperCase() || "U";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='#2f5f9f'/><text x='60' y='70' text-anchor='middle' font-size='48' font-family='DM Sans, sans-serif' fill='white'>${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setAuthStatus(message) {
  const el = document.getElementById("authStatus");
  if (el) {
    el.textContent = message;
  }
}

function setStatus(message) {
  const el = document.getElementById("countryStatus");
  if (el) {
    el.textContent = message;
  }
}

function setAccountStatus(message) {
  const el = document.getElementById("accountStatus");
  if (el) {
    el.textContent = message;
  }
}

function parseDateStrUTC(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysStr(dateStr, days) {
  const d = parseDateStrUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return fmtUTC(d);
}

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(m) {
  const h = Math.floor(m / 60);
  const mn = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function accountStorageKey(type, account) {
  return `tt_${type}_${account}`;
}

function currentDateInTimezone() {
  const shifted = new Date(Date.now() + timezoneOffsetMin * 60000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function timezoneNowMinutes() {
  const shifted = new Date(Date.now() + timezoneOffsetMin * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function parseTimezoneOffset(value) {
  const clean = (value || "").trim();
  const match = clean.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] || "0", 10);

  if (hours > 14 || minutes > 59) {
    return null;
  }

  return sign * (hours * 60 + minutes);
}

function formatTimezoneOffset(minutes) {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function startOfWeekMondayUTC(d) {
  const date = new Date(d);
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow);
  return date;
}

function getWeekDates(offset = 0) {
  const today = parseDateStrUTC(currentDateInTimezone());
  const monday = startOfWeekMondayUTC(today);
  monday.setUTCDate(monday.getUTCDate() + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return fmtUTC(d);
  });
}

function jumpToDate(dateStr) {
  const selectedMonday = startOfWeekMondayUTC(parseDateStrUTC(dateStr));
  const currentMonday = startOfWeekMondayUTC(parseDateStrUTC(currentDateInTimezone()));
  const diffMs = selectedMonday.getTime() - currentMonday.getTime();
  weekOffset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  buildGrid();
}

function getHourHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--hour-h");
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) ? value : 64;
}

function saveAccountData() {
  localStorage.setItem(accountStorageKey("timetable_events", activeDataAccount), JSON.stringify(timetableEvents));
  localStorage.setItem(accountStorageKey("calendar_events", activeDataAccount), JSON.stringify(calendarEvents));
  localStorage.setItem(accountStorageKey("timezone", activeDataAccount), String(timezoneOffsetMin));
}

function migrateLegacyIfNeeded() {
  const key = accountStorageKey("timetable_events", activeDataAccount);
  if (!localStorage.getItem(key)) {
    const legacy = JSON.parse(localStorage.getItem("tt_events") || "[]");
    localStorage.setItem(key, JSON.stringify(legacy));
  }
}

function loadAccountData(dataAccount) {
  activeDataAccount = dataAccount;
  migrateLegacyIfNeeded();

  timetableEvents = JSON.parse(localStorage.getItem(accountStorageKey("timetable_events", activeDataAccount)) || "[]");
  calendarEvents = JSON.parse(localStorage.getItem(accountStorageKey("calendar_events", activeDataAccount)) || "[]");

  const storedOffset = localStorage.getItem(accountStorageKey("timezone", activeDataAccount));
  timezoneOffsetMin = storedOffset === null ? -new Date().getTimezoneOffset() : Number.parseInt(storedOffset, 10);
}

function getEventsForDateFromList(list, dateStr) {
  const d = parseDateStrUTC(dateStr);
  const dow = (d.getUTCDay() + 6) % 7;

  return list.filter((e) => {
    if (e.date === dateStr) {
      return true;
    }
    if (e.repeat === "weekly") {
      const ed = parseDateStrUTC(e.date);
      const edow = (ed.getUTCDay() + 6) % 7;
      return edow === dow && ed <= d;
    }
    return false;
  });
}

function getTimetableEventsForDate(dateStr) {
  return getEventsForDateFromList(timetableEvents, dateStr);
}

function getCalendarEventsForDate(dateStr) {
  return getEventsForDateFromList(calendarEvents, dateStr);
}

function getCombinedEventsForDate(dateStr) {
  const fromTable = getTimetableEventsForDate(dateStr).map((e) => ({ ...e, _source: "timetable" }));
  const fromCalendar = getCalendarEventsForDate(dateStr).map((e) => ({ ...e, _source: "calendar" }));
  return [...fromTable, ...fromCalendar].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
}

function formatCalendarHeading(dateStr) {
  const d = parseDateStrUTC(dateStr);
  return d.toLocaleDateString("default", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function getVisibleDates(weekDates) {
  if (viewDays >= 7) {
    return weekDates;
  }

  const idx = weekDates.indexOf(focusDate);
  const safeIdx = idx === -1 ? 0 : idx;
  const start = Math.max(0, Math.min(safeIdx, 7 - viewDays));
  return weekDates.slice(start, start + viewDays);
}

function setViewMode(days) {
  viewDays = days;
  document.querySelectorAll("#viewModeBar .btn").forEach((btn) => {
    btn.classList.toggle("active", Number.parseInt(btn.dataset.view, 10) === days);
  });
  buildGrid();
}

function applyReadOnlyUI() {
  const addBtn = document.getElementById("calendarAddEventBtn");
  const tzInput = document.getElementById("timezoneInput");
  const tzBtn = document.getElementById("timezoneApplyBtn");

  addBtn.disabled = isReadOnlySession;
  tzInput.disabled = isReadOnlySession;
  tzBtn.disabled = isReadOnlySession;

  document.getElementById("saveContactBtn").disabled = isReadOnlySession;
  document.getElementById("changePasswordBtn").disabled = isReadOnlySession;
  document.getElementById("createProfileBtn").disabled = isReadOnlySession;
  document.getElementById("createShareBtn").disabled = isReadOnlySession;
  document.getElementById("saveProfilePhotoBtn").disabled = isReadOnlySession;
  document.getElementById("profilePhotoInput").disabled = isReadOnlySession;
  document.getElementById("deleteAccountBtn").disabled = false;
}

function renderHeaderProfileSwitcher() {
  const select = document.getElementById("profileSwitch");
  const users = getUsers();
  const names = Object.keys(users).sort();

  select.innerHTML = "";
  names.forEach((accountId) => {
    const option = document.createElement("option");
    const user = users[accountId];
    const tag = user.readOnlyOf ? " (RO)" : "";
    option.value = accountId;
    option.textContent = `${getDisplayNameForUser(user, accountId)} - ${accountId}${tag}`;
    select.appendChild(option);
  });

  if (users[activeLoginUser]) {
    select.value = activeLoginUser;
  }
}

function switchProfileFromHeader() {
  const target = normalizeEmail(document.getElementById("profileSwitch").value);
  const users = getUsers();

  if (!target || !users[target]) {
    return;
  }

  if (target === activeLoginUser) {
    return;
  }

  closeCalendar();
  closeMyEventsOverlay();
  closeAccountOverlay();
  closeModal();
  startUserSession(target);
}

function renderProfilesList() {
  const users = getUsers();
  const list = document.getElementById("profilesList");
  list.innerHTML = "";

  Object.keys(users).sort().forEach((accountId) => {
    const user = users[accountId];
    const canRemoveReadOnly = !isReadOnlySession && user.readOnlyOf === activeDataAccount;
    const displayName = getDisplayNameForUser(user, accountId);
    const row = document.createElement("div");
    row.className = "profile-row";
    const tags = [];
    if (accountId === activeLoginUser) tags.push("current");
    if (user.readOnlyOf) tags.push(`read-only of ${user.readOnlyOf}`);
    row.innerHTML = `
      <span>${displayName} <span class="profile-email">${accountId}</span></span>
      <div class="profile-actions">
        <span class="profile-tag">${tags.join(" · ") || "owner"}</span>
        ${canRemoveReadOnly ? `<button type="button" class="btn btn-small btn-danger" data-action="remove-readonly" data-username="${accountId}">Remove</button>` : ""}
      </div>
    `;
    list.appendChild(row);
  });
}

function countReadOnlyAccountsForOwner(ownerUsername) {
  const users = getUsers();
  return Object.values(users).filter((user) => user.readOnlyOf === ownerUsername).length;
}

function openAccountOverlay() {
  const users = getUsers();
  const user = users[activeLoginUser] || {};
  document.getElementById("contactEmail").value = user.contact?.email || user.email || activeLoginUser;
  document.getElementById("contactPhone").value = user.contact?.phone || "";
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("newProfileUsername").value = "";
  document.getElementById("newProfilePassword").value = "";
  document.getElementById("shareUsername").value = "";
  document.getElementById("sharePassword").value = "";
  pendingAvatarDataUrl = user.avatar || "";
  const avatarPreview = document.getElementById("profilePhotoPreview");
  avatarPreview.src = pendingAvatarDataUrl || avatarDataUrlFromName(getDisplayNameForUser(user, activeLoginUser));
  document.getElementById("profilePhotoInput").value = "";
  renderProfilesList();
  applyReadOnlyUI();
  setAccountStatus(isReadOnlySession ? "Read-only login: profile management is limited." : "");
  const overlay = document.getElementById("accountOverlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeAccountOverlay() {
  const overlay = document.getElementById("accountOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

function renderMyEventsList() {
  const list = document.getElementById("myEventsList");
  const label = document.getElementById("myEventsDateLabel");
  label.textContent = `My Events ${formatCalendarHeading(myEventsDate)}`;

  const events = getCombinedEventsForDate(myEventsDate);
  list.innerHTML = "";
  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "calendar-event-item";
    empty.innerHTML = '<div class="calendar-event-sub">No events for this day.</div>';
    list.appendChild(empty);
    return;
  }

  events.forEach((ev) => {
    const item = document.createElement("div");
    item.className = "calendar-event-item";
    item.innerHTML = `
      <div class="calendar-event-top">
        <div class="calendar-event-name">${ev.title || "Event"}</div>
        <div class="calendar-event-time">${ev.start}-${ev.end}</div>
      </div>
      <div class="calendar-event-sub">${ev._source === "calendar" ? "Calendar" : "Timetable"}${ev.sub ? ` · ${ev.sub}` : ""}</div>
    `;
    list.appendChild(item);
  });
}

function openMyEventsOverlay() {
  myEventsDate = focusDate || currentDateInTimezone();
  renderMyEventsList();
  const overlay = document.getElementById("myEventsOverlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeMyEventsOverlay() {
  const overlay = document.getElementById("myEventsOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

function deleteEventById(id, source) {
  if (isReadOnlySession) {
    return;
  }

  if (source === "calendar") {
    calendarEvents = calendarEvents.filter((e) => e.id !== id);
  } else {
    timetableEvents = timetableEvents.filter((e) => e.id !== id);
  }

  saveAccountData();
  buildGrid();
  buildCalendarGrid();
  renderCalendarEventsList();
  if (document.getElementById("myEventsOverlay").classList.contains("open")) {
    renderMyEventsList();
  }
}

function renderCalendarEventsList() {
  const list = document.getElementById("calendarEventsList");
  const title = document.getElementById("calendarEventsTitle");
  const selectedDateEvents = getCalendarEventsForDate(calendarSelectedDate).sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  title.textContent = `Calendar ${formatCalendarHeading(calendarSelectedDate)}`;
  list.innerHTML = "";

  if (selectedDateEvents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "calendar-event-item";
    empty.innerHTML = '<div class="calendar-event-sub">No calendar events for this date.</div>';
    list.appendChild(empty);
    return;
  }

  selectedDateEvents.forEach((ev) => {
    const item = document.createElement("div");
    item.className = "calendar-event-item";
    item.innerHTML = `
      <div class="calendar-event-top">
        <div class="calendar-event-name">${ev.title || "Event"}</div>
        <div class="calendar-event-time">${ev.start}-${ev.end}</div>
      </div>
      ${ev.sub ? `<div class="calendar-event-sub">${ev.sub}</div>` : ""}
      <div class="calendar-event-actions">
        <button type="button" class="btn btn-small" data-action="edit" data-id="${ev.id}">Edit</button>
        <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${ev.id}">Delete</button>
      </div>
    `;

    if (isReadOnlySession) {
      item.querySelectorAll("button").forEach((btn) => { btn.disabled = true; });
    }

    list.appendChild(item);
  });
}

function buildCalendarGrid() {
  const weekdays = document.getElementById("calendarWeekdays");
  if (!weekdays.dataset.ready) {
    weekdays.innerHTML = "";
    DAYS.forEach((d) => {
      const el = document.createElement("div");
      el.className = "calendar-weekday";
      el.textContent = d;
      weekdays.appendChild(el);
    });
    weekdays.dataset.ready = "1";
  }

  const monthStart = new Date(Date.UTC(calendarCursor.getUTCFullYear(), calendarCursor.getUTCMonth(), 1));
  const startCell = startOfWeekMondayUTC(monthStart);

  document.getElementById("calendarMonthLabel").textContent = monthStart.toLocaleString("default", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";
  const today = currentDateInTimezone();

  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(startCell);
    cellDate.setUTCDate(startCell.getUTCDate() + i);
    const cellDateStr = fmtUTC(cellDate);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    btn.textContent = String(cellDate.getUTCDate());

    const dayEventCount = getCalendarEventsForDate(cellDateStr).length;
    if (dayEventCount > 0) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot";
      dot.textContent = String(dayEventCount);
      btn.appendChild(dot);
    }

    if (cellDate.getUTCMonth() !== monthStart.getUTCMonth()) btn.classList.add("muted");
    if (cellDateStr === today) btn.classList.add("today");
    if (cellDateStr === calendarSelectedDate) btn.classList.add("selected");

    btn.addEventListener("click", () => {
      calendarSelectedDate = cellDateStr;
      focusDate = cellDateStr;
      jumpToDate(cellDateStr);
      buildCalendarGrid();
      renderCalendarEventsList();
    });

    grid.appendChild(btn);
  }
}

function openCalendar() {
  const focused = focusDate || getWeekDates(weekOffset)[0];
  calendarCursor = parseDateStrUTC(focused);
  calendarSelectedDate = focused;
  buildCalendarGrid();
  renderCalendarEventsList();

  document.getElementById("timezoneInput").value = formatTimezoneOffset(timezoneOffsetMin);
  setStatus(`Logged in as ${activeLoginUser}${isReadOnlySession ? " (read-only)" : ""} · TZ ${formatTimezoneOffset(timezoneOffsetMin)}`);
  applyReadOnlyUI();

  const overlay = document.getElementById("calendarOverlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeCalendar() {
  const overlay = document.getElementById("calendarOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

function renderEvent(ev, col, dateStr) {
  const hourHeight = getHourHeight();
  const startMin = timeToMin(ev.start);
  const endMin = timeToMin(ev.end);
  const top = ((startMin - START_HOUR * 60) / 60) * hourHeight;
  const height = Math.max(((endMin - startMin) / 60) * hourHeight - 3, 20);

  const el = document.createElement("div");
  el.className = `event ${ev.color || "color1"} ${ev._source === "calendar" ? "calendar-source" : ""}`;
  el.style.top = `${top}px`;
  el.style.height = `${height}px`;
  el.innerHTML = `<div class="event-title">${ev.title || "Event"}</div>
    ${ev.sub ? `<div class="event-sub">${ev.sub}</div>` : ""}
    <div class="event-sub">${ev.start}-${ev.end}${ev._source === "calendar" ? " · Cal" : ""}</div>`;

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isReadOnlySession) {
      return;
    }
    openModal(ev, dateStr, undefined, undefined, ev._source || "timetable");
  });

  col.appendChild(el);
}

function buildGrid() {
  const weekDates = getWeekDates(weekOffset);
  if (!focusDate || !weekDates.includes(focusDate)) {
    focusDate = weekDates[0];
  }

  const dates = getVisibleDates(weekDates);
  const today = currentDateInTimezone();
  const hourHeight = getHourHeight();

  const weekDate = parseDateStrUTC(weekDates[0]);
  const weekNumber = getWeekNumber(weekDate);
  const ro = isReadOnlySession ? " · Read-only" : "";
  document.getElementById("weekLabel").textContent = `@${activeLoginUser}${ro} · W ${weekNumber} · TZ ${formatTimezoneOffset(timezoneOffsetMin)}`;

  const daysHeader = document.getElementById("daysHeader");
  daysHeader.innerHTML = "";
  dates.forEach((ds, i) => {
    const d = parseDateStrUTC(ds);
    const dayName = DAYS[(d.getUTCDay() + 6) % 7];
    const div = document.createElement("div");
    div.className = `day-col-header${ds === today ? " today" : ""}`;
    div.innerHTML = `<div class="day-name">${dayName}</div><div class="day-num">${d.getUTCDate()}</div>`;
    daysHeader.appendChild(div);
  });

  const timeCol = document.getElementById("timeCol");
  timeCol.innerHTML = "";
  for (let h = START_HOUR; h <= END_HOUR; h += 1) {
    const slot = document.createElement("div");
    slot.className = "time-slot";
    if (h < END_HOUR) {
      const label = h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
      slot.innerHTML = `<span class="time-label">${label}</span>`;
    }
    timeCol.appendChild(slot);
  }

  const hourLines = document.getElementById("hourLines");
  hourLines.innerHTML = "";
  for (let h = 0; h <= TOTAL_HOURS; h += 1) {
    const line = document.createElement("div");
    line.className = "hour-line";
    line.style.top = `${h * hourHeight}px`;
    hourLines.appendChild(line);

    if (h < TOTAL_HOURS) {
      const half = document.createElement("div");
      half.className = "half-line";
      half.style.top = `${h * hourHeight + hourHeight / 2}px`;
      hourLines.appendChild(half);
    }
  }

  const daysBody = document.getElementById("daysBody");
  daysBody.querySelectorAll(".day-col").forEach((el) => el.remove());

  dates.forEach((ds) => {
    const col = document.createElement("div");
    col.className = "day-col";
    col.dataset.date = ds;

    col.addEventListener("click", (e) => {
      if (e.target.closest(".event") || isReadOnlySession) {
        return;
      }
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + document.getElementById("scrollArea").scrollTop;
      const mins = Math.round((y / hourHeight) * 60 / 15) * 15 + START_HOUR * 60;
      openModal(null, ds, minToTime(mins), minToTime(mins + 60), "timetable");
    });

    getCombinedEventsForDate(ds).forEach((ev) => renderEvent(ev, col, ds));
    daysBody.appendChild(col);
  });

  document.querySelectorAll(".now-line").forEach((el) => el.remove());
  const nowCol = daysBody.querySelector(`[data-date="${today}"]`);
  if (nowCol) {
    const mins = timezoneNowMinutes();
    const top = ((mins - START_HOUR * 60) / 60) * hourHeight;
    if (top >= 0) {
      const line = document.createElement("div");
      line.className = "now-line";
      line.style.top = `${top}px`;
      line.innerHTML = `<div class="now-dot"></div><div class="now-time-label">${minToTime(mins)}</div>`;
      nowCol.appendChild(line);
    }
  }
}

function openModal(ev, date, start, end, source = "timetable") {
  if (isReadOnlySession) {
    return;
  }

  editingId = ev ? ev.id : null;
  editSource = ev ? (ev._source || source) : source;
  modalSource = source;
  pendingDay = date;
  selectedColor = ev ? (ev.color || "color1") : "color1";

  document.getElementById("modalTitle").textContent = ev
    ? `Edit ${editSource === "calendar" ? "Calendar" : "Timetable"} Event`
    : `New ${source === "calendar" ? "Calendar" : "Timetable"} Event`;

  document.getElementById("inputTitle").value = ev ? ev.title : "";
  document.getElementById("inputSub").value = ev ? (ev.sub || "") : "";
  document.getElementById("inputStart").value = ev ? ev.start : (start || "08:00");
  document.getElementById("inputEnd").value = ev ? ev.end : (end || "09:00");
  document.getElementById("inputRepeat").value = ev ? (ev.repeat || "none") : "none";
  document.getElementById("btnDelete").style.display = ev ? "block" : "none";

  document.querySelectorAll(".color-opt").forEach((o) => {
    o.classList.toggle("selected", o.dataset.color === selectedColor);
  });

  document.getElementById("modalOverlay").classList.add("open");
  setTimeout(() => {
    document.getElementById("inputTitle").focus();
  }, 250);
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  editingId = null;
}

function scrollToNow() {
  const hourHeight = getHourHeight();
  const mins = timezoneNowMinutes();
  const top = ((mins - START_HOUR * 60) / 60) * hourHeight - 100;

  document.getElementById("scrollArea").scrollTo({
    top: Math.max(0, top),
    behavior: "smooth"
  });
}

function showApp() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
}

function showAuth() {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("authScreen").classList.remove("hidden");
}

function startUserSession(username) {
  const users = getUsers();
  const user = users[username];
  if (!user) {
    return;
  }

  activeLoginUser = username;
  isReadOnlySession = Boolean(user.readOnlyOf);
  const dataAccount = user.readOnlyOf || username;

  loadAccountData(dataAccount);
  localStorage.setItem(SESSION_USER_KEY, username);

  weekOffset = 0;
  focusDate = currentDateInTimezone();
  calendarSelectedDate = focusDate;
  myEventsDate = focusDate;
  calendarCursor = parseDateStrUTC(focusDate);
  viewDays = 7;

  setViewMode(7);
  applyReadOnlyUI();
  renderHeaderProfileSwitcher();
  showApp();
  buildGrid();
  scrollToNow();
}

function loginUser() {
  const email = normalizeEmail(document.getElementById("authEmail").value);
  const password = document.getElementById("authPassword").value;
  const users = getUsers();
  const key = findUserKeyByEmail(users, email);

  if (!email || !password) {
    setAuthStatus("Enter email and password.");
    return;
  }

  if (!key || !users[key] || users[key].password !== password) {
    setAuthStatus("Invalid login details.");
    return;
  }

  setAuthStatus("");
  startUserSession(key);
}

function signupUser() {
  const email = normalizeEmail(document.getElementById("authEmail").value);
  const displayName = normalizeDisplayName(document.getElementById("authUsername").value);
  const password = document.getElementById("authPassword").value;
  const confirmPassword = document.getElementById("authConfirmPassword").value;
  const users = getUsers();

  if (!isValidEmail(email)) {
    setAuthStatus("Use a valid email address.");
    return;
  }

  if (!password || password.length < 6) {
    setAuthStatus("Password must be at least 6 characters.");
    return;
  }

  if (confirmPassword !== password) {
    setAuthStatus("Password confirmation does not match.");
    return;
  }

  const existingKey = findUserKeyByEmail(users, email);
  if (existingKey) {
    setAuthStatus("An account with this email already exists.");
    return;
  }

  users[email] = {
    email,
    displayName: displayName || email.split("@")[0],
    password,
    avatar: "",
    contact: { email, phone: "" }
  };
  saveUsers(users);
  setAuthStatus("Account created. You are now logged in.");
  startUserSession(email);
}

function logoutUser() {
  closeCalendar();
  closeModal();
  closeMyEventsOverlay();
  closeAccountOverlay();
  localStorage.removeItem(SESSION_USER_KEY);
  activeLoginUser = "";
  showAuth();
  setAuthStatus("Logged out.");
}

document.getElementById("loginBtn").addEventListener("click", loginUser);
document.getElementById("signupBtn").addEventListener("click", signupUser);
document.getElementById("logoutBtn").addEventListener("click", logoutUser);
document.getElementById("switchProfileBtn").addEventListener("click", switchProfileFromHeader);

document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modalOverlay")) {
    closeModal();
  }
});

document.querySelectorAll(".color-opt").forEach((opt) => {
  opt.addEventListener("click", () => {
    selectedColor = opt.dataset.color;
    document.querySelectorAll(".color-opt").forEach((o) => o.classList.remove("selected"));
    opt.classList.add("selected");
  });
});

document.getElementById("btnSave").addEventListener("click", () => {
  if (isReadOnlySession) {
    return;
  }

  const title = document.getElementById("inputTitle").value.trim();
  if (!title) {
    document.getElementById("inputTitle").focus();
    return;
  }

  const start = document.getElementById("inputStart").value;
  const end = document.getElementById("inputEnd").value;
  if (!start || !end || timeToMin(end) <= timeToMin(start)) {
    document.getElementById("inputEnd").focus();
    return;
  }

  const ev = {
    id: editingId || uid(),
    date: pendingDay,
    title,
    sub: document.getElementById("inputSub").value.trim(),
    start,
    end,
    repeat: document.getElementById("inputRepeat").value,
    color: selectedColor
  };

  const targetList = editingId
    ? (editSource === "calendar" ? calendarEvents : timetableEvents)
    : (modalSource === "calendar" ? calendarEvents : timetableEvents);

  if (editingId) {
    const idx = targetList.findIndex((e) => e.id === editingId);
    if (idx !== -1) {
      targetList[idx] = ev;
    }
  } else {
    targetList.push(ev);
  }

  saveAccountData();
  closeModal();
  buildGrid();
  if (document.getElementById("calendarOverlay").classList.contains("open")) {
    buildCalendarGrid();
    renderCalendarEventsList();
  }
  if (document.getElementById("myEventsOverlay").classList.contains("open")) {
    renderMyEventsList();
  }
});

document.getElementById("btnDelete").addEventListener("click", () => {
  if (!editingId) {
    return;
  }
  deleteEventById(editingId, editSource);
  closeModal();
});

document.getElementById("prevWeek").addEventListener("click", () => {
  if (viewDays >= 7) {
    weekOffset -= 1;
    focusDate = getWeekDates(weekOffset)[0];
  } else {
    focusDate = addDaysStr(focusDate, -viewDays);
    jumpToDate(focusDate);
  }
  buildGrid();
});

document.getElementById("nextWeek").addEventListener("click", () => {
  if (viewDays >= 7) {
    weekOffset += 1;
    focusDate = getWeekDates(weekOffset)[0];
  } else {
    focusDate = addDaysStr(focusDate, viewDays);
    jumpToDate(focusDate);
  }
  buildGrid();
});

document.getElementById("todayBtn").addEventListener("click", () => {
  weekOffset = 0;
  focusDate = currentDateInTimezone();
  buildGrid();
  scrollToNow();
});

document.querySelectorAll("#viewModeBar .btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setViewMode(Number.parseInt(btn.dataset.view, 10));
  });
});

document.getElementById("calendarBtn").addEventListener("click", openCalendar);
document.getElementById("calendarCloseBtn").addEventListener("click", closeCalendar);

document.getElementById("calendarPrevMonth").addEventListener("click", () => {
  calendarCursor = new Date(Date.UTC(calendarCursor.getUTCFullYear(), calendarCursor.getUTCMonth() - 1, 1));
  buildCalendarGrid();
  renderCalendarEventsList();
});

document.getElementById("calendarNextMonth").addEventListener("click", () => {
  calendarCursor = new Date(Date.UTC(calendarCursor.getUTCFullYear(), calendarCursor.getUTCMonth() + 1, 1));
  buildCalendarGrid();
  renderCalendarEventsList();
});

document.getElementById("calendarTodayBtn").addEventListener("click", () => {
  calendarSelectedDate = currentDateInTimezone();
  focusDate = calendarSelectedDate;
  calendarCursor = parseDateStrUTC(calendarSelectedDate);
  jumpToDate(calendarSelectedDate);
  buildCalendarGrid();
  renderCalendarEventsList();
});

document.getElementById("timezoneApplyBtn").addEventListener("click", () => {
  if (isReadOnlySession) {
    setStatus("Read-only sessions cannot change timezone.");
    return;
  }

  const parsedOffset = parseTimezoneOffset(document.getElementById("timezoneInput").value);
  if (parsedOffset === null) {
    setStatus("Use a valid timezone offset (examples: +02:00, -05:30).");
    return;
  }

  timezoneOffsetMin = parsedOffset;
  saveAccountData();
  weekOffset = 0;
  focusDate = currentDateInTimezone();
  calendarSelectedDate = focusDate;
  calendarCursor = parseDateStrUTC(calendarSelectedDate);

  buildGrid();
  buildCalendarGrid();
  renderCalendarEventsList();
  setStatus(`Logged in as ${activeLoginUser} · TZ ${formatTimezoneOffset(timezoneOffsetMin)}`);
});

document.getElementById("calendarAddEventBtn").addEventListener("click", () => {
  openModal(null, calendarSelectedDate, "08:00", "09:00", "calendar");
});

document.getElementById("calendarEventsList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || isReadOnlySession) {
    return;
  }

  const eventId = btn.dataset.id;
  const action = btn.dataset.action;
  const ev = calendarEvents.find((item) => item.id === eventId);
  if (!ev) {
    return;
  }

  if (action === "edit") {
    openModal({ ...ev, _source: "calendar" }, calendarSelectedDate, undefined, undefined, "calendar");
    return;
  }

  if (action === "delete") {
    deleteEventById(eventId, "calendar");
  }
});

document.getElementById("calendarOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("calendarOverlay")) {
    closeCalendar();
  }
});

document.getElementById("myEventsBtn").addEventListener("click", openMyEventsOverlay);
document.getElementById("myEventsCloseBtn").addEventListener("click", closeMyEventsOverlay);
document.getElementById("myEventsTodayBtn").addEventListener("click", () => {
  myEventsDate = currentDateInTimezone();
  renderMyEventsList();
});
document.getElementById("myEventsPrevDay").addEventListener("click", () => {
  myEventsDate = addDaysStr(myEventsDate, -1);
  renderMyEventsList();
});
document.getElementById("myEventsNextDay").addEventListener("click", () => {
  myEventsDate = addDaysStr(myEventsDate, 1);
  renderMyEventsList();
});

document.getElementById("myEventsOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("myEventsOverlay")) {
    closeMyEventsOverlay();
  }
});

document.getElementById("accountBtn").addEventListener("click", openAccountOverlay);
document.getElementById("accountCloseBtn").addEventListener("click", closeAccountOverlay);

document.getElementById("accountOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("accountOverlay")) {
    closeAccountOverlay();
  }
});

document.getElementById("profilePhotoInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    setAccountStatus("Please choose an image file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    pendingAvatarDataUrl = String(reader.result || "");
    document.getElementById("profilePhotoPreview").src = pendingAvatarDataUrl;
    setAccountStatus("Profile picture selected. Click Save Profile Picture.");
  };
  reader.readAsDataURL(file);
});

document.getElementById("saveProfilePhotoBtn").addEventListener("click", () => {
  if (isReadOnlySession) {
    setAccountStatus("Read-only sessions cannot change profile picture.");
    return;
  }
  if (!pendingAvatarDataUrl) {
    setAccountStatus("Select a profile picture first.");
    return;
  }

  const users = getUsers();
  if (!users[activeLoginUser]) {
    return;
  }

  users[activeLoginUser].avatar = pendingAvatarDataUrl;
  saveUsers(users);
  renderProfilesList();
  renderHeaderProfileSwitcher();
  setAccountStatus("Profile picture saved.");
});

document.getElementById("saveContactBtn").addEventListener("click", () => {
  if (isReadOnlySession) {
    setAccountStatus("Read-only sessions cannot edit contacts.");
    return;
  }

  const users = getUsers();
  users[activeLoginUser].contact = {
    email: document.getElementById("contactEmail").value.trim(),
    phone: document.getElementById("contactPhone").value.trim()
  };
  saveUsers(users);
  setAccountStatus("Contact details saved.");
});

document.getElementById("changePasswordBtn").addEventListener("click", () => {
  if (isReadOnlySession) {
    setAccountStatus("Read-only sessions cannot change password.");
    return;
  }

  const current = document.getElementById("currentPassword").value;
  const next = document.getElementById("newPassword").value;
  const users = getUsers();

  if (users[activeLoginUser].password !== current) {
    setAccountStatus("Current password is incorrect.");
    return;
  }
  if (!next || next.length < 6) {
    setAccountStatus("New password must be at least 6 characters.");
    return;
  }

  users[activeLoginUser].password = next;
  saveUsers(users);
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  setAccountStatus("Password updated.");
});

document.getElementById("createProfileBtn").addEventListener("click", () => {
  if (isReadOnlySession) {
    setAccountStatus("Read-only sessions cannot create profiles.");
    return;
  }

  const username = normalizeEmail(document.getElementById("newProfileUsername").value);
  const password = document.getElementById("newProfilePassword").value;
  const users = getUsers();

  if (!isValidEmail(username)) {
    setAccountStatus("New profile must use a valid email.");
    return;
  }
  if (!password || password.length < 6) {
    setAccountStatus("New profile password must be at least 6 characters.");
    return;
  }
  if (findUserKeyByEmail(users, username)) {
    setAccountStatus("Profile email already exists.");
    return;
  }

  users[username] = {
    email: username,
    displayName: username.split("@")[0],
    password,
    avatar: "",
    contact: { email: username, phone: "" }
  };
  saveUsers(users);
  renderProfilesList();
  renderHeaderProfileSwitcher();
  setAccountStatus("New profile created.");
  document.getElementById("newProfileUsername").value = "";
  document.getElementById("newProfilePassword").value = "";
});

document.getElementById("createShareBtn").addEventListener("click", () => {
  if (isReadOnlySession) {
    setAccountStatus("Read-only sessions cannot create share logins.");
    return;
  }

  const shareUser = normalizeEmail(document.getElementById("shareUsername").value);
  const sharePass = document.getElementById("sharePassword").value;
  const users = getUsers();

  if (!isValidEmail(shareUser)) {
    setAccountStatus("Share login must use a valid email.");
    return;
  }
  if (!sharePass || sharePass.length < 6) {
    setAccountStatus("Share password must be at least 6 characters.");
    return;
  }
  if (findUserKeyByEmail(users, shareUser)) {
    setAccountStatus("Share email already exists.");
    return;
  }

  users[shareUser] = {
    email: shareUser,
    displayName: `${activeDataAccount.split("@")[0]} Viewer`,
    password: sharePass,
    readOnlyOf: activeDataAccount,
    avatar: "",
    contact: { email: shareUser, phone: "" }
  };
  saveUsers(users);
  renderProfilesList();
  renderHeaderProfileSwitcher();
  const totalReadOnly = countReadOnlyAccountsForOwner(activeDataAccount);
  setAccountStatus(`Read-only login '${shareUser}' created. Total read-only accounts: ${totalReadOnly}.`);
  document.getElementById("shareUsername").value = "";
  document.getElementById("sharePassword").value = "";
});

document.getElementById("profilesList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action='remove-readonly']");
  if (!btn || isReadOnlySession) {
    return;
  }

  const username = normalizeEmail(btn.dataset.username || "");
  const users = getUsers();
  const user = users[username];

  if (!username || !user || user.readOnlyOf !== activeDataAccount) {
    setAccountStatus("Only your read-only logins can be removed here.");
    return;
  }

  delete users[username];
  saveUsers(users);
  renderProfilesList();
  renderHeaderProfileSwitcher();
  const totalReadOnly = countReadOnlyAccountsForOwner(activeDataAccount);
  setAccountStatus(`Read-only login '${username}' removed. Remaining read-only accounts: ${totalReadOnly}.`);
});

document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  const users = getUsers();
  if (!users[activeLoginUser]) {
    return;
  }

  if (isReadOnlySession) {
    delete users[activeLoginUser];
    saveUsers(users);
    logoutUser();
    return;
  }

  const owner = activeLoginUser;
  Object.keys(users).forEach((username) => {
    if (username === owner || users[username].readOnlyOf === owner) {
      delete users[username];
    }
  });

  localStorage.removeItem(accountStorageKey("timetable_events", owner));
  localStorage.removeItem(accountStorageKey("calendar_events", owner));
  localStorage.removeItem(accountStorageKey("timezone", owner));

  saveUsers(users);
  logoutUser();
});

let touchStartX = 0;
document.getElementById("scrollArea").addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

document.getElementById("scrollArea").addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 80) {
    if (viewDays >= 7) {
      weekOffset += dx < 0 ? 1 : -1;
      focusDate = getWeekDates(weekOffset)[0];
    } else {
      focusDate = addDaysStr(focusDate, dx < 0 ? viewDays : -viewDays);
      jumpToDate(focusDate);
    }
    buildGrid();
  }
}, { passive: true });

window.addEventListener("resize", () => {
  if (document.getElementById("appShell").classList.contains("hidden")) {
    return;
  }
  buildGrid();
  if (weekOffset === 0) {
    scrollToNow();
  }
});

const sessionUser = normalizeEmail(localStorage.getItem(SESSION_USER_KEY) || "");
const users = getUsers();
if (sessionUser && users[sessionUser]) {
  startUserSession(sessionUser);
} else {
  showAuth();
}

setInterval(() => {
  if (!document.getElementById("appShell").classList.contains("hidden") && weekOffset === 0) {
    buildGrid();
  }
}, 60000);
