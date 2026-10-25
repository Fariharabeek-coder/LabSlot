"use strict";

/* =========================================================
   LabSlot - Lab Availability and Booking System
   Storage: Browser localStorage only
   ========================================================= */

const STORAGE_KEYS = {
  labs: "labslot_labs_v1",
  bookings: "labslot_bookings_v1",
  student: "labslot_student_v1"
};

const ADMIN_PASSWORD = "admin123";

let labs = [];
let bookings = [];
let selectedSystems = new Set();
let isAdminLoggedIn = false;
let labModal = null;
let appToast = null;

const $ = (id) => document.getElementById(id);

const PAGE_TITLES = {
  dashboard: "Dashboard",
  availability: "Lab Availability",
  book: "Book a System",
  history: "Booking History",
  admin: "Admin Panel"
};

/* -------------------- Date and time helpers -------------------- */

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return localDateString();
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const parts = dateString.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatTime(timeString) {
  if (!timeString) return "—";

  const [hour, minute] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function timeToMinutes(timeString) {
  if (!/^\d{2}:\d{2}$/.test(timeString || "")) {
    return NaN;
  }

  const [hours, minutes] = timeString.split(":").map(Number);

  if (hours > 23 || minutes > 59) {
    return NaN;
  }

  return hours * 60 + minutes;
}

function isValidDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || "")) {
    return false;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function validateTimeRange(date, start, end) {
  if (!isValidDate(date)) {
    return "Please select a valid date.";
  }

  if (date < getToday()) {
    return "Past dates cannot be booked.";
  }

  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes)
  ) {
    return "Please enter valid start and end times.";
  }

  if (startMinutes >= endMinutes) {
    return "End time must be later than start time.";
  }

  if (date === getToday()) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (startMinutes <= currentMinutes) {
      return "Choose a start time later than the current time.";
    }
  }

  return "";
}

function overlaps(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  return aStart < bEnd && aEnd > bStart;
}

/* -------------------- Safe HTML helpers -------------------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function escapeCSV(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function createId(prefix) {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  const timePart = Date.now().toString(36).toUpperCase();

  return `${prefix}-${timePart}-${randomPart}`;
}

/* -------------------- Default sample data -------------------- */

function createDefaultLabs() {
  return [
    {
      id: "LAB-CSE-01",
      name: "Computer Science Lab",
      capacity: 60,
      prefix: "S",
      maintenance: false,
      maintenanceSystems: []
    },
    {
      id: "LAB-CSE-02",
      name: "Programming Lab",
      capacity: 45,
      prefix: "P",
      maintenance: false,
      maintenanceSystems: []
    },
    {
      id: "LAB-CSE-03",
      name: "Advanced Computing Lab",
      capacity: 40,
      prefix: "A",
      maintenance: true,
      maintenanceSystems: []
    }
  ];
}

function normalizeLab(lab) {
  const capacity = Math.max(
    1,
    Math.min(200, Number(lab.capacity) || 1)
  );

  return {
    id: String(lab.id || createId("LAB")),
    name: String(lab.name || "Computer Science Lab"),
    capacity,
    prefix: String(lab.prefix || "S").slice(0, 3),
    maintenance: Boolean(lab.maintenance),
    maintenanceSystems: Array.isArray(lab.maintenanceSystems)
      ? lab.maintenanceSystems.filter(
          (systemId) => Number.isInteger(systemId) &&
          systemId >= 1 &&
          systemId <= capacity
        )
      : []
  };
}

function normalizeBooking(booking) {
  return {
    id: String(booking.id || createId("LS")),
    labId: String(booking.labId || ""),
    name: String(booking.name || ""),
    personId: String(booking.personId || ""),
    systems: Array.isArray(booking.systems)
      ? booking.systems.filter(Number.isInteger)
      : [],
    date: String(booking.date || ""),
    start: String(booking.start || ""),
    end: String(booking.end || ""),
    purpose: String(booking.purpose || ""),
    status: booking.status === "Cancelled" ? "Cancelled" : "Booked",
    createdAt: String(booking.createdAt || new Date().toISOString())
  };
}

/* -------------------- Storage -------------------- */

function loadData() {
  try {
    const storedLabs = localStorage.getItem(STORAGE_KEYS.labs);
    const storedBookings = localStorage.getItem(STORAGE_KEYS.bookings);

    labs = storedLabs
      ? JSON.parse(storedLabs).map(normalizeLab)
      : createDefaultLabs();

    bookings = storedBookings
      ? JSON.parse(storedBookings).map(normalizeBooking)
      : [];

    if (!Array.isArray(labs) || labs.length === 0) {
      labs = createDefaultLabs();
    }

    if (!Array.isArray(bookings)) {
      bookings = [];
    }
  } catch (error) {
    console.error("Could not load saved data:", error);

    labs = createDefaultLabs();
    bookings = [];

    showToast(
      "Storage Notice",
      "Saved data could not be read. Sample data has been loaded.",
      "error"
    );
  }

  saveData();
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEYS.labs, JSON.stringify(labs));
    localStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(bookings));

    return true;
  } catch (error) {
    console.error("Could not save data:", error);

    showToast(
      "Storage Error",
      "The browser could not save your data. Check browser storage settings.",
      "error"
    );

    return false;
  }
}

/* -------------------- General helpers -------------------- */

function getLab(labId) {
  return labs.find((lab) => lab.id === labId);
}

function getLabName(labId) {
  return getLab(labId)?.name || "Laboratory unavailable";
}

function getSystemName(lab, systemNumber) {
  return `${lab.prefix}${String(systemNumber).padStart(2, "0")}`;
}

function getMaintenanceSet(lab) {
  return new Set(lab.maintenanceSystems || []);
}

function isSystemUnderMaintenance(lab, systemNumber) {
  return (
    lab.maintenance ||
    getMaintenanceSet(lab).has(systemNumber)
  );
}

function getActiveBookings(labId, date, start, end) {
  return bookings.filter((booking) => {
    return (
      booking.labId === labId &&
      booking.date === date &&
      booking.status === "Booked" &&
      overlaps(start, end, booking.start, booking.end)
    );
  });
}

function isSystemBooked(lab, systemNumber, date, start, end) {
  return getActiveBookings(lab.id, date, start, end).some(
    (booking) => booking.systems.includes(systemNumber)
  );
}

function getSystemStatus(lab, systemNumber, date, start, end) {
  if (isSystemUnderMaintenance(lab, systemNumber)) {
    return "maintenance";
  }

  if (isSystemBooked(lab, systemNumber, date, start, end)) {
    return "booked";
  }

  return "available";
}

function getAvailableCount(lab, date, start, end) {
  let count = 0;

  for (let number = 1; number <= lab.capacity; number++) {
    if (getSystemStatus(lab, number, date, start, end) === "available") {
      count++;
    }
  }

  return count;
}

function getBookedCount(lab, date, start, end) {
  let count = 0;

  for (let number = 1; number <= lab.capacity; number++) {
    if (isSystemBooked(lab, number, date, start, end)) {
      count++;
    }
  }

  return count;
}

function getMaintenanceCount(lab) {
  if (lab.maintenance) {
    return lab.capacity;
  }

  return getMaintenanceSet(lab).size;
}

function getLabBadge(lab, available, booked) {
  if (lab.maintenance) {
    return '<span class="badge-status badge-maintenance">Maintenance</span>';
  }

  if (available === 0 && booked > 0) {
    return '<span class="badge-status badge-booked">Fully Booked</span>';
  }

  return '<span class="badge-status badge-available">Operational</span>';
}

function getBookingBadge(status) {
  if (status === "Cancelled") {
    return '<span class="badge-status badge-cancelled">Cancelled</span>';
  }

  return '<span class="badge-status badge-available">Booked</span>';
}

function getSavedStudent() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.student) || "{}");
  } catch {
    return {};
  }
}

function saveStudent(name, personId) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.student,
      JSON.stringify({ name, personId })
    );
  } catch (error) {
    console.warn("Could not save student details:", error);
  }
}

/* -------------------- Notifications -------------------- */

function showToast(title, message, type = "success") {
  if (!appToast) return;

  $("toastTitle").textContent = title;
  $("toastMessage").textContent = message;

  const element = $("appToast");
  element.classList.remove("success", "error");

  if (type === "success") {
    element.classList.add("success");
  } else if (type === "error") {
    element.classList.add("error");
  }

  appToast.show();
}

/* -------------------- Navigation -------------------- */

function navigateTo(pageName) {
  if (!PAGE_TITLES[pageName]) return;

  if (pageName === "admin" && !isAdminLoggedIn) {
    $("adminLogin").hidden = false;
    $("adminContent").hidden = true;
  }

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  const targetPage = $(`page-${pageName}`);

  if (targetPage) {
    targetPage.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  $("pageTitle").textContent = PAGE_TITLES[pageName];

  $("sidebar").classList.remove("open");

  if (pageName === "dashboard") {
    renderDashboard();
  } else if (pageName === "availability") {
    renderAvailability();
  } else if (pageName === "book") {
    renderBookingForm();
  } else if (pageName === "history") {
    renderHistory();
  } else if (pageName === "admin") {
    renderAdmin();
  }
}

/* -------------------- Dashboard -------------------- */

function renderDashboard() {
  const date = getToday();
  const start = "00:00";
  const end = "23:59";

  let totalSystems = 0;
  let availableSystems = 0;
  let maintenanceSystems = 0;

  labs.forEach((lab) => {
    totalSystems += lab.capacity;
    availableSystems += getAvailableCount(lab, date, start, end);
    maintenanceSystems += getMaintenanceCount(lab);
  });

  const todayBookings = bookings.filter(
    (booking) =>
      booking.date === date &&
      booking.status === "Booked"
  );

  const upcomingOrFutureBookings = bookings.filter(
    (booking) =>
      booking.status === "Booked" &&
      booking.date >= date
  );

  $("dashboardStats").innerHTML = `
    <div class="col-6 col-xl-3">
      <div class="stats-card">
        <div class="stats-icon blue"><i class="bi bi-building"></i></div>
        <div>
          <div class="stats-label">Total Laboratories</div>
          <div class="stats-value">${labs.length}</div>
        </div>
      </div>
    </div>

    <div class="col-6 col-xl-3">
      <div class="stats-card">
        <div class="stats-icon green"><i class="bi bi-pc-display"></i></div>
        <div>
          <div class="stats-label">Available Today</div>
          <div class="stats-value">${availableSystems}</div>
        </div>
      </div>
    </div>

    <div class="col-6 col-xl-3">
      <div class="stats-card">
        <div class="stats-icon orange"><i class="bi bi-calendar-check"></i></div>
        <div>
          <div class="stats-label">Today's Bookings</div>
          <div class="stats-value">${todayBookings.length}</div>
        </div>
      </div>
    </div>

    <div class="col-6 col-xl-3">
      <div class="stats-card">
        <div class="stats-icon purple"><i class="bi bi-tools"></i></div>
        <div>
          <div class="stats-label">Systems in Maintenance</div>
          <div class="stats-value">${maintenanceSystems}</div>
        </div>
      </div>
    </div>
  `;

  if (labs.length === 0) {
    $("dashboardLabs").innerHTML = `
      <div class="col-12">
        <div class="panel">No laboratories have been added yet.</div>
      </div>
    `;
  } else {
    $("dashboardLabs").innerHTML = labs.map((lab) => {
      const available = getAvailableCount(lab, date, start, end);
      const booked = getBookedCount(lab, date, start, end);
      const percent = Math.round((booked / lab.capacity) * 100);
      const badge = getLabBadge(lab, available, booked);

      return `
        <div class="col-md-6 col-xl-4">
          <div class="lab-card">
            <div class="lab-card-header">
              <div class="lab-icon"><i class="bi bi-pc-display-horizontal"></i></div>
              <div class="flex-grow-1">
                <h5>${escapeHTML(lab.name)}</h5>
                <div class="muted">${lab.capacity} systems · Computer Science</div>
              </div>
            </div>

            ${badge}

            <div class="lab-capacity">
              <span>Available: <strong>${available}</strong></span>
              <span>Booked: <strong>${booked}</strong></span>
            </div>

            <div class="progress">
              <div class="progress-bar"
                   role="progressbar"
                   style="width:${percent}%"
                   aria-valuenow="${percent}"
                   aria-valuemin="0"
                   aria-valuemax="100"></div>
            </div>

            <button class="btn btn-outline-primary w-100 mt-3"
                    data-book-lab="${escapeHTML(lab.id)}">
              View Systems <i class="bi bi-arrow-right ms-1"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  const recent = bookings
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  $("recentBookings").innerHTML = recent.length
    ? recent.map((booking) => `
      <tr>
        <td><strong>${escapeHTML(booking.id)}</strong></td>
        <td>${escapeHTML(getLabName(booking.labId))}</td>
        <td>${escapeHTML(
          (getLab(booking.labId)
            ? booking.systems.map((n) =>
                getSystemName(getLab(booking.labId), n)
              )
            : booking.systems
          ).join(", ")
        )}</td>
        <td>${formatDate(booking.date)}</td>
        <td>${formatTime(booking.start)} – ${formatTime(booking.end)}</td>
        <td>${getBookingBadge(booking.status)}</td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="6" class="text-center muted py-4">
          No bookings yet. Create your first reservation.
        </td>
      </tr>
    `;
}

/* -------------------- Availability -------------------- */

function renderAvailability() {
  if (!$("availabilityDate").value) {
    $("availabilityDate").value = getToday();
  }

  displayAvailability();
}

function displayAvailability() {
  const date = $("availabilityDate").value;
  const start = $("availabilityStart").value;
  const end = $("availabilityEnd").value;

  const error = validateAvailabilityRange(date, start, end);

  if (error) {
    $("availabilityResults").innerHTML = `
      <div class="alert alert-warning">${escapeHTML(error)}</div>
    `;
    return;
  }

  if (labs.length === 0) {
    $("availabilityResults").innerHTML = `
      <div class="panel">No Computer Science laboratories are configured.</div>
    `;
    return;
  }

  $("availabilityResults").innerHTML = labs.map((lab) => {
    const available = getAvailableCount(lab, date, start, end);
    const booked = getBookedCount(lab, date, start, end);
    const maintenance = getMaintenanceCount(lab);

    let systemHTML = "";

    for (let number = 1; number <= lab.capacity; number++) {
      const status = getSystemStatus(lab, number, date, start, end);
      const label = getSystemName(lab, number);

      let statusText = "Available";

      if (status === "booked") statusText = "Booked";
      if (status === "maintenance") statusText = "Maintenance";

      systemHTML += `
        <button type="button"
                class="system-chip ${status}"
                disabled
                title="${label}: ${statusText}">
          ${escapeHTML(label)}
          <small>${statusText}</small>
        </button>
      `;
    }

    let labStatus = '<span class="badge-status badge-available">Operational</span>';

    if (lab.maintenance) {
      labStatus = '<span class="badge-status badge-maintenance">Under Maintenance</span>';
    } else if (available === 0 && booked > 0) {
      labStatus = '<span class="badge-status badge-booked">Fully Booked</span>';
    }

    return `
      <div class="lab-availability-card">
        <div class="lab-availability-header">
          <div>
            <h5>${escapeHTML(lab.name)}</h5>
            <div class="muted small">
              ${formatDate(date)} · ${formatTime(start)} – ${formatTime(end)}
            </div>
            <div class="small mt-2">
              <strong>${available}</strong> available ·
              <strong>${booked}</strong> booked ·
              <strong>${maintenance}</strong> in maintenance
            </div>
          </div>

          <div class="text-end">
            ${labStatus}
            <button class="btn btn-sm btn-primary d-block mt-2"
                    data-book-lab="${escapeHTML(lab.id)}">
              Book a System
            </button>
          </div>
        </div>

        <div class="system-grid">${systemHTML}</div>
      </div>
    `;
  }).join("");
}

function validateAvailabilityRange(date, start, end) {
  if (!isValidDate(date)) return "Please select a valid date.";

  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    startMinutes >= endMinutes
  ) {
    return "Please select a valid time range. End time must be later than start time.";
  }

  return "";
}

/* -------------------- Booking form -------------------- */

function renderBookingForm() {
  const saved = getSavedStudent();

  if (saved.name && !$("studentName").value) {
    $("studentName").value = saved.name;
  }

  if (saved.personId && !$("studentId").value) {
    $("studentId").value = saved.personId;
  }

  if (!$("bookingDate").value) {
    $("bookingDate").value = getToday();
  }

  renderLabOptions();
  renderSystemSelection();
}

function renderLabOptions() {
  const select = $("bookingLab");
  const previousValue = select.value;

  select.innerHTML = '<option value="">Select a laboratory</option>';

  labs.forEach((lab) => {
    const option = document.createElement("option");
    option.value = lab.id;
    option.textContent = lab.maintenance
      ? `${lab.name} — Under Maintenance`
      : lab.name;

    select.appendChild(option);
  });

  if (getLab(previousValue)) {
    select.value = previousValue;
  }
}

function renderSystemSelection() {
  const lab = getLab($("bookingLab").value);
  const date = $("bookingDate").value;
  const start = $("bookingStart").value;
  const end = $("bookingEnd").value;

  if (!lab) {
    $("bookingLabSummary").textContent =
      "Select a laboratory to view its systems.";

    $("systemSelection").innerHTML = `
      <div class="empty-state">
        <i class="bi bi-pc-display"></i>
        <h5>Select a laboratory</h5>
        <p>The available systems will appear here.</p>
      </div>
    `;

    selectedSystems.clear();
    updateSelectionSummary();

    return;
  }

  if (!date || !start || !end || !validateAvailabilityRange(date, start, end) === false) {
    // Validation is performed below before rendering the systems.
  }

  const timeError = validateAvailabilityRange(date, start, end);

  if (timeError) {
    $("bookingLabSummary").textContent = timeError;
    $("systemSelection").innerHTML = `
      <div class="alert alert-warning w-100">${escapeHTML(timeError)}</div>
    `;
    selectedSystems.clear();
    updateSelectionSummary();
    return;
  }

  const available = getAvailableCount(lab, date, start, end);
  const booked = getBookedCount(lab, date, start, end);
  const maintenance = getMaintenanceCount(lab);

  $("bookingLabSummary").innerHTML = `
    <strong>${escapeHTML(lab.name)}</strong><br>
    <span class="small">
      ${lab.capacity} total systems ·
      ${available} available ·
      ${booked} booked ·
      ${maintenance} under maintenance
    </span>
    ${
      lab.maintenance
        ? '<div class="mt-2 text-danger small"><i class="bi bi-exclamation-triangle"></i> This entire lab is under maintenance.</div>'
        : ""
    }
  `;

  const stillValid = new Set();

  let html = "";

  for (let number = 1; number <= lab.capacity; number++) {
    const status = getSystemStatus(lab, number, date, start, end);
    const systemName = getSystemName(lab, number);
    const isSelected = selectedSystems.has(number) && status === "available";

    if (isSelected) {
      stillValid.add(number);
    }

    const cssClass = isSelected ? "selected" : status;
    const disabled = status !== "available" ? "disabled" : "";
    const statusText = status === "available"
      ? (isSelected ? "Selected" : "Available")
      : status === "booked"
        ? "Booked"
        : "Maintenance";

    html += `
      <button type="button"
              class="system-chip ${cssClass}"
              data-system-number="${number}"
              ${disabled}
              aria-pressed="${isSelected}">
        ${escapeHTML(systemName)}
        <small>${statusText}</small>
      </button>
    `;
  }

  selectedSystems = stillValid;
  $("systemSelection").innerHTML = html;
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const lab = getLab($("bookingLab").value);

  $("selectedCount").textContent =
    `${selectedSystems.size} system${selectedSystems.size === 1 ? "" : "s"} selected`;

  if (!lab || selectedSystems.size === 0) {
    $("selectedNames").textContent = "No systems selected";
    return;
  }

  $("selectedNames").textContent = Array.from(selectedSystems)
    .sort((a, b) => a - b)
    .map((number) => getSystemName(lab, number))
    .join(", ");
}

function handleSystemSelection(event) {
  const button = event.target.closest("[data-system-number]");

  if (!button || button.disabled) return;

  const number = Number(button.dataset.systemNumber);

  if (selectedSystems.has(number)) {
    selectedSystems.delete(number);
  } else {
    selectedSystems.add(number);
  }

  renderSystemSelection();
}

function openBookingForLab(labId) {
  if (!getLab(labId)) {
    showToast("Lab unavailable", "That laboratory no longer exists.", "error");
    return;
  }

  navigateTo("book");
  $("bookingLab").value = labId;

  const availabilityDate = $("availabilityDate").value;

  if (availabilityDate && isValidDate(availabilityDate)) {
    $("bookingDate").value = availabilityDate;
    $("bookingStart").value = $("availabilityStart").value || "09:00";
    $("bookingEnd").value = $("availabilityEnd").value || "10:00";
  }

  selectedSystems.clear();
  renderSystemSelection();
}

/* -------------------- Confirm a booking -------------------- */

function handleBookingSubmit(event) {
  event.preventDefault();

  const name = $("studentName").value.trim();
  const personId = $("studentId").value.trim();
  const labId = $("bookingLab").value;
  const date = $("bookingDate").value;
  const start = $("bookingStart").value;
  const end = $("bookingEnd").value;
  const purpose = $("bookingPurpose").value.trim();

  if (!name || !personId) {
    showToast("Missing Details", "Enter your name and register/staff ID.", "error");
    return;
  }

  const lab = getLab(labId);

  if (!lab) {
    showToast("Select a Lab", "Please select a valid laboratory.", "error");
    return;
  }

  const timeError = validateTimeRange(date, start, end);

  if (timeError) {
    showToast("Invalid Time", timeError, "error");
    return;
  }

  if (lab.maintenance) {
    showToast(
      "Lab Under Maintenance",
      "This entire laboratory is under maintenance and cannot be booked.",
      "error"
    );
    return;
  }

  if (selectedSystems.size === 0) {
    showToast("Select Systems", "Choose at least one available system.", "error");
    return;
  }

  const requestedSystems = Array.from(selectedSystems).sort((a, b) => a - b);

  // Recheck every system before saving. This prevents overlapping
  // reservations from being accepted for the same computer.
  for (const number of requestedSystems) {
    if (number < 1 || number > lab.capacity) {
      showToast("Invalid System", "One of the selected systems is invalid.", "error");
      renderSystemSelection();
      return;
    }

    if (isSystemUnderMaintenance(lab, number)) {
      showToast(
        "System Under Maintenance",
        `${getSystemName(lab, number)} is under maintenance.`,
        "error"
      );

      renderSystemSelection();
      return;
    }

    if (isSystemBooked(lab, number, date, start, end)) {
      showToast(
        "System Already Booked",
        `${getSystemName(lab, number)} has already been booked for an overlapping time.`,
        "error"
      );

      renderSystemSelection();
      return;
    }
  }

  const booking = {
    id: createId("LS"),
    labId,
    name,
    personId,
    systems: requestedSystems,
    date,
    start,
    end,
    purpose,
    status: "Booked",
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);

  if (!saveData()) {
    bookings = bookings.filter((item) => item.id !== booking.id);
    return;
  }

  saveStudent(name, personId);

  const systemNames = requestedSystems
    .map((number) => getSystemName(lab, number))
    .join(", ");

  selectedSystems.clear();

  $("bookingPurpose").value = "";

  showToast(
    "Booking Confirmed",
    `Booking ID: ${booking.id}. Systems: ${systemNames}.`,
    "success"
  );

  renderSystemSelection();
  renderDashboard();

  // Go to history so the student can see the confirmed reservation.
  navigateTo("history");
  $("historySearch").value = booking.id;
  renderHistory();

  // Also show the complete booking confirmation in a dialog.
  window.setTimeout(() => {
    alert(
      "BOOKING CONFIRMED!\n\n" +
      `Booking ID: ${booking.id}\n` +
      `Name: ${name}\n` +
      `Laboratory: ${lab.name}\n` +
      `Systems: ${systemNames}\n` +
      `Date: ${formatDate(date)}\n` +
      `Time: ${formatTime(start)} - ${formatTime(end)}\n\n` +
      "Your booking has been saved in this browser."
    );
  }, 250);
}

/* -------------------- Booking history -------------------- */

function renderHistory() {
  const search = $("historySearch").value.trim().toLowerCase();
  const statusFilter = $("historyStatus").value;

  const filtered = bookings
    .slice()
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      return dateCompare || b.start.localeCompare(a.start);
    })
    .filter((booking) => {
      const labName = getLabName(booking.labId);
      const lab = getLab(booking.labId);

      const systemNames = lab
        ? booking.systems.map((number) => getSystemName(lab, number)).join(" ")
        : booking.systems.join(" ");

      const searchText = [
        booking.id,
        booking.name,
        booking.personId,
        labName,
        systemNames,
        booking.date
      ].join(" ").toLowerCase();

      const matchesSearch = searchText.includes(search);
      const matchesStatus =
        statusFilter === "all" || booking.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

  $("historyTable").innerHTML = filtered.map((booking) => {
    const lab = getLab(booking.labId);

    const systems = lab
      ? booking.systems.map((number) => getSystemName(lab, number)).join(", ")
      : booking.systems.join(", ");

    const canCancel =
      booking.status === "Booked" &&
      booking.date >= getToday();

    return `
      <tr>
        <td><strong>${escapeHTML(booking.id)}</strong></td>
        <td>
          ${escapeHTML(booking.name)}
          <div class="muted small">${escapeHTML(booking.personId)}</div>
        </td>
        <td>${escapeHTML(getLabName(booking.labId))}</td>
        <td>${escapeHTML(systems)}</td>
        <td>${formatDate(booking.date)}</td>
        <td>${formatTime(booking.start)} – ${formatTime(booking.end)}</td>
        <td>${getBookingBadge(booking.status)}</td>
        <td>
          ${
            canCancel
              ? `<button class="btn btn-sm btn-outline-danger"
                         data-cancel-booking="${escapeHTML(booking.id)}">
                   Cancel
                 </button>`
              : "—"
          }
        </td>
      </tr>
    `;
  }).join("");

  $("historyEmpty").hidden = filtered.length !== 0;
}

function cancelBooking(bookingId) {
  const booking = bookings.find((item) => item.id === bookingId);

  if (!booking) {
    showToast("Booking Not Found", "This booking could not be found.", "error");
    return;
  }

  if (booking.status !== "Booked") {
    showToast("Already Cancelled", "This booking has already been cancelled.", "error");
    return;
  }

  if (booking.date < getToday()) {
    showToast("Past Booking", "Past bookings cannot be cancelled.", "error");
    return;
  }

  const confirmed = window.confirm(
    `Cancel booking ${booking.id}?\n\n` +
    `${getLabName(booking.labId)}\n` +
    `${formatDate(booking.date)} · ${formatTime(booking.start)} - ${formatTime(booking.end)}`
  );

  if (!confirmed) return;

  booking.status = "Cancelled";

  if (!saveData()) {
    booking.status = "Booked";
    return;
  }

  showToast(
    "Booking Cancelled",
    `Booking ${booking.id} has been cancelled. Its systems are available again for that time.`,
    "success"
  );

  renderHistory();
  renderDashboard();
  renderAvailability();
  renderSystemSelection();

  if (isAdminLoggedIn) {
    renderAdmin();
  }
}

/* -------------------- Admin login -------------------- */

function handleAdminLogin(event) {
  event.preventDefault();

  const password = $("adminPassword").value;

  if (password !== ADMIN_PASSWORD) {
    showToast("Login Failed", "Incorrect administrator password.", "error");
    $("adminPassword").value = "";
    return;
  }

  isAdminLoggedIn = true;
  $("adminPassword").value = "";
  $("adminLogin").hidden = true;
  $("adminContent").hidden = false;
  $("sidebarUser").textContent = "Administrator";
  $("sidebarRole").textContent = "Management Access";
  $("logoutBtn").hidden = false;

  renderAdmin();

  showToast("Login Successful", "Welcome to the administrator panel.", "success");
}

function logoutAdmin() {
  isAdminLoggedIn = false;
  $("adminLogin").hidden = false;
  $("adminContent").hidden = true;
  $("sidebarUser").textContent = "Student";
  $("sidebarRole").textContent = "Student Portal";
  $("logoutBtn").hidden = true;

  $("adminPassword").value = "";

  navigateTo("dashboard");
  showToast("Logged Out", "You have logged out of the admin panel.", "success");
}

/* -------------------- Admin lab management -------------------- */

function renderAdmin() {
  if (!isAdminLoggedIn) {
    $("adminLogin").hidden = false;
    $("adminContent").hidden = true;
    return;
  }

  $("adminLogin").hidden = true;
  $("adminContent").hidden = false;

  $("adminLabsTable").innerHTML = labs.map((lab) => {
    const maintenanceCount = getMaintenanceCount(lab);

    return `
      <tr>
        <td>
          <strong>${escapeHTML(lab.name)}</strong>
          <div class="muted small">${escapeHTML(lab.id)}</div>
        </td>
        <td>${lab.capacity}</td>
        <td>
          ${
            lab.maintenance
              ? '<span class="badge-status badge-maintenance">Maintenance</span>'
              : '<span class="badge-status badge-available">Operational</span>'
          }
        </td>
        <td>${maintenanceCount} systems</td>
        <td>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline-primary"
                    data-edit-lab="${escapeHTML(lab.id)}">
              Edit
            </button>

            <button class="btn btn-sm ${
              lab.maintenance ? "btn-outline-success" : "btn-outline-warning"
            }"
                    data-toggle-maintenance="${escapeHTML(lab.id)}">
              ${lab.maintenance ? "Restore" : "Maintenance"}
            </button>

            <button class="btn btn-sm btn-outline-danger"
                    data-delete-lab="${escapeHTML(lab.id)}">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const sortedBookings = bookings
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  $("adminBookingsTable").innerHTML = sortedBookings.length
    ? sortedBookings.map((booking) => {
        const lab = getLab(booking.labId);

        const systems = lab
          ? booking.systems.map((number) => getSystemName(lab, number)).join(", ")
          : booking.systems.join(", ");

        return `
          <tr>
            <td><strong>${escapeHTML(booking.id)}</strong></td>
            <td>
              ${escapeHTML(booking.name)}
              <div class="muted small">${escapeHTML(booking.personId)}</div>
            </td>
            <td>${escapeHTML(getLabName(booking.labId))}</td>
            <td>${escapeHTML(systems)}</td>
            <td>${formatDate(booking.date)}</td>
            <td>${formatTime(booking.start)} – ${formatTime(booking.end)}</td>
            <td>${getBookingBadge(booking.status)}</td>
          </tr>
        `;
      }).join("")
    : `
      <tr>
        <td colspan="7" class="text-center muted py-4">
          No booking records are available.
        </td>
      </tr>
    `;
}

function openAddLabModal() {
  $("labModalTitle").textContent = "Add Laboratory";
  $("editLabId").value = "";
  $("labName").value = "";
  $("labCapacity").value = "30";
  $("labMaintenance").checked = false;

  labModal.show();
}

function openEditLabModal(labId) {
  const lab = getLab(labId);

  if (!lab) {
    showToast("Lab Not Found", "That laboratory no longer exists.", "error");
    return;
  }

  $("labModalTitle").textContent = "Edit Laboratory";
  $("editLabId").value = lab.id;
  $("labName").value = lab.name;
  $("labCapacity").value = lab.capacity;
  $("labMaintenance").checked = lab.maintenance;

  labModal.show();
}

function handleLabForm(event) {
  event.preventDefault();

  if (!isAdminLoggedIn) {
    showToast("Access Denied", "Please sign in as an administrator.", "error");
    return;
  }

  const id = $("editLabId").value;
  const name = $("labName").value.trim();
  const capacity = Number($("labCapacity").value);
  const maintenance = $("labMaintenance").checked;

  if (!name || !Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
    showToast(
      "Invalid Details",
      "Enter a laboratory name and a system count between 1 and 200.",
      "error"
    );
    return;
  }

  if (id) {
    const lab = getLab(id);

    if (!lab) {
      showToast("Lab Not Found", "That laboratory no longer exists.", "error");
      return;
    }

    // Don't shrink a lab if an existing booking references a system
    // that would be removed.
    const affectedBookings = bookings.filter((booking) =>
      booking.labId === id &&
      booking.status === "Booked" &&
      booking.systems.some((number) => number > capacity)
    );

    if (affectedBookings.length > 0) {
      showToast(
        "Cannot Reduce Capacity",
        "Existing active bookings use systems above the new capacity. Cancel or reschedule those bookings first.",
        "error"
      );
      return;
    }

    lab.name = name;
    lab.capacity = capacity;
    lab.maintenance = maintenance;
    lab.maintenanceSystems = (lab.maintenanceSystems || [])
      .filter((number) => number <= capacity);
  } else {
    const newLab = {
      id: createId("LAB"),
      name,
      capacity,
      prefix: generateUniquePrefix(name),
      maintenance,
      maintenanceSystems: []
    };

    labs.push(newLab);
  }

  if (!saveData()) return;

  labModal.hide();

  renderAdmin();
  renderLabOptions();
  renderDashboard();
  renderAvailability();
  renderSystemSelection();

  showToast(
    "Laboratory Saved",
    `${name} has been ${id ? "updated" : "added"} successfully.`,
    "success"
  );
}

function generateUniquePrefix(name) {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) || ["LAB"];

  let prefix = words.length > 1
    ? words.map((word) => word[0]).join("").slice(0, 3)
    : words[0].slice(0, 3);

  if (!prefix) prefix = "L";

  // A unique lab ID keeps system labels easy to distinguish.
  let candidate = prefix;
  let suffix = 2;

  while (labs.some((lab) => lab.prefix === candidate)) {
    candidate = `${prefix.slice(0, 2)}${suffix}`;
    suffix++;
  }

  return candidate;
}

function toggleLabMaintenance(labId) {
  if (!isAdminLoggedIn) return;

  const lab = getLab(labId);
  if (!lab) return;

  lab.maintenance = !lab.maintenance;

  if (!saveData()) {
    lab.maintenance = !lab.maintenance;
    return;
  }

  renderAdmin();
  renderDashboard();
  renderAvailability();
  renderSystemSelection();

  showToast(
    "Maintenance Updated",
    `${lab.name}: ${lab.maintenance ? "maintenance enabled" : "laboratory restored"}.`,
    "success"
  );
}

function deleteLab(labId) {
  if (!isAdminLoggedIn) return;

  const lab = getLab(labId);
  if (!lab) return;

  const hasActiveBookings = bookings.some(
    (booking) =>
      booking.labId === labId &&
      booking.status === "Booked" &&
      booking.date >= getToday()
  );

  if (hasActiveBookings) {
    showToast(
      "Cannot Delete Lab",
      "This laboratory has current or future active bookings. Cancel those bookings first.",
      "error"
    );
    return;
  }

  const confirmed = window.confirm(
    `Delete "${lab.name}"?\n\nPast booking history will be retained, but the laboratory will no longer appear in the lab list.`
  );

  if (!confirmed) return;

  labs = labs.filter((item) => item.id !== labId);

  if (!saveData()) return;

  renderAdmin();
  renderLabOptions();
  renderDashboard();
  renderAvailability();
  renderSystemSelection();

  showToast("Laboratory Deleted", `${lab.name} has been deleted.`, "success");
}

/* -------------------- CSV export -------------------- */

function exportBookingsCSV() {
  if (!isAdminLoggedIn) {
    showToast("Access Denied", "Admin login is required.", "error");
    return;
  }

  const header = [
    "Booking ID",
    "Name",
    "Register or Staff ID",
    "Laboratory",
    "Systems",
    "Date",
    "Start Time",
    "End Time",
    "Purpose",
    "Status"
  ];

  const rows = bookings.map((booking) => {
    const lab = getLab(booking.labId);

    const systems = lab
      ? booking.systems.map((number) => getSystemName(lab, number)).join(", ")
      : booking.systems.join(", ");

    return [
      booking.id,
      booking.name,
      booking.personId,
      getLabName(booking.labId),
      systems,
      booking.date,
      booking.start,
      booking.end,
      booking.purpose,
      booking.status
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(escapeCSV).join(","))
    .join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `LabSlot-Bookings-${getToday()}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showToast("Export Complete", "Booking records have been exported as CSV.", "success");
}

/* -------------------- Event listeners -------------------- */

function attachEventListeners() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.go);
    });
  });

  $("menuBtn").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    const sidebar = $("sidebar");
    const menuButton = $("menuBtn");

    if (
      window.innerWidth <= 760 &&
      sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menuButton.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }
  });

  $("dashboardLabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-book-lab]");
    if (button) openBookingForLab(button.dataset.bookLab);
  });

  $("availabilityResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-book-lab]");
    if (button) openBookingForLab(button.dataset.bookLab);
  });

  $("availabilityForm").addEventListener("submit", (event) => {
    event.preventDefault();
    displayAvailability();
  });

  ["availabilityDate", "availabilityStart", "availabilityEnd"].forEach((id) => {
    $(id).addEventListener("change", displayAvailability);
  });

  ["bookingLab", "bookingDate", "bookingStart", "bookingEnd"].forEach((id) => {
    $(id).addEventListener("change", () => {
      selectedSystems.clear();
      renderSystemSelection();
    });
  });

  $("systemSelection").addEventListener("click", handleSystemSelection);

  $("clearSelectionBtn").addEventListener("click", () => {
    selectedSystems.clear();
    renderSystemSelection();
  });

  $("bookingForm").addEventListener("submit", handleBookingSubmit);

  $("historySearch").addEventListener("input", renderHistory);
  $("historyStatus").addEventListener("change", renderHistory);

  $("historyTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel-booking]");
    if (button) cancelBooking(button.dataset.cancelBooking);
  });

  $("adminLoginForm").addEventListener("submit", handleAdminLogin);
  $("logoutBtn").addEventListener("click", logoutAdmin);

  $("addLabBtn").addEventListener("click", openAddLabModal);
  $("labForm").addEventListener("submit", handleLabForm);
  $("exportBtn").addEventListener("click", exportBookingsCSV);

  $("adminLabsTable").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-lab]");
    const maintenanceButton = event.target.closest("[data-toggle-maintenance]");
    const deleteButton = event.target.closest("[data-delete-lab]");

    if (editButton) {
      openEditLabModal(editButton.dataset.editLab);
      return;
    }

    if (maintenanceButton) {
      toggleLabMaintenance(maintenanceButton.dataset.toggleMaintenance);
      return;
    }

    if (deleteButton) {
      deleteLab(deleteButton.dataset.deleteLab);
    }
  });

  window.addEventListener("storage", (event) => {
    if (
      event.key === STORAGE_KEYS.labs ||
      event.key === STORAGE_KEYS.bookings
    ) {
      loadData();
      renderDashboard();
      renderAvailability();
      renderHistory();

      if (isAdminLoggedIn) renderAdmin();
    }
  });
}

/* -------------------- Start application -------------------- */

function initializeApp() {
  loadData();

  labModal = new bootstrap.Modal($("labModal"));
  appToast = new bootstrap.Toast($("appToast"), {
    delay: 4500
  });

  $("todayLabel").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  $("footerYear").textContent = new Date().getFullYear();

  $("availabilityDate").min = getToday();
  $("bookingDate").min = getToday();

  $("availabilityDate").value = getToday();
  $("bookingDate").value = getToday();

  attachEventListeners();

  renderDashboard();
  renderAvailability();
  renderLabOptions();
  renderSystemSelection();
  renderHistory();
}

document.addEventListener("DOMContentLoaded", initializeApp);