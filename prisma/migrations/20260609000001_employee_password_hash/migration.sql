-- Add password_hash column to employee.
-- Nullable so existing accounts (created before this migration) are not broken;
-- the application layer rejects login for accounts with no password hash and
-- prompts an administrator to reset the password.
ALTER TABLE employee ADD COLUMN password_hash VARCHAR(255);
