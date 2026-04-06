ALTER TABLE courses ADD COLUMN primary_offering_id uuid REFERENCES offerings(id) ON DELETE SET NULL;
CREATE INDEX idx_courses_primary_offering ON courses(primary_offering_id);