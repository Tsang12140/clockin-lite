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
