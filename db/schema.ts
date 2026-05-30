import {
  pgSchema, serial, text, integer, numeric, date,
  boolean, timestamp, unique, jsonb,
} from 'drizzle-orm/pg-core';

export const clockinSchema = pgSchema('clockin');

export const workStatusTypes = clockinSchema.table('work_status_types', {
  id:        serial('id').primaryKey(),
  label:     text('label').notNull(),
  isPaid:    boolean('is_paid').notNull().default(false),
  isDefault: boolean('is_default').notNull().default(false),
});

export const positions = clockinSchema.table('positions', {
  id:                serial('id').primaryKey(),
  name:              text('name').notNull(),
  defaultHourlyRate: numeric('default_hourly_rate', { precision: 10, scale: 2 }),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const employees = clockinSchema.table('employees', {
  id:               serial('id').primaryKey(),
  name:             text('name').notNull(),
  gender:           text('gender').default('unknown'),
  phone:            text('phone'),
  idCard:           text('id_card'),
  positionId:       integer('position_id').references(() => positions.id),
  status:           text('status').default('active'),      // active | inactive
  hireDate:         date('hire_date').notNull(),
  leaveDate:        date('leave_date'),
  currentHourlyRate: numeric('current_hourly_rate', { precision: 10, scale: 2 }),
  notes:            text('notes'),
  isDemo:           boolean('is_demo').notNull().default(false),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const employeeAliases = clockinSchema.table('employee_aliases', {
  id:         serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  alias:      text('alias').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
}, t => [unique('employee_aliases_employee_alias').on(t.employeeId, t.alias)]);

export const hourlyRateHistory = clockinSchema.table('hourly_rate_history', {
  id:            serial('id').primaryKey(),
  employeeId:    integer('employee_id').references(() => employees.id),
  rate:          numeric('rate', { precision: 10, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
  notes:         text('notes'),
  isDemo:        boolean('is_demo').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const attendanceRecords = clockinSchema.table('attendance_records', {
  id:          serial('id').primaryKey(),
  employeeId:  integer('employee_id').references(() => employees.id),
  workDate:    date('work_date').notNull(),
  hours:       numeric('hours', { precision: 5, scale: 1 }),
  status:      text('status').default('worked'), // worked|leave|holiday|sick|absent|custom
  statusLabel: text('status_label'),
  note:        text('note'),
  isLocked:    boolean('is_locked').notNull().default(false),
  isDemo:      boolean('is_demo').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, t => [unique('attendance_employee_date').on(t.employeeId, t.workDate)]);

export const holidays = clockinSchema.table('holidays', {
  id:        serial('id').primaryKey(),
  date:      date('date').notNull().unique(),
  name:      text('name').notNull(),
  type:      text('type').default('legal'),   // legal | custom
  isPaid:    boolean('is_paid').default(true),
  isDemo:    boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const aiChatLogs = clockinSchema.table('ai_chat_logs', {
  id:             serial('id').primaryKey(),
  userId:         text('user_id'),
  userPhone:      text('user_phone'),
  userMessage:    text('user_message').notNull(),
  assistantReply: text('assistant_reply').notNull(),
  mode:           text('mode').notNull(), // ai | rules
  pageUrl:        text('page_url'),
  actions:        jsonb('actions').$type<Array<{ type: string; label: string; href: string }>>(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Tenant / Auth ----

export type WorkScheduleConfig =
  | { type: 'single';   restDays: number[] }
  | { type: 'double';   restDays: number[] }
  | { type: 'biweekly';
      bigWeekRestDays:   number[];
      smallWeekRestDays: number[];
      anchorDate:        string;          // 'YYYY-MM-DD' (Monday of anchor week)
      anchorIsBigWeek:   boolean; };

export const tenantConfig = clockinSchema.table('tenant_config', {
  id:                             integer('id').primaryKey().default(1),
  factoryShortName:               text('factory_short_name'),
  logoBase64:                     text('logo_base64'),
  workSchedule:                   jsonb('work_schedule').$type<WorkScheduleConfig>(),
  weatherProvider:                text('weather_provider'),         // 'qweather' | null
  weatherEncryptedKey:            text('weather_encrypted_key'),    // encrypted with SESSION_SECRET
  weatherLocationId:              text('weather_location_id'),
  weatherCity:                    text('weather_city'),
  weatherApiHost:                 text('weather_api_host'),             // overrides default devapi.qweather.com
  weatherEnabled:                 boolean('weather_enabled').default(true).notNull(),
  workStartTime:                  text('work_start_time'),
  workEndTime:                    text('work_end_time'),
  lunchStartTime:                 text('lunch_start_time'),
  lunchEndTime:                   text('lunch_end_time'),
  salaryPayDay:                   integer('salary_pay_day').default(15).notNull(),
  overtimeStandardHours:          numeric('overtime_standard_hours',          { precision: 4, scale: 1 }).default('8.0').notNull(),
  overtimeWeekdayMultiplier:      numeric('overtime_weekday_multiplier',       { precision: 3, scale: 2 }).default('1.00').notNull(),
  overtimeWeekdayOvertimeMultiplier: numeric('overtime_weekday_overtime_multiplier', { precision: 3, scale: 2 }).default('1.00').notNull(),
  overtimeWeekendMultiplier:      numeric('overtime_weekend_multiplier',       { precision: 3, scale: 2 }).default('1.00').notNull(),
  overtimeLegalHolidayMultiplier: numeric('overtime_legal_holiday_multiplier', { precision: 3, scale: 2 }).default('1.00').notNull(),
  developerMode:                  boolean('developer_mode').default(false).notNull(),
  demoMode:                       boolean('demo_mode').default(false).notNull(),
  inviteLoginEnabled:             boolean('invite_login_enabled').default(false).notNull(),
  inviteCode:                     text('invite_code'),
  inviteLoginPhone:               text('invite_login_phone'),
  setupCompletedAt:               timestamp('setup_completed_at', { withTimezone: true }),
  updatedAt:                      timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const adminUsers = clockinSchema.table('admin_users', {
  id:           serial('id').primaryKey(),
  phone:        text('phone').notNull().unique(),     // 11 digits, app-level validated
  passwordHash: text('password_hash').notNull(),       // scrypt:salt:hash
  role:         text('role').default('admin').notNull(),
  createdAt:    timestamp('created_at',  { withTimezone: true }).defaultNow(),
  lastLoginAt:  timestamp('last_login_at', { withTimezone: true }),
});

export const loginAttempts = clockinSchema.table('login_attempts', {
  id:                serial('id').primaryKey(),
  ipAddress:         text('ip_address'),
  deviceId:          text('device_id'),
  fingerprintHash:   text('fingerprint_hash'),
  usernameAttempted: text('username_attempted'),
  attemptType:       text('attempt_type').notNull(),   // 'login' | 'developer'
  success:           boolean('success').notNull(),
  attemptedAt:       timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const backupConfig = clockinSchema.table('backup_config', {
  id:                        integer('id').primaryKey().default(1),
  s3Enabled:                 boolean('s3_enabled').default(false).notNull(),
  s3Endpoint:                text('s3_endpoint'),
  s3Region:                  text('s3_region'),
  s3Bucket:                  text('s3_bucket'),
  s3Prefix:                  text('s3_prefix'),
  s3ForcePathStyle:          boolean('s3_force_path_style').default(true).notNull(),
  s3EncryptedAccessKeyId:    text('s3_encrypted_access_key_id'),
  s3EncryptedSecretAccessKey: text('s3_encrypted_secret_access_key'),
  updatedAt:                 timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const backupRuns = clockinSchema.table('backup_runs', {
  id:         serial('id').primaryKey(),
  provider:   text('provider').notNull(), // local | s3 | webdav
  kind:       text('kind').notNull(),     // manual | scheduled
  status:     text('status').notNull(),   // success | failed
  fileName:   text('file_name'),
  location:   text('location'),
  sizeBytes:  integer('size_bytes'),
  error:      text('error'),
  startedAt:  timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

// ---- Types ----
export type Employee       = typeof employees.$inferSelect;
export type NewEmployee    = typeof employees.$inferInsert;
export type EmployeeAlias  = typeof employeeAliases.$inferSelect;
export type Position       = typeof positions.$inferSelect;
export type AttendanceRecord    = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;
export type HourlyRateHistory   = typeof hourlyRateHistory.$inferSelect;
export type Holiday             = typeof holidays.$inferSelect;
export type AIChatLog           = typeof aiChatLogs.$inferSelect;
export type TenantConfig    = typeof tenantConfig.$inferSelect;
export type NewTenantConfig = typeof tenantConfig.$inferInsert;
export type AdminUser       = typeof adminUsers.$inferSelect;
export type NewAdminUser    = typeof adminUsers.$inferInsert;
export type LoginAttempt    = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
export type BackupConfig    = typeof backupConfig.$inferSelect;
export type NewBackupConfig = typeof backupConfig.$inferInsert;
export type BackupRun       = typeof backupRuns.$inferSelect;
export type NewBackupRun    = typeof backupRuns.$inferInsert;
