import "./style.css";

type EventRecord = {
  id: string;
  sport: string;
  venue: string;
  zone: string;
  sessionCode: string;
  date: string;
  gamesDay: number | null;
  sessionType: string;
  sessionDescription: string;
  startTime: string;
  endTime: string;
  startClock: string | null;
  endClock: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  hasFixedTime: boolean;
};

type TimedEvent = EventRecord & {
  gamesDay: number;
  startClock: string;
  endClock: string;
  startMinutes: number;
  endMinutes: number;
  hasFixedTime: true;
};

type StoredDayState = {
  scheduledIds?: string[];
};

type StoredPlannerState = {
  selectedDay?: number;
  withinZoneMinutes?: number;
  betweenZoneMinutes?: number;
  hiddenZones?: string[];
  hiddenSports?: string[];
  days?: Record<string, StoredDayState>;
};

type PlannedDayGroup = {
  day: number;
  dateLabel: string;
  events: TimedEvent[];
};

const SLOT_MINUTES = 15;
const PIXELS_PER_SLOT = 24;
const STORAGE_KEY = "olympics-day-planner-state-v2";
const DEFAULT_WITHIN_ZONE_MINUTES = 60;
const DEFAULT_BETWEEN_ZONE_MINUTES = 180;

declare global {
  interface Window {
    __EVENTS__?: EventRecord[];
  }
}

const appElement = document.querySelector<HTMLDivElement>("#app");

if (!appElement) {
  throw new Error("App container not found.");
}

const app = appElement;

const state = {
  events: [] as EventRecord[],
  selectedDay: 1,
  withinZoneMinutes: DEFAULT_WITHIN_ZONE_MINUTES,
  betweenZoneMinutes: DEFAULT_BETWEEN_ZONE_MINUTES,
  hiddenZones: new Set<string>(),
  hiddenSports: new Set<string>(),
  zoneFiltersOpen: false,
  sportFiltersOpen: false,
  scheduledIds: new Set<string>()
};

function isTimedEvent(event: EventRecord): event is TimedEvent {
  return (
    event.hasFixedTime &&
    typeof event.gamesDay === "number" &&
    typeof event.startClock === "string" &&
    typeof event.endClock === "string" &&
    typeof event.startMinutes === "number" &&
    typeof event.endMinutes === "number"
  );
}

function getAvailableDays() {
  return Array.from(
    new Set(state.events.map((event) => event.gamesDay).filter((day): day is number => day !== null))
  ).sort((a, b) => a - b);
}

function getAllZones() {
  return Array.from(new Set(state.events.map((event) => event.zone))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function getAllSports() {
  return Array.from(new Set(state.events.map((event) => event.sport))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function getDefaultHiddenZones() {
  const zones = getAllZones();
  const defaults = [
    "New York",
    "Columbus",
    "St. Louis",
    "Nashville",
    "San Jose",
    "San José",
    "San Diego",
    "OKC",
    "TBD"
  ];

  return new Set(defaults.filter((zone) => zones.includes(zone)));
}

function getDefaultHiddenSports() {
  const sports = getAllSports();
  const defaults = [
    "3x3 Basketball",
    "Archery",
    "Artistic Swimming",
    "Athletics (Marathon)",
    "Athletics (Race Walk)",
    "Badminton",
    "Baseball",
    "Basketball",
    "Canoe Slalom",
    "Canoe Sprint",
    "Cricket",
    "Cycling Road (Road Race)",
    "Cycling Road (Time Trial)",
    "Flag Football",
    "Football (Soccer)",
    "Golf",
    "Handball",
    "Hockey",
    "Lacrosse",
    "Open Water Swimming",
    "Rowing",
    "Rowing Coastal Beach Sprints",
    "Sailing (Dinghy, Skiff & Multihull)",
    "Sailing (Windsurfing & Kite)",
    "Shooting (Rifle & Pistol)",
    "Shooting (Shotgun)",
    "Softball",
    "Surfing",
    "Table Tennis",
    "Tennis",
    "Triathlon",
    "Water Polo"
  ];

  return new Set(defaults.filter((sport) => sports.includes(sport)));
}

function isZoneVisible(zone: string) {
  return !state.hiddenZones.has(zone);
}

function isSportVisible(sport: string) {
  return !state.hiddenSports.has(sport);
}

function getDefaultDay() {
  const days = getAvailableDays();
  if (days.includes(1)) {
    return 1;
  }
  return days[0] ?? 1;
}

function readStoredState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return {} as StoredPlannerState;
  }

  try {
    return JSON.parse(raw) as StoredPlannerState;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return {} as StoredPlannerState;
  }
}

function writeStoredState(payload: StoredPlannerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function applyDayState(day: number, payload?: StoredPlannerState) {
  const parsed = payload ?? readStoredState();
  const dayState = parsed.days?.[String(day)];

  state.withinZoneMinutes =
    typeof parsed.withinZoneMinutes === "number"
      ? Math.max(0, Math.round(parsed.withinZoneMinutes))
      : DEFAULT_WITHIN_ZONE_MINUTES;
  state.betweenZoneMinutes =
    typeof parsed.betweenZoneMinutes === "number"
      ? Math.max(0, Math.round(parsed.betweenZoneMinutes))
      : DEFAULT_BETWEEN_ZONE_MINUTES;
  state.hiddenZones = Array.isArray(parsed.hiddenZones)
    ? new Set(parsed.hiddenZones.filter((zone) => getAllZones().includes(zone)))
    : getDefaultHiddenZones();
  state.hiddenSports = Array.isArray(parsed.hiddenSports)
    ? new Set(parsed.hiddenSports.filter((sport) => getAllSports().includes(sport)))
    : getDefaultHiddenSports();
  state.scheduledIds = Array.isArray(dayState?.scheduledIds)
    ? new Set(dayState.scheduledIds)
    : new Set<string>();
}

function saveCurrentDayState() {
  const payload = readStoredState();
  const days = payload.days ?? {};

  days[String(state.selectedDay)] = {
    scheduledIds: Array.from(state.scheduledIds)
  };

  payload.days = days;
  payload.selectedDay = state.selectedDay;
  payload.withinZoneMinutes = state.withinZoneMinutes;
  payload.betweenZoneMinutes = state.betweenZoneMinutes;
  payload.hiddenZones = Array.from(state.hiddenZones);
  payload.hiddenSports = Array.from(state.hiddenSports);
  writeStoredState(payload);
}

function loadSelectedDay(payload?: StoredPlannerState) {
  const parsed = payload ?? readStoredState();

  if (typeof parsed.selectedDay === "number") {
    state.selectedDay = Math.max(1, Math.round(parsed.selectedDay));
  }
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
  state.withinZoneMinutes = DEFAULT_WITHIN_ZONE_MINUTES;
  state.betweenZoneMinutes = DEFAULT_BETWEEN_ZONE_MINUTES;
  state.hiddenZones = getDefaultHiddenZones();
  state.hiddenSports = getDefaultHiddenSports();
  state.scheduledIds = new Set<string>();
  const days = getAvailableDays();
  state.selectedDay = days.includes(1) ? 1 : getDefaultDay();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSessionPill(sessionType: string) {
  const label = sessionType || "Unspecified";
  return `<span class="session-pill">${escapeHtml(label)}</span>`;
}

function minutesToClock(total: number) {
  const hours = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const mins = (total % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function roundDownToSlot(minutes: number) {
  return Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function roundUpToSlot(minutes: number) {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function getTransitMinutes(fromZone: string, toZone: string) {
  return fromZone === toZone ? state.withinZoneMinutes : state.betweenZoneMinutes;
}

function getSelectedDayEvents() {
  return state.events.filter((event) => event.gamesDay === state.selectedDay);
}

function getDayTimedEvents() {
  return state.events
    .filter((event) => event.gamesDay === state.selectedDay)
    .filter(isTimedEvent)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

function getVisibleDayTimedEvents() {
  return getDayTimedEvents().filter(
    (event) => isZoneVisible(event.zone) && isSportVisible(event.sport)
  );
}

function getScheduledEvents(dayEvents: TimedEvent[]) {
  return dayEvents
    .filter((event) => state.scheduledIds.has(event.id))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

function isTransitionFeasible(first: TimedEvent, second: TimedEvent) {
  return second.startMinutes >= first.endMinutes + getTransitMinutes(first.zone, second.zone);
}

function canInsertEvent(candidate: TimedEvent, scheduledEvents: TimedEvent[]) {
  if (state.scheduledIds.has(candidate.id)) {
    return false;
  }

  let insertAt = scheduledEvents.length;

  for (let i = 0; i < scheduledEvents.length; i += 1) {
    if (candidate.startMinutes < scheduledEvents[i].startMinutes) {
      insertAt = i;
      break;
    }
  }

  const previous = insertAt > 0 ? scheduledEvents[insertAt - 1] : null;
  const next = insertAt < scheduledEvents.length ? scheduledEvents[insertAt] : null;

  if (previous && !isTransitionFeasible(previous, candidate)) {
    return false;
  }

  if (next && !isTransitionFeasible(candidate, next)) {
    return false;
  }

  return true;
}

function computeReachableIds(dayEvents: EventRecord[]) {
  const reachable = new Set<string>();
  const scheduledEvents = getScheduledEvents(dayEvents);

  for (const event of dayEvents) {
    if (state.scheduledIds.has(event.id)) {
      continue;
    }

    if (scheduledEvents.length === 0 || canInsertEvent(event, scheduledEvents)) {
      reachable.add(event.id);
    }
  }

  return reachable;
}

function getPlannedDayGroups() {
  const storedState = readStoredState();
  const allDays = storedState.days ?? {};
  const selectedDayKey = String(state.selectedDay);

  allDays[selectedDayKey] = {
    withinZoneMinutes: state.withinZoneMinutes,
    betweenZoneMinutes: state.betweenZoneMinutes,
    scheduledIds: Array.from(state.scheduledIds)
  };

  const groups: PlannedDayGroup[] = Object.entries(allDays)
    .map(([dayKey, dayState]) => {
      const day = Number(dayKey);

      if (!Number.isFinite(day) || !Array.isArray(dayState?.scheduledIds)) {
        return null;
      }

      const scheduledIdSet = new Set(dayState.scheduledIds);
      const events = state.events
        .filter((event) => event.gamesDay === day && scheduledIdSet.has(event.id))
        .filter(isTimedEvent)
        .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

      if (events.length === 0) {
        return null;
      }

      return {
        day,
        dateLabel: events[0].date,
        events
      };
    })
    .filter((group): group is PlannedDayGroup => group !== null)
    .sort((a, b) => a.day - b.day);

  return groups;
}

function renderPlannerList(groups: PlannedDayGroup[]) {
  if (groups.length === 0) {
    return '<p class="kicker">No events in your planner yet. Click a reachable timeslot to add one.</p>';
  }

  return groups
    .map((group) => {
      const items = group.events
        .map(
          (event) => `<div class="planner-item">
            <div>
              <strong>${escapeHtml(event.sport)}</strong>
              ${renderSessionPill(event.sessionType)}
              <div class="kicker">${escapeHtml(event.startClock)}-${escapeHtml(event.endClock)} | ${escapeHtml(event.venue)} (${escapeHtml(event.zone)})</div>
              <div class="kicker session-description">${escapeHtml(event.sessionDescription || "No description")}</div>
            </div>
            <button class="remove-button" data-remove-id="${event.id}" data-remove-day="${group.day}" type="button">Remove</button>
          </div>`
        )
        .join("");

      return `<div class="planner-day-group">
        <h3 class="planner-day-title">
          <span>Day ${group.day} <span class="kicker">${escapeHtml(group.dateLabel)}</span></span>
          <button class="go-day-button" data-go-day="${group.day}" type="button">Go to Day ${group.day}</button>
        </h3>
        ${items}
      </div>`;
    })
    .join("");
}

function switchToDay(day: number) {
  if (day === state.selectedDay) {
    return;
  }

  saveCurrentDayState();
  state.selectedDay = day;
  applyDayState(state.selectedDay);
}

function renderCalendar(dayEvents: EventRecord[], reachableIds: Set<string>) {
  if (dayEvents.length === 0) {
    return '<div class="empty-calendar">No events available for this day.</div>';
  }

  const getColumnKey = (event: TimedEvent) => `${event.zone}||${event.venue}||${event.sport}`;

  const columns = Array.from(
    new Map(
      dayEvents.map((event) => [
        getColumnKey(event),
        {
          key: getColumnKey(event),
          zone: event.zone,
          venue: event.venue,
          eventName: event.sport
        }
      ])
    ).values()
  ).sort(
    (a, b) =>
      a.zone.localeCompare(b.zone) ||
      a.venue.localeCompare(b.venue) ||
      a.eventName.localeCompare(b.eventName)
  );

  const startMinutes = roundDownToSlot(Math.min(...dayEvents.map((event) => event.startMinutes)));
  const endMinutes = roundUpToSlot(Math.max(...dayEvents.map((event) => event.endMinutes)));
  const totalSlots = Math.max(1, (endMinutes - startMinutes) / SLOT_MINUTES);
  const totalHeight = totalSlots * PIXELS_PER_SLOT;

  const axisLabels: string[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 60) {
    const top = ((minutes - startMinutes) / SLOT_MINUTES) * PIXELS_PER_SLOT;
    axisLabels.push(
      `<div class="time-label" style="top:${top}px;">${escapeHtml(minutesToClock(minutes))}</div>`
    );
  }

  const columnsMarkup = columns
    .map((column, index) => {
      const previousZone = index > 0 ? columns[index - 1].zone : null;
      const isZoneBreak = previousZone !== null && previousZone !== column.zone;
      const bars = dayEvents
        .filter((event) => getColumnKey(event) === column.key)
        .filter((event) => state.scheduledIds.has(event.id) || reachableIds.has(event.id))
        .map((event) => {
          const top = ((event.startMinutes - startMinutes) / SLOT_MINUTES) * PIXELS_PER_SLOT;
          const height = ((event.endMinutes - event.startMinutes) / SLOT_MINUTES) * PIXELS_PER_SLOT;
          const isScheduled = state.scheduledIds.has(event.id);
          const cls = isScheduled ? "scheduled" : "reachable";
          const label = `${event.startClock}-${event.endClock} | ${event.sessionType || "Unspecified"}\n${event.sessionDescription || "No description"}`;

          return `<button
            class="event-bar ${cls}"
            data-event-id="${event.id}"
            type="button"
            style="top:${top}px;height:${height}px;"
            title="${escapeHtml(label)}"
          >
            <span class="bar-title">${escapeHtml(event.startClock)}-${escapeHtml(event.endClock)}</span>
            <span class="bar-meta">${escapeHtml(event.sessionType || "Session")}</span>
            <span class="bar-meta bar-description">${escapeHtml(event.sessionDescription || "No description")}</span>
          </button>`;
        })
        .join("");

      return `<div class="calendar-column ${isZoneBreak ? "zone-break" : ""}">
        <div class="column-header" title="${escapeHtml(`${column.zone} | ${column.venue} | ${column.eventName}`)}">
          <span class="header-zone">${escapeHtml(column.zone)}</span>
          <span class="header-venue">${escapeHtml(column.venue)}</span>
          <span class="header-event">${escapeHtml(column.eventName)}</span>
        </div>
        <div class="column-track" style="height:${totalHeight}px;">${bars}</div>
      </div>`;
    })
    .join("");

  return `<div class="calendar-shell">
    <div class="calendar-axis">
      <div class="axis-spacer"></div>
      <div class="axis-track" style="height:${totalHeight}px;">${axisLabels.join("")}</div>
    </div>
    <div class="calendar-grid" style="--column-count:${columns.length}; --slot-px:${PIXELS_PER_SLOT}px; --slot-minutes:${SLOT_MINUTES};">
      ${columnsMarkup}
    </div>
  </div>`;
}

function renderUntimedSessions(dayEvents: EventRecord[]) {
  const untimed = dayEvents.filter((event) => !isTimedEvent(event));

  if (untimed.length === 0) {
    return '<p class="kicker">All sessions for this day have fixed times.</p>';
  }

  const items = untimed
    .map(
      (event) => `<div class="planner-item">
        <div>
          <strong>${escapeHtml(event.sport)}</strong>
          ${renderSessionPill(event.sessionType)}
          <div class="kicker">${escapeHtml(event.startTime || "TBD")} - ${escapeHtml(event.endTime || "TBD")} | ${escapeHtml(event.venue)} (${escapeHtml(event.zone)})</div>
          <div class="kicker session-description">${escapeHtml(event.sessionDescription || "No description")}</div>
        </div>
      </div>`
    )
    .join("");

  return `<div>${items}</div>`;
}

function render() {
  const zoneFiltersDetails = document.querySelector<HTMLDetailsElement>("#zoneFiltersDetails");
  const sportFiltersDetails = document.querySelector<HTMLDetailsElement>("#sportFiltersDetails");

  if (zoneFiltersDetails) {
    state.zoneFiltersOpen = zoneFiltersDetails.open;
  }

  if (sportFiltersDetails) {
    state.sportFiltersOpen = sportFiltersDetails.open;
  }

  const allTimedDayEvents = getDayTimedEvents();
  const dayEvents = getVisibleDayTimedEvents();
  const selectedDayEvents = getSelectedDayEvents();

  for (const scheduledId of Array.from(state.scheduledIds)) {
    const stillVisible = allTimedDayEvents.some((event) => event.id === scheduledId);

    if (!stillVisible) {
      state.scheduledIds.delete(scheduledId);
    }
  }

  const scheduledEvents = getScheduledEvents(dayEvents);
  const reachableIds = computeReachableIds(dayEvents);
  const allPlannerGroups = getPlannedDayGroups();
  const selectedDate = selectedDayEvents[0]?.date ?? "No events";

  const dayOptions = getAvailableDays()
    .map((day) => `<option value="${day}" ${day === state.selectedDay ? "selected" : ""}>Day ${day}</option>`)
    .join("");
  const zoneOptions = getAllZones()
    .map(
      (zone) => `<label class="zone-toggle">
        <input type="checkbox" data-zone="${escapeHtml(zone)}" ${isZoneVisible(zone) ? "checked" : ""} />
        <span>${escapeHtml(zone)}</span>
      </label>`
    )
    .join("");
  const sportOptions = getAllSports()
    .map(
      (sport) => `<label class="zone-toggle">
        <input type="checkbox" data-sport="${escapeHtml(sport)}" ${isSportVisible(sport) ? "checked" : ""} />
        <span>${escapeHtml(sport)}</span>
      </label>`
    )
    .join("");

  app.innerHTML = `
    <header>
      <h1>Olympics Day Planner</h1>
      <p class="subtitle">Built from the updated LA28 session feed. Timed sessions are plannable; untimed/TBD sessions are listed separately.</p>
    </header>

    <section class="card controls-card">
      <h2>Controls</h2>
      <div class="row">
        <label for="daySelect">Day</label>
        <select id="daySelect">${dayOptions}</select>
        <span class="kicker">${escapeHtml(selectedDate)}</span>
      </div>
      <div class="row" style="margin-top:10px;">
        <label for="withinInput">Within-zone transit (min)</label>
        <input id="withinInput" type="number" min="0" value="${state.withinZoneMinutes}" />
        <label for="betweenInput">Between-zone transit (min)</label>
        <input id="betweenInput" type="number" min="0" value="${state.betweenZoneMinutes}" />
      </div>
      <div class="legend-row">
        <span class="legend-chip scheduled">Scheduled</span>
        <span class="legend-chip reachable">Reachable</span>
        <button id="clearStateButton" class="secondary-button" type="button">Clear Saved State</button>
      </div>
      <details id="zoneFiltersDetails" class="filter-details" style="margin-top:10px;" ${state.zoneFiltersOpen ? "open" : ""}>
        <summary>Zone visibility in calendar</summary>
        <div class="zone-toggles" style="margin-top:10px;">
          ${zoneOptions}
        </div>
      </details>
      <details id="sportFiltersDetails" class="filter-details" style="margin-top:10px;" ${state.sportFiltersOpen ? "open" : ""}>
        <summary>Sport visibility in calendar</summary>
        <div class="zone-toggles" style="margin-top:10px;">
          ${sportOptions}
        </div>
      </details>
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>Calendar View (15 minute slots)</h2>
      ${renderCalendar(dayEvents, reachableIds)}
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>Sessions Without Fixed Time</h2>
      ${renderUntimedSessions(selectedDayEvents)}
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>Your Planner (All Days)</h2>
      ${renderPlannerList(allPlannerGroups)}
    </section>
  `;

  const daySelect = document.querySelector<HTMLSelectElement>("#daySelect");
  daySelect?.addEventListener("change", () => {
    switchToDay(Number(daySelect.value));
    render();
  });

  const withinInput = document.querySelector<HTMLInputElement>("#withinInput");
  withinInput?.addEventListener("change", () => {
    state.withinZoneMinutes = Math.max(0, Math.round(Number(withinInput.value) || 0));
    render();
  });

  const betweenInput = document.querySelector<HTMLInputElement>("#betweenInput");
  betweenInput?.addEventListener("change", () => {
    state.betweenZoneMinutes = Math.max(0, Math.round(Number(betweenInput.value) || 0));
    render();
  });

  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-zone]').forEach((input) => {
    input.addEventListener("change", () => {
      const zone = input.dataset.zone;

      if (!zone) {
        return;
      }

      if (input.checked) {
        state.hiddenZones.delete(zone);
      } else {
        state.hiddenZones.add(zone);
      }

      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-sport]').forEach((input) => {
    input.addEventListener("change", () => {
      const sport = input.dataset.sport;

      if (!sport) {
        return;
      }

      if (input.checked) {
        state.hiddenSports.delete(sport);
      } else {
        state.hiddenSports.add(sport);
      }

      render();
    });
  });

  const zoneFiltersDetailsAfterRender = document.querySelector<HTMLDetailsElement>(
    "#zoneFiltersDetails"
  );
  zoneFiltersDetailsAfterRender?.addEventListener("toggle", () => {
    state.zoneFiltersOpen = zoneFiltersDetailsAfterRender.open;
  });

  const sportFiltersDetailsAfterRender = document.querySelector<HTMLDetailsElement>(
    "#sportFiltersDetails"
  );
  sportFiltersDetailsAfterRender?.addEventListener("toggle", () => {
    state.sportFiltersOpen = sportFiltersDetailsAfterRender.open;
  });

  document.querySelectorAll<HTMLButtonElement>(".event-bar").forEach((button) => {
    button.addEventListener("click", () => {
      const eventId = button.dataset.eventId;

      if (!eventId) {
        return;
      }

      if (state.scheduledIds.has(eventId)) {
        state.scheduledIds.delete(eventId);
        render();
        return;
      }

      if (reachableIds.has(eventId)) {
        state.scheduledIds.add(eventId);
        render();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".remove-button").forEach((button) => {
    button.addEventListener("click", () => {
      const eventId = button.dataset.removeId;
      const removeDay = Number(button.dataset.removeDay);

      if (!eventId || !Number.isFinite(removeDay)) {
        return;
      }

      if (removeDay === state.selectedDay) {
        state.scheduledIds.delete(eventId);
      } else {
        const storedState = readStoredState();
        const dayState = storedState.days?.[String(removeDay)];

        if (dayState?.scheduledIds) {
          dayState.scheduledIds = dayState.scheduledIds.filter((id) => id !== eventId);
          writeStoredState(storedState);
        }
      }

      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".go-day-button").forEach((button) => {
    button.addEventListener("click", () => {
      const day = Number(button.dataset.goDay);

      if (!Number.isFinite(day)) {
        return;
      }

      switchToDay(day);
      render();
    });
  });

  const clearStateButton = document.querySelector<HTMLButtonElement>("#clearStateButton");
  clearStateButton?.addEventListener("click", () => {
    clearSavedState();
    render();
  });

  saveCurrentDayState();
}

async function bootstrap() {
  if (Array.isArray(window.__EVENTS__)) {
    state.events = window.__EVENTS__;
  } else {
    const response = await fetch(`${import.meta.env.BASE_URL}data/events.json`);

    if (!response.ok) {
      throw new Error("Could not load events JSON. Run npm run convert:data first.");
    }

    state.events = (await response.json()) as EventRecord[];
  }
  const allDays = getAvailableDays();
  const defaultDay = allDays[0] ?? 1;

  const parsedState = readStoredState();
  loadSelectedDay(parsedState);

  if (!allDays.includes(state.selectedDay)) {
    state.selectedDay = defaultDay;
  }

  applyDayState(state.selectedDay, parsedState);

  render();
}

bootstrap().catch((error) => {
  app.innerHTML = `<section class="card"><h2>Setup needed</h2><p>${escapeHtml((error as Error).message)}</p></section>`;
});
