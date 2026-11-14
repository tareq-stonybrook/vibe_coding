# Accessibility audit, WCAG 2.1 AA

Checked November 14, 2026 against the Definition of Done in `docs/project-charter.xlsx` (US-9). This records what was measured. It does not claim full compliance.

## How it was checked

* Playwright with Chromium, all 8 steps, using the first fictional example notice.
* axe-core 4.10.2, tags wcag2a, wcag2aa, wcag21a, wcag21aa, light and dark mode, all `details` panels opened.
* Reflow at 320 by 256 CSS px (400% zoom) and 640 by 450 (200% zoom).
* Text resize to 200% font size at 1280 px.
* Text spacing override from WCAG 1.4.12 at 1280 and 320 px.
* Keyboard Tab order and focus outline on step 1.
* Contrast ratios computed from the color tokens in `styles.css` with the WCAG formula.

## Results

| Criterion | Result | Notes |
| --- | --- | --- |
| 1.4.3 Text contrast | Pass | Lowest text 4.66:1 (muted text on grey tile, light mode) |
| 1.4.11 Non text contrast | Pass after fix | Field borders were 1.38:1 to 2.1:1. Now 3.33:1 light, 4.09:1 dark |
| 1.4.10 Reflow | Pass after fix | Step list scrolled sideways at 320 px and hid steps 5 to 8. It now wraps |
| 2.1.1 Keyboard | Pass after fix | The step list scroll area could not be reached by keyboard. Fixed by the wrap |
| 1.4.4 Resize text | Pass | No clipped text at 200% |
| 1.4.12 Text spacing | Pass | No clipped text |
| 2.4.1 Bypass blocks | Pass | Skip link works |
| 2.4.3 Focus order, 2.4.7 Focus visible | Pass | 3 px outline, focus moves to each step heading |
| 3.1.1 Language | Pass | `lang="en"` |
| 4.1.2 Name, role, value | Pass after fix | `#notice-review` had `aria-label` with no role. Now `role="group"` |
| axe automated scan | 0 violations | All 8 steps, light and dark, after the fixes |

## Fixes made November 14, 2026

* `styles.css`: new `--field-border` token (`#86868b` light, `#7c7c80` dark) on inputs, selects, text areas, choice cards, the upload drop zone and the letter box.
* `styles.css`: `#step-list` wraps instead of scrolling.
* `index.html`: `role="group"` on `#notice-review`.
* `tests/e2e.js`: checks field border contrast of 3:1 and that every step name fits the screen.

## Still open

* **Screen reader pass not done.** No NVDA, JAWS, VoiceOver or TalkBack was available. A team member must run the full flow with at least one desktop and one mobile screen reader and record the result here.
* `aside.test-banner` sits outside landmarks. axe best practice only, not a WCAG AA failure.
* The sticky header takes 96 of 256 px at 400% zoom. Content stays usable. Worth a manual look.
* Automated tools miss many issues. A pass here is not proof of full AA conformance.
