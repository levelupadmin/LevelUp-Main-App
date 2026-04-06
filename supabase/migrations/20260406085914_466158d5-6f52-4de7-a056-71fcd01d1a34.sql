ALTER TABLE enrolments DROP CONSTRAINT enrolments_source_check;
ALTER TABLE enrolments ADD CONSTRAINT enrolments_source_check 
  CHECK (source IN ('checkout', 'admin_grant', 'admin_manual', 'bulk_import', 'migration', 'manual', 'import', 'free'));