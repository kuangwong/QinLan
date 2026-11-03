-- Three valid 300-character slot entries must produce a saveable name.
-- Widen the existing constraint without rewriting saved history.
ALTER TABLE name_records DROP CONSTRAINT name_records_name_check;
ALTER TABLE name_records ADD CONSTRAINT name_records_name_check
  CHECK (length(name) BETWEEN 1 AND 900);
