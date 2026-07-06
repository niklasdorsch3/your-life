# your-life — Domain Glossary

## Chart

The grid of boxes generated from JS at runtime (box count = life expectancy × `UNITS_PER_YEAR[unit]`; each `<li>` carries a `data-index`). Each box represents one unit of time (year, month, or week). Elapsed boxes get the `elapsed` class and are filled with the "lived" colour (default grey), which is editable via the colour input next to Life expectancy and persists to `localStorage` under `ELAPSED_COLOR`. Boxes can also be covered by Period bands and marked by Event diamonds.

The active unit is read from the `data-unit` attribute on `<body>` (not from label text). The box index for any date is computed by the pure `dateToIndex(date, dob, unit)` function.

On the weeks view, two sliders adjust the vertical and horizontal spacing between boxes (grid gaps), letting the user open the chart up so period bands are easier to see. The values drive CSS gap variables and persist to `localStorage` (`ROW_GAP`, `COL_GAP`). An "Only show life" checkbox hides the annotation layer (events + periods) to show just the boxes; it is session-only and always starts off.

The site root (`index.html`) redirects to the weeks view, which is the default.

**Scope:** the Side Panel, Events, and Periods currently render on the **weeks** view only. Years and months generate their boxes and colour elapsed time from the same shared code, but do not yet show annotations (their rotated/circular boxes need bespoke band/diamond styling first). `dateToIndex` is already unit-generic, so extending is a flag flip (`ANNOTATIONS_UNIT` in `your-life.js`).

---

## Unit

The time granularity displayed: **years**, **months**, or **weeks**. Determined by the current page (`years.html`, `months.html`, `weeks.html`). Switching units navigates to the corresponding page via the Unitbox dropdown.

---

## Date of Birth (DOB)

The user's birth date, entered via the form (month select, day input, year input). Stored in `localStorage` as `{ month, day, year }` and reloaded on page open. Month values are 0-indexed (matching JavaScript's `Date` API).

---

## Elapsed Time

The number of elapsed units (years/months/weeks) since the user's date of birth. Drives how many Chart boxes are coloured red.

---

## Lifespan / Life Expectancy

The assumed maximum lifespan, in years — it sets the total number of boxes in the chart (years = life expectancy, months = ×12, weeks = ×52). Editable via the **Life expectancy** number input below the Date of Birth form; changing it regenerates the chart (and the weeks Age axis) live. Defaults to **90** and persists to `localStorage` under `LIFE_EXPECTANCY`. Generated from JS; not hardcoded in HTML.

---

## Unitbox

The `<select id="unitbox">` dropdown that switches between years, months, and weeks views. On change, navigates to the corresponding `.html` file.

---

## Event

A single point in time with a label and color. No duration. Displayed as a colored diamond ◆ with a label, positioned above the relevant box. Hovering shows the label as a tooltip. Stored in `localStorage`.

---

## Period

A span of time with a label, color, start date, and end date. Can be past, present, or future (future periods are used for planning). Displayed as a colored band below each box it covers. Multiple periods can overlap on the same box — their bands stack vertically. Stored in `localStorage`.

---

## Band

The visual representation of a Period on a specific box. A thin colored strip rendered below the box, extended sideways to meet its neighbours so a period reads as one continuous stripe. One band per period per box.

Each period is assigned a fixed **lane** (vertical level) via interval partitioning, so its band stays at one level along its whole span instead of jumping up or down where overlapping periods begin and end. Boxes leave empty (transparent) spacer lanes below the deepest lane present to keep everything aligned. Bands auto-thin (down to 1px) when the lanes stack deep so they still fit below the box.

---

## Legend

A list of all Periods, shown in the side panel. Hovering a legend entry highlights all boxes covered by that Period in its color. Other periods are unaffected. Highlight snaps back instantly on mouse-leave.

---

## Side Panel

The always-visible editing panel beside the Chart. Contains two always-on lists — one for Events, one for Periods. Each row has editable inputs (label, color, date or date range) and a delete button. An "add" button appends a new blank row. No separate edit mode — rows are always editable.
