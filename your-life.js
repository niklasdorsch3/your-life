/**
 * Interactive form and chart logic.
 *
 * Drives all three views (years / months / weeks). The active view is read
 * from `<body data-unit="...">`. Chart boxes are generated here (no hardcoded
 * <li> in the HTML). Events and Periods are read from localStorage and painted
 * onto the chart; the Side Panel (currently weeks-only) edits them.
 */

'use strict';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const DEFAULT_LIFE_EXPECTANCY = 90; // years
const MIN_LIFE_EXPECTANCY = 1;
const MAX_LIFE_EXPECTANCY = 150;
const WEEKS_PER_YEAR = 52; // The chart simplifies a year to 52 weeks.
const AVG_DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Boxes per year, per unit. Total boxes = life expectancy × this.
const UNITS_PER_YEAR = { years: 1, months: 12, weeks: WEEKS_PER_YEAR };

const STORAGE = {
  DOB: 'DOB',
  EVENTS: 'EVENTS',
  PERIODS: 'PERIODS',
  LIFE_EXPECTANCY: 'LIFE_EXPECTANCY',
  ELAPSED_COLOR: 'ELAPSED_COLOR',
  ROW_GAP: 'ROW_GAP',
  COL_GAP: 'COL_GAP',
};

const DEFAULT_ELAPSED_COLOR = '#b8b8b8';
const DEFAULT_ROW_GAP = 6; // px, vertical spacing between box rows
const DEFAULT_COL_GAP = 4; // px, horizontal spacing between box columns

// Gap between stacked bands, and a little slack past the row gap, for sizing.
const BAND_GAP = 1;
const BAND_TOLERANCE = 2;
const KEY = { UP: 38, DOWN: 40 };

// Events and Periods are drawn on the weeks view only for now. The years and
// months boxes are rotated/circular, so bands and diamonds need bespoke styling
// before they'll look native there — that's deferred with the rest of their
// "full treatment". The logic below stays unit-generic so enabling is a flag flip.
const ANNOTATIONS_UNIT = 'weeks';

/* ------------------------------------------------------------------ *
 * DOM references
 * ------------------------------------------------------------------ */

const unit = document.body.dataset.unit;

const yearEl = document.getElementById('year');
const monthEl = document.getElementById('month');
const dayEl = document.getElementById('day');
const unitboxEl = document.getElementById('unitbox');
const chartEl = document.getElementById('chart');
const lifeExpectancyEl = document.getElementById('life-expectancy');
const livedColorEl = document.getElementById('lived-color');
const rowGapEl = document.getElementById('row-gap');
const colGapEl = document.getElementById('col-gap');
const yMarkersEl = document.querySelector('.weeks--y-markers');

// Side Panel (present on the weeks view only, for now).
const eventsRowsEl = document.getElementById('events-rows');
const periodsRowsEl = document.getElementById('periods-rows');
const addEventBtn = document.getElementById('add-event');
const addPeriodBtn = document.getElementById('add-period');
const hasSidePanel = Boolean(eventsRowsEl && periodsRowsEl);

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const boxes = []; // chart <li> elements, indexed by box index
let events = loadCollection(STORAGE.EVENTS);
let periods = loadCollection(STORAGE.PERIODS);
let lifeExpectancy = loadLifeExpectancy(); // in years
let boxCount = lifeExpectancy * UNITS_PER_YEAR[unit];
let elapsedColor = localStorage.getItem(STORAGE.ELAPSED_COLOR) || DEFAULT_ELAPSED_COLOR;
let rowGap = loadGap(STORAGE.ROW_GAP, DEFAULT_ROW_GAP);
let colGap = loadGap(STORAGE.COL_GAP, DEFAULT_COL_GAP);

/* ------------------------------------------------------------------ *
 * Pure logic (no DOM) — the piece most worth testing.
 * ------------------------------------------------------------------ */

/**
 * Map a calendar date to a 0-based chart box index for the given unit,
 * relative to the date of birth. Returns -1 for dates before birth.
 */
const dateToIndex = (date, dob, activeUnit) => {
  const diff = date.getTime() - dob.getTime();
  if (diff < 0) return -1;

  if (activeUnit === 'years') {
    // The millisecond diff, read as a UTC year, minus 1970 gives whole
    // elapsed years. See https://stackoverflow.com/a/24181701/1154642
    return new Date(diff).getUTCFullYear() - 1970;
  }

  if (activeUnit === 'months') {
    // Variable-length months are approximated by the average month length.
    return Math.floor(diff / (MS_PER_DAY * AVG_DAYS_PER_MONTH));
  }

  // weeks — the chart shows 52 weeks/year for simplicity, but a year is
  // really ~52.143 weeks. Diffing weeks directly would drift over time, so
  // we add a fixed 52 per whole elapsed year and diff only the current
  // partial year (0..51 weeks since the most recent birthday).
  const elapsedYears = new Date(diff).getUTCFullYear() - 1970;
  const lastBirthday = new Date(
    dob.getFullYear() + elapsedYears,
    dob.getMonth(),
    dob.getDate()
  );
  const daysSinceBirthday = Math.floor(
    (date.getTime() - lastBirthday.getTime()) / MS_PER_DAY
  );
  const weekOfYear = Math.min(Math.floor(daysSinceBirthday / 7), WEEKS_PER_YEAR - 1);
  return elapsedYears * WEEKS_PER_YEAR + weekOfYear;
};

/** Number of fully-elapsed boxes since birth (drives the red coloring). */
const calculateElapsedTime = () => dateToIndex(new Date(), getDateOfBirth(), unit);

/** Parse an ISO `YYYY-MM-DD` string into a local Date (or null). */
const parseISODate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

/* ------------------------------------------------------------------ *
 * Date-of-birth form
 * ------------------------------------------------------------------ */

const getDateOfBirth = () =>
  new Date(yearEl.value, monthEl.value, dayEl.value);

const dateIsValid = () =>
  monthEl.checkValidity() && dayEl.checkValidity() && yearEl.checkValidity();

const saveDOB = () => {
  localStorage.setItem(
    STORAGE.DOB,
    JSON.stringify({ month: monthEl.value, year: yearEl.value, day: dayEl.value })
  );
};

const handleDateChange = () => {
  saveDOB();
  render();
};

const handleUpDown = (e) => {
  const thisKey = e.keyCode || e.which;
  if (!e.target.checkValidity()) return;
  if (thisKey === KEY.UP || thisKey === KEY.DOWN) {
    const delta = thisKey === KEY.UP ? 1 : -1;
    // Arrow keys and programmatic value changes don't fire `input`, so we
    // trigger the update manually.
    e.target.value = parseInt(e.target.value, 10) + delta;
    handleDateChange();
  }
};

const unhideValidationStyles = (e) => e.target.classList.add('touched');

const loadStoredDOB = () => {
  const dob = JSON.parse(localStorage.getItem(STORAGE.DOB));
  if (!dob) return;
  if (dob.month >= 0 && dob.month < 12) monthEl.value = dob.month;
  if (dob.year) yearEl.value = dob.year;
  if (dob.day > 0 && dob.day < 32) dayEl.value = dob.day;
  handleDateChange();
};

/* ------------------------------------------------------------------ *
 * Chart generation + rendering
 * ------------------------------------------------------------------ */

const buildChart = () => {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < boxCount; i++) {
    const li = document.createElement('li');
    li.dataset.index = i;
    boxes.push(li);
    fragment.appendChild(li);
  }
  chartEl.appendChild(fragment);
};

/** Regenerate all boxes (e.g. after a life-expectancy change). */
const rebuildChart = () => {
  boxes.length = 0;
  chartEl.replaceChildren();
  buildChart();
  buildYAxis();
};

/**
 * Regenerate the weeks "Age" markers to match the current life expectancy.
 * Positions are set inline as a percentage of the chart's height, so they
 * stay correct for any lifespan. (Years/months have no axis to update.)
 */
const buildYAxis = () => {
  if (!yMarkersEl) return;
  const ages = [];
  for (let age = 0; age < lifeExpectancy; age += 5) ages.push(age);
  ages.push(lifeExpectancy); // always label the final age
  yMarkersEl.replaceChildren(
    ...ages.map((age) => {
      const span = document.createElement('span');
      span.textContent = age;
      span.style.top = `${(age / lifeExpectancy) * 100}%`;
      return span;
    })
  );
};

/** The box-index range a period covers, clamped to the chart. null if none. */
const coverageRange = (period, dob) => {
  const start = parseISODate(period.startDate);
  const end = parseISODate(period.endDate);
  if (!start || !end) return null;
  const startIndex = Math.max(0, dateToIndex(start, dob, unit));
  const endIndex = Math.min(boxCount - 1, dateToIndex(end, dob, unit));
  if (endIndex < 0 || startIndex > boxCount - 1 || endIndex < startIndex) return null;
  return { start: startIndex, end: endIndex };
};

/** Indices covered by a period, clamped to the chart. Empty if out of range. */
const periodCoverage = (period, dob) => {
  const range = coverageRange(period, dob);
  if (!range) return [];
  const indices = [];
  for (let i = range.start; i <= range.end; i++) indices.push(i);
  return indices;
};

/**
 * Assign each period a fixed vertical lane so its band stays at one level along
 * its whole span (rather than jumping where overlaps begin/end). This is
 * interval partitioning: process by start index and reuse the lowest lane whose
 * previous period has already ended. Lane count equals the deepest overlap.
 */
const assignLanes = (ranges) => {
  const laneEnds = []; // laneEnds[l] = last covered index in lane l
  const laneOf = new Array(ranges.length).fill(-1);
  const order = ranges
    .map((_, i) => i)
    .filter((i) => ranges[i])
    .sort((a, b) => ranges[a].start - ranges[b].start);

  order.forEach((i) => {
    const { start, end } = ranges[i];
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    laneOf[i] = lane;
  });

  return { laneOf, laneCount: laneEnds.length };
};

const render = () => {
  const dob = getDateOfBirth();
  const elapsed = dateIsValid() ? calculateElapsedTime() : 0;

  // 1. Reset every box: color + overlays.
  boxes.forEach((box, i) => {
    box.classList.toggle('elapsed', i < elapsed);
    box.classList.remove('highlighted');
    box.style.removeProperty('--highlight-color');
    box.replaceChildren(); // drop old bands + event markers
  });

  if (!dateIsValid() || unit !== ANNOTATIONS_UNIT) return;

  // 2. Periods → bands below covered boxes. Each period keeps a fixed lane so
  //    its stripe stays at one vertical level across its whole span.
  const ranges = periods.map((period) =>
    period.color ? coverageRange(period, dob) : null
  );
  const { laneOf, laneCount } = assignLanes(ranges);

  // Gather, per box, which color sits in each lane.
  const lanesByBox = new Map(); // box index → { [lane]: color }
  periods.forEach((period, pi) => {
    const range = ranges[pi];
    if (!range) return;
    for (let i = range.start; i <= range.end; i++) {
      let lanes = lanesByBox.get(i);
      if (!lanes) {
        lanes = {};
        lanesByBox.set(i, lanes);
      }
      lanes[laneOf[pi]] = period.color;
    }
  });

  // Render each covered box's lanes top-down, leaving empty (transparent)
  // spacers for lanes below the deepest one present so levels stay aligned.
  lanesByBox.forEach((laneColors, i) => {
    const container = getBandContainer(boxes[i]);
    const maxLane = Math.max(...Object.keys(laneColors).map(Number));
    for (let lane = 0; lane <= maxLane; lane++) {
      const band = document.createElement('div');
      band.className = 'band';
      if (laneColors[lane]) band.style.backgroundColor = laneColors[lane];
      container.appendChild(band);
    }
  });
  setBandHeight(laneCount);

  // 3. Events → diamond + label above the box they fall on.
  events.forEach((event) => {
    const date = parseISODate(event.date);
    if (!date) return;
    const index = dateToIndex(date, dob, unit);
    if (index < 0 || index >= boxCount) return;
    boxes[index].appendChild(buildEventMarker(event));
  });
};

/**
 * Size every band so the deepest stack still fits below its box. Bands stay a
 * comfortable 3px until periods overlap enough to need thinning; the height is
 * uniform across all bands so a single period reads as one even stripe.
 */
const setBandHeight = (maxStack) => {
  let height = 3;
  if (maxStack > 1) {
    const available = rowGap + BAND_TOLERANCE - (maxStack - 1) * BAND_GAP;
    height = Math.max(1, Math.min(3, Math.floor(available / maxStack)));
  }
  chartEl.style.setProperty('--band-height', `${height}px`);
};

/** Lazily create (once) the bands stack container inside a box. */
const getBandContainer = (box) => {
  let container = box.querySelector('.box-bands');
  if (!container) {
    container = document.createElement('div');
    container.className = 'box-bands';
    box.appendChild(container);
  }
  return container;
};

const buildEventMarker = (event) => {
  const marker = document.createElement('div');
  marker.className = 'event-marker';

  const diamond = document.createElement('span');
  diamond.className = 'event-diamond';
  diamond.textContent = '◆'; // ◆
  diamond.style.color = event.color || '#1a1a1a';

  const label = document.createElement('span');
  label.className = 'event-label';
  label.textContent = event.label || '';

  marker.title = event.label || '';
  marker.append(diamond, label);
  return marker;
};

/* ------------------------------------------------------------------ *
 * localStorage helpers for collections
 * ------------------------------------------------------------------ */

function loadCollection(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`Could not parse ${key} from localStorage`, err);
    return [];
  }
}

function loadLifeExpectancy() {
  const stored = parseInt(localStorage.getItem(STORAGE.LIFE_EXPECTANCY), 10);
  return stored >= MIN_LIFE_EXPECTANCY && stored <= MAX_LIFE_EXPECTANCY
    ? stored
    : DEFAULT_LIFE_EXPECTANCY;
}

const handleLifeExpectancyChange = () => {
  const value = parseInt(lifeExpectancyEl.value, 10);
  if (!(value >= MIN_LIFE_EXPECTANCY && value <= MAX_LIFE_EXPECTANCY)) return;
  lifeExpectancy = value;
  boxCount = lifeExpectancy * UNITS_PER_YEAR[unit];
  localStorage.setItem(STORAGE.LIFE_EXPECTANCY, String(lifeExpectancy));
  rebuildChart();
  render();
};

/** Apply the chosen "lived" color to elapsed boxes via the CSS custom property. */
const applyElapsedColor = () =>
  document.documentElement.style.setProperty('--color-elapsed', elapsedColor);

const handleLivedColorChange = () => {
  elapsedColor = livedColorEl.value;
  localStorage.setItem(STORAGE.ELAPSED_COLOR, elapsedColor);
  applyElapsedColor();
};

function loadGap(key, fallback) {
  const stored = parseInt(localStorage.getItem(key), 10);
  return Number.isFinite(stored) && stored >= 0 ? stored : fallback;
}

/** Push the current box spacing into CSS (grid gaps + band side extension). */
const applySpacing = () => {
  chartEl.style.setProperty('--row-gap', `${rowGap}px`);
  chartEl.style.setProperty('--col-gap', `${colGap}px`);
  // Half the column gap plus the box's 1px border, so bands meet at the
  // midpoint between boxes instead of stopping short at the border.
  chartEl.style.setProperty('--band-side', `${colGap / 2 + 1}px`);
};

const handleRowGapChange = () => {
  rowGap = parseInt(rowGapEl.value, 10);
  localStorage.setItem(STORAGE.ROW_GAP, String(rowGap));
  applySpacing();
  render(); // recompute band heights for the new vertical room
};

const handleColGapChange = () => {
  colGap = parseInt(colGapEl.value, 10);
  localStorage.setItem(STORAGE.COL_GAP, String(colGap));
  applySpacing();
};

const saveEvents = () =>
  localStorage.setItem(STORAGE.EVENTS, JSON.stringify(events));
const savePeriods = () =>
  localStorage.setItem(STORAGE.PERIODS, JSON.stringify(periods));

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

/* ------------------------------------------------------------------ *
 * Side Panel — always-editable rows for Events and Periods.
 * ------------------------------------------------------------------ */

const makeInput = (type, value, onInput, extra = {}) => {
  const input = document.createElement('input');
  input.type = type;
  input.value = value || '';
  Object.assign(input, extra);
  input.addEventListener('input', () => onInput(input.value));
  return input;
};

const makeDeleteButton = (onClick) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-delete';
  button.textContent = '×'; // ×
  button.title = 'Delete';
  button.addEventListener('click', onClick);
  return button;
};

const buildEventRow = (event) => {
  const row = document.createElement('div');
  row.className = 'panel-row';

  row.appendChild(
    makeInput('text', event.label, (v) => {
      event.label = v;
      saveEvents();
      render();
    }, { placeholder: 'Label', className: 'row-label' })
  );
  row.appendChild(
    makeInput('color', event.color || '#1a1a1a', (v) => {
      event.color = v;
      saveEvents();
      render();
    }, { className: 'row-color' })
  );
  row.appendChild(
    makeInput('date', event.date, (v) => {
      event.date = v;
      saveEvents();
      render();
    }, { className: 'row-date' })
  );
  row.appendChild(
    makeDeleteButton(() => {
      events = events.filter((e) => e.id !== event.id);
      saveEvents();
      renderEventRows();
      render();
    })
  );
  return row;
};

const buildPeriodRow = (period) => {
  const row = document.createElement('div');
  row.className = 'panel-row';

  row.appendChild(
    makeInput('text', period.label, (v) => {
      period.label = v;
      savePeriods();
      render();
    }, { placeholder: 'Label', className: 'row-label' })
  );
  row.appendChild(
    makeInput('color', period.color || '#000080', (v) => {
      period.color = v;
      savePeriods();
      render();
    }, { className: 'row-color' })
  );

  const dates = document.createElement('div');
  dates.className = 'row-dates';
  dates.appendChild(
    makeInput('date', period.startDate, (v) => {
      period.startDate = v;
      savePeriods();
      render();
    }, { className: 'row-date', title: 'Start date' })
  );
  dates.appendChild(
    makeInput('date', period.endDate, (v) => {
      period.endDate = v;
      savePeriods();
      render();
    }, { className: 'row-date', title: 'End date' })
  );
  row.appendChild(dates);

  row.appendChild(
    makeDeleteButton(() => {
      periods = periods.filter((p) => p.id !== period.id);
      savePeriods();
      renderPeriodRows();
      render();
    })
  );

  // Legend behavior: hovering the row highlights the covered boxes.
  row.addEventListener('mouseenter', () => highlightPeriod(period));
  row.addEventListener('mouseleave', clearHighlight);
  return row;
};

const renderEventRows = () => {
  if (!hasSidePanel) return;
  eventsRowsEl.replaceChildren(...events.map(buildEventRow));
};

const renderPeriodRows = () => {
  if (!hasSidePanel) return;
  periodsRowsEl.replaceChildren(...periods.map(buildPeriodRow));
};

const highlightPeriod = (period) => {
  if (!period.color || !dateIsValid()) return;
  periodCoverage(period, getDateOfBirth()).forEach((i) => {
    boxes[i].style.setProperty('--highlight-color', period.color);
    boxes[i].classList.add('highlighted');
  });
};

const clearHighlight = () => {
  boxes.forEach((box) => {
    box.classList.remove('highlighted');
    box.style.removeProperty('--highlight-color');
  });
};

const addEvent = () => {
  events.push({ id: newId(), label: '', color: '#1a1a1a', date: '' });
  saveEvents();
  renderEventRows();
};

const addPeriod = () => {
  periods.push({ id: newId(), label: '', color: '#000080', startDate: '', endDate: '' });
  savePeriods();
  renderPeriodRows();
};

/* ------------------------------------------------------------------ *
 * Init
 * ------------------------------------------------------------------ */

const init = () => {
  buildChart();
  buildYAxis();

  applyElapsedColor();
  applySpacing();

  if (lifeExpectancyEl) {
    lifeExpectancyEl.value = lifeExpectancy;
    lifeExpectancyEl.addEventListener('input', handleLifeExpectancyChange);
  }

  if (livedColorEl) {
    livedColorEl.value = elapsedColor;
    livedColorEl.addEventListener('input', handleLivedColorChange);
  }

  if (rowGapEl && colGapEl) {
    rowGapEl.value = rowGap;
    colGapEl.value = colGap;
    rowGapEl.addEventListener('input', handleRowGapChange);
    colGapEl.addEventListener('input', handleColGapChange);
  }

  unitboxEl.addEventListener('change', (e) => {
    window.location = `${e.currentTarget.value}.html`;
  });

  yearEl.addEventListener('input', handleDateChange);
  yearEl.addEventListener('keydown', handleUpDown);
  yearEl.addEventListener('blur', unhideValidationStyles);
  monthEl.addEventListener('change', handleDateChange);
  monthEl.addEventListener('keydown', handleUpDown);
  dayEl.addEventListener('input', handleDateChange);
  dayEl.addEventListener('blur', unhideValidationStyles);
  dayEl.addEventListener('keydown', handleUpDown);

  // Ensure the month is unselected by default.
  monthEl.selectedIndex = -1;

  if (hasSidePanel) {
    addEventBtn.addEventListener('click', addEvent);
    addPeriodBtn.addEventListener('click', addPeriod);
    renderEventRows();
    renderPeriodRows();
  }

  loadStoredDOB();
  render();
};

init();
