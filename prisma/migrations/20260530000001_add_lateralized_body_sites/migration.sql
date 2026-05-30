-- Add Left/Right lateralized body site entries for bilateral anatomic organs.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO body_site (body_site_name) VALUES
  ('Left Breast'),
  ('Right Breast'),
  ('Left Axillary tissue'),
  ('Right Axillary tissue'),
  ('Left Ovary'),
  ('Right Ovary'),
  ('Left Fallopian tube'),
  ('Right Fallopian tube'),
  ('Left Kidney'),
  ('Right Kidney'),
  ('Left Ureter'),
  ('Right Ureter'),
  ('Left Testis'),
  ('Right Testis'),
  ('Left Epididymis'),
  ('Right Epididymis'),
  ('Left Salivary gland'),
  ('Right Salivary gland'),
  ('Left Lung'),
  ('Right Lung'),
  ('Left Pleura'),
  ('Right Pleura'),
  ('Left Bronchus'),
  ('Right Bronchus')
ON CONFLICT (body_site_name) DO NOTHING;
