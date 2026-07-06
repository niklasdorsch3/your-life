## Stack

Vanilla HTML/CSS/JavaScript. No framework, no build step, no package manager. Open any `.html` file directly in a browser.

---

## Testing

There is no automated test suite. After any logic change to `your-life.js`, manually verify in the browser:
- Enter a date of birth and confirm the correct number of units (years/months/weeks) turn red
- Switch between all three views (years/months/weeks) and confirm counts are consistent
- Confirm localStorage persists the date of birth across page reloads

---

## Git workflow

Commit and push at every logical stopping point — after a feature works, a bug is fixed, or docs are updated. Don't wait to be asked. Use conventional commit messages.

---

## Documentation — non-negotiable

Before marking any task done, verify:

- `CONTEXT.md` — updated if any domain term or UI behaviour changed

Stale documentation is treated as a bug.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`niklasdorsch3/your-life`). See `docs/agents/issue-tracker.md`.

### Triage labels

Using default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — `CONTEXT.md` at the repo root. See `docs/agents/domain.md`.

---

## Code style

- Vanilla JS only — no libraries, no frameworks
- Follow the existing IIFE pattern in `your-life.js`
- CSS lives in `your-life.css`; keep selectors flat and descriptive
- HTML pages share the same structure — when modifying one, check whether all three views need the same change
