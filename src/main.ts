import "./style.css";

type EventRecord = {
  id: string;
  zone: string;
  venue: string;
  event: string;
  day: number;
  dateLabel: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  medal: string;
};

type StoredDayState = {
  withinZoneMinutes?: number;
  betweenZoneMinutes?: number;
  scheduledIds?: string[];
};

type StoredPlannerState = {
  selectedDay?: number;
  days?: Record<string, StoredDayState>;
};

type PlannedDayGroup = {
  day: number;
  dateLabel: string;
  events: EventRecord[];
};

type MedalKind = "gold" | "bronze" | "none";

const SLOT_MINUTES = 15;
const PIXELS_PER_SLOT = 24;
const STORAGE_KEY = "olympics-day-planner-state-v1";
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
  scheduledIds: new Set<string>()
};

function getDefaultDay() {
  const days = Array.from(new Set(state.events.map((event) => event.day))).sort((a, b) => a - b);
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
    typeof dayState?.withinZoneMinutes === "number"
      ? Math.max(0, Math.round(dayState.withinZoneMinutes))
      : DEFAULT_WITHIN_ZONE_MINUTES;
  state.betweenZoneMinutes =
    typeof dayState?.betweenZoneMinutes === "number"
      ? Math.max(0, Math.round(dayState.betweenZoneMinutes))
      : DEFAULT_BETWEEN_ZONE_MINUTES;
  state.scheduledIds = Array.isArray(dayState?.scheduledIds)
    ? new Set(dayState.scheduledIds)
    : new Set<string>();
}

function saveCurrentDayState() {
  const payload = readStoredState();
  const days = payload.days ?? {};

  days[String(state.selectedDay)] = {
    withinZoneMinutes: state.withinZoneMinutes,
    betweenZoneMinutes: state.betweenZoneMinutes,
    scheduledIds: Array.from(state.scheduledIds)
  };

  payload.days = days;
  payload.selectedDay = state.selectedDay;
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
  state.scheduledIds = new Set<string>();
  state.selectedDay = getDefaultDay();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getMedalKind(medalValue: string): MedalKind {
  const normalized = medalValue.trim().toLowerCase();

  if (normalized === "g" || normalized === "gold") {
    return "gold";
  }

  if (normalized === "b" || normalized === "bronze") {
    return "bronze";
  }

  return "none";
}

function getMedalLabel(medalValue: string) {
  const kind = getMedalKind(medalValue);

  if (kind === "gold") {
    return "Gold medal";
  }

  if (kind === "bronze") {
    return "Bronze medal";
  }

  return "No medal";
}

function renderMedalPill(medalValue: string) {
  const medalKind = getMedalKind(medalValue);

  if (medalKind === "none") {
    return "";
  }

  return `<span class="medal-pill ${medalKind}">${escapeHtml(getMedalLabel(medalValue))}</span>`;
}

function renderMedalDot(medalValue: string) {
  const medalKind = getMedalKind(medalValue);

  if (medalKind === "none") {
    return "";
  }

  return `<span class="medal-dot ${medalKind}">${escapeHtml(getMedalLabel(medalValue))}</span>`;
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

function getDayEvents() {
  return state.events
    .filter((event) => event.day === state.selectedDay)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

function getScheduledEvents(dayEvents: EventRecord[]) {
  return dayEvents
    .filter((event) => state.scheduledIds.has(event.id))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

function isTransitionFeasible(first: EventRecord, second: EventRecord) {
  return second.startMinutes >= first.endMinutes + getTransitMinutes(first.zone, second.zone);
}

function canInsertEvent(candidate: EventRecord, scheduledEvents: EventRecord[]) {
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
        .filter((event) => event.day === day && scheduledIdSet.has(event.id))
        .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

      if (events.length === 0) {
        return null;
      }

      return {
        day,
        dateLabel: events[0].dateLabel,
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
              <strong>${escapeHtml(event.event)}</strong>
              ${renderMedalPill(event.medal)}
              <div class="kicker">${escapeHtml(event.start)}-${escapeHtml(event.end)} | ${escapeHtml(event.venue)} (${escapeHtml(event.zone)})</div>
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

  const getColumnKey = (event: EventRecord) => `${event.zone}||${event.venue}||${event.event}`;

  const columns = Array.from(
    new Map(
      dayEvents.map((event) => [
        getColumnKey(event),
        {
          key: getColumnKey(event),
          zone: event.zone,
          venue: event.venue,
          eventName: event.event
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
          const medalLabel = getMedalLabel(event.medal);
          const medalDot = renderMedalDot(event.medal);
          const label =
            getMedalKind(event.medal) === "none"
              ? `${event.start}-${event.end}`
              : `${event.start}-${event.end} | ${medalLabel}`;

          return `<button
            class="event-bar ${cls}"
            data-event-id="${event.id}"
            type="button"
            style="top:${top}px;height:${height}px;"
            title="${escapeHtml(label)}"
          >
            <span class="bar-title">${escapeHtml(event.start)}-${escapeHtml(event.end)}</span>
            <span class="bar-meta">${medalDot}</span>
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

function render() {
  const dayEvents = getDayEvents();

  for (const scheduledId of Array.from(state.scheduledIds)) {
    const stillVisible = dayEvents.some((event) => event.id === scheduledId);

    if (!stillVisible) {
      state.scheduledIds.delete(scheduledId);
    }
  }

  const scheduledEvents = getScheduledEvents(dayEvents);
  const reachableIds = computeReachableIds(dayEvents);
  const allPlannerGroups = getPlannedDayGroups();
  const selectedDate = dayEvents[0]?.dateLabel ?? "No events";

  const dayOptions = Array.from(new Set(state.events.map((event) => event.day)))
    .sort((a, b) => a - b)
    .map((day) => `<option value="${day}" ${day === state.selectedDay ? "selected" : ""}>Day ${day}</option>`)
    .join("");

  app.innerHTML = `
    <header>
      <h1>Olympics Day Planner</h1>
      <p class="subtitle">Set global transit assumptions, then click reachable blocks to build your day plan.</p>
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
    </section>

    <section class="card" style="margin-top:16px;">
      <h2>Calendar View (15 minute slots)</h2>
      ${renderCalendar(dayEvents, reachableIds)}
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
    const response = await fetch("/data/events.json");

    if (!response.ok) {
      throw new Error("Could not load events JSON. Run npm run convert:data first.");
    }

    state.events = (await response.json()) as EventRecord[];
  }
  const allDays = Array.from(new Set(state.events.map((event) => event.day))).sort((a, b) => a - b);
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
