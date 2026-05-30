# Change Log for Branch Sync

This file records product-level changes that may need to be replayed into other Clockin branches.

## 2026-05-30 - Work Package 1: Attendance Entry Usability

- Removed vibration from attendance save completion feedback while keeping the visual completion wave and sound cue.
- Polished the mobile attendance status dropdown with a Tailwind-styled button, floating menu, active state, and clearer danger/action coloring.
- Changed default editable work hours from "last worked hours" behavior to a recent 30-day mode per employee, so occasional short leave days do not become the next day's default.
- Kept the existing status options unchanged for now.
- Updated the desktop attendance date heading to use `YYYY年M月D日 · 周X` formatting.
- Updated display preference copy from "animation and vibration" to "animation and sound".

## 2026-05-30 - Work Package 2: Pay Day and Salary Clarity

- Added `tenant_config.salary_pay_day` with runtime lazy column creation and a default value of `15`.
- Added a "每月发薪日" field to the work time settings page.
- Changed salary pages without explicit `year/month` query params to default to last month through the configured pay day, then current month after the pay day.
- Added direct multiplication-style salary hints on the monthly salary list and kept detailed multiplication segments in payslip details.
- Added an "我有疑问" pill on monthly salary and payslip pages that opens the AI assistant with a fixed rule-based clarification prompt before the user asks the real question.

## 2026-05-30 - Work Package 3: Invite Demo Login

- Added optional invite-only login mode controlled by `INVITE_LOGIN_ENABLED`.
- When invite login is enabled, `/login` shows only a single invite-code input and logs into the configured existing admin account.
- Added `INVITE_CODE` and optional `INVITE_LOGIN_PHONE`; if no phone is configured, the first admin account is used.
- Invite login records rate-limit attempts under the `invite` attempt type and writes an `invite_login` audit action.
- Added invite-login environment examples to `.env.example`.

## 2026-05-30 - Work Package 4: Richer Virtual Demo Data

- Expanded virtual demo employees from 4 active-only workers to 4 active workers plus 8 former workers.
- Active workers now have attendance history starting in 2025 instead of only 2026.
- Former workers have staggered hire/leave dates and intermittent attendance records through 2025 and into early 2026 where applicable.
- Added richer hourly-rate history across 2025 and 2026 so salary trends have usable historical data.
- Added aliases for the new former-worker demo records.

## 2026-05-30 - Work Package 5: Audit Export and Device Notes

- Added `/api/audit/export` for authenticated CSV export of recent audit logs.
- Added an export button to the developer audit log page.
- Updated device-note buttons so unnoted devices use a blue "备注" call-to-action and noted devices use a quieter "修改" button.
- Confirmed existing SQL backups include audit tables because backups dump the full `clockin` schema.

## 2026-05-30 - Work Package 6: Gentle Attendance Refresh

- Added a quiet 30-minute background refresh for the mobile attendance entry page.
- Added a quiet 30-minute background refresh for the desktop attendance entry page.
- Refresh also checks when the page regains focus, returns from browser history, or becomes visible again.
- Refresh is skipped while the user is editing, saving, loading, or has unlocked the current date, so it does not overwrite in-progress changes.
- The refresh updates local attendance data state instead of reloading the whole page, avoiding visible flicker.

## 2026-05-30 - Work Package 7: AI Monthly Salary Summary

- Added `/api/ai/monthly-summary` for authenticated, manual generation of monthly salary summaries through the configured AI provider.
- The summary request sends the selected month, previous month, same month last year, and year-to-date salary aggregates, including employee names, status, hours, wages, and record counts.
- Added an `AI 月度总结` pill to the monthly salary page and displayed the generated summary in a compact in-page card.
- Added clear page copy that clicking the button sends the current monthly salary summary to the configured AI service.
- Saved successful AI monthly summaries into AI chat history and recorded request/success/failure audit events.
- Kept the feature manual-trigger only; no background cron or automatic first-day generation was added.

## 2026-05-30 - Work Package 8: Salary Privacy and AI Name Resolution

- Added default-hidden salary privacy toggles to the monthly salary page and payslip page.
- The monthly salary privacy toggle hides total wages, employee wages, and hourly-rate hints by default; one eye button reveals all sensitive salary values for the current page.
- The payslip privacy toggle hides rate segments, segment wages, and total wage by default.
- Replaced salary-rate suffixes from `/h` to `/小时` on salary UI surfaces.
- Updated AI employee matching to use aliases/nicknames when resolving employees.
- Updated AI employee matching to prefer active employees for ambiguous same-name questions unless the user explicitly asks for former/left employees.
- When a name or alias still matches multiple employees, the AI now asks the user to choose from candidates with status, position, aliases, and hire-date context instead of guessing.

## 2026-05-30 - Work Package 9: Attendance Edit Header and Batch Holiday Dropdown

- Changed mobile attendance edit mode to show `修改工时` instead of the selected date in the action bar, avoiding squeezed date text during edits.
- Changed desktop attendance edit mode to show `修改工时` in the main heading instead of the full selected date.
- Kept `全体放假` inside the status dropdown as requested.
- Made the `全体放假` dropdown action more visually distinct with a divider and green batch-action styling on mobile and desktop.

## 2026-05-30 - Work Package 10: Visible Invite Login Settings

- Added a developer settings entry for `邀请体验`.
- Added `/settings/developer/invite` with a visible invite-login switch, editable invite code, and target admin phone field.
- Login now reads invite-login settings from `tenant_config`, with existing environment variables retained as fallback.
- Added lazy `tenant_config` fields for invite login: enabled flag, invite code, and target phone.
- Invite login still shows only the invite-code form when enabled, preserving the low-friction demo flow.

## 2026-05-30 - Work Package 11: Schedule Calendar Overrides

- Added `/settings/schedule-calendar`, a month calendar for adjusting individual days as factory holidays, adjusted workdays, or default schedule days.
- Added a settings-page entry for the schedule calendar under attendance rules.
- Added a jump button from the holiday reminder banner to the matching schedule-calendar month.
- Built-in China holidays now appear on the calendar by default, while user overrides are stored in the existing `holidays` table.
- Salary calculations now distinguish legal holidays from factory holidays: factory holidays can mark a day off without applying legal-holiday wage multipliers.
- Adjusted workdays now feed both attendance schedule logic and salary workday logic.
- Added virtual-database support for schedule-calendar overrides so demo mode behaves the same way without a real database.

## 2026-05-30 - Work Package 12: Salary List Visual Cleanup

- Changed monthly salary and payslip pages to show salary values by default instead of masking them with dot placeholders.
- Replaced hidden salary placeholders with `已隐藏` when the user manually hides salary values.
- Shortened the salary amount area on monthly salary employee cards and changed it from a long blue bar to a quieter light pill.
- Simplified monthly salary employee subtitles to show only hourly rate, removing crowded day/hour/multiplication text.
- Simplified the monthly salary summary hint to show average hourly rate instead of the full total-hours multiplication formula.

## 2026-05-30 - Work Package 13: Attendance Edit Bar Cleanup

- Removed the extra `修改工时` label from the mobile attendance edit action bar.
- Gave the mobile `修改` and `保存` action buttons fixed minimum widths with no wrapping, preventing the two-character `修改` label from breaking into two lines.
- Kept the desktop attendance heading on the selected date while editing instead of replacing it with `修改工时`.

## 2026-05-30 - Work Package 14: Salary and Schedule Copy Reduction

- Removed the monthly salary summary helper sentence under the AI monthly summary button.
- Removed the average hourly-rate helper line from the monthly salary summary card.
- Reworked the total salary summary so the `总工资` label sits outside the value pill, matching the left-side `总工时` structure.
- Removed explanatory helper copy from the schedule-calendar page.
- Simplified schedule-calendar day labels to only show `班` or `休` for built-in and manually adjusted days.
- Marked the current holiday notice as dismissed when the user opens the schedule calendar from the reminder banner, matching the close-button behavior.

## 2026-05-30 - Work Package 15: Visible Invite Login Entry

- Added a visible `邀请体验` card on the main settings page under smart/reminder settings.
- The invite-login settings page is now reachable by any logged-in user instead of being hidden behind developer unlock.
- The invite-login settings page now returns to the main settings page by default.
- Kept the existing developer-options link for continuity, but removed the hidden-entry requirement for demo setup.
