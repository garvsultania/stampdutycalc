export { connect, migrate, type Db, type DbSession } from "./db.js";
export {
  STORE_MIGRATIONS,
  STORE_SCHEMA_VERSION,
  getMigrationState,
  migrationChecksum,
  runMigrations,
  type MigrationState,
  type StoreMigration,
} from "./migrations.js";
export { SCHEMA_SQL } from "./schema.js";
export {
  MemoryDatabaseBackupProvider,
  createDatabaseBackup,
  getDatabaseBackupProvider,
  installDatabaseBackupProvider,
  isProductionDatabaseBackupProviderConfigured,
  productionDatabaseBackupReady,
  recordDatabaseRestoreDrill,
  restoreDatabaseBackup,
  type DatabaseBackupManifest,
  type DatabaseBackupProvider,
  type DatabaseBackupReceipt,
  type DatabaseRestoreReport,
} from "./database-backup.js";
export {
  Store,
  FirmMembershipError,
  MatterScopeError,
  type Firm,
  type FirmUser,
  type Matter,
  type ExtractionJobRecord,
  type ExtractionJobStatus,
  type ExtractionFailureCode,
  type StoreReadiness,
  type AuditRecord,
  type SnapshotArchiveRecord,
  type RecordComputationArgs,
} from "./repository.js";
