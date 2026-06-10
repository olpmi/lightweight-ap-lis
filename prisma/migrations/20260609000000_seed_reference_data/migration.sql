-- Seed static reference / lookup data.
-- Uses ON CONFLICT DO NOTHING so this is safe to re-run (idempotent).
-- Runs automatically on every `prisma migrate deploy` call (backend startup).

-- ─── Employee roles ───────────────────────────────────────────────────────────
INSERT INTO employee_role (role_name) VALUES
  ('Pathologist'),
  ('Technologist')
ON CONFLICT (role_name) DO NOTHING;

-- ─── Specimen types ───────────────────────────────────────────────────────────
INSERT INTO specimen_type (specimen_type_name, description) VALUES
  ('Biopsy',                'Small tissue biopsy'),
  ('Excision',              'Surgical excision specimen'),
  ('Resection',             'Large surgical resection'),
  ('Cytology',              'Cytological specimen'),
  ('Core needle biopsy',    'Core needle biopsy'),
  ('Fine needle aspiration','FNA specimen'),
  ('Curettage',             'Curettage specimen'),
  ('Polypectomy',           'Polyp removal'),
  ('Amputation',            'Amputation specimen'),
  ('Bone marrow biopsy',    'Bone marrow trephine biopsy')
ON CONFLICT (specimen_type_name) DO NOTHING;

-- ─── Body sites ───────────────────────────────────────────────────────────────
INSERT INTO body_site (body_site_name) VALUES
  -- Gastrointestinal (GI)
  ('Esophagus'), ('Stomach'), ('Duodenum'), ('Small bowel (jejunum/ileum)'),
  ('Colon'), ('Rectum'), ('Appendix'), ('Anus'),
  -- Hepatobiliary & Pancreas
  ('Liver'), ('Gallbladder'), ('Bile duct'), ('Pancreas'),
  -- Breast
  ('Left Breast'), ('Right Breast'), ('Breast'),
  ('Left Axillary tissue'), ('Right Axillary tissue'), ('Axillary tissue'),
  -- Gynecologic
  ('Cervix'), ('Endometrium'), ('Myometrium'),
  ('Left Ovary'), ('Right Ovary'), ('Ovary'),
  ('Left Fallopian tube'), ('Right Fallopian tube'), ('Fallopian tube'),
  ('Vulva'), ('Vagina'),
  -- Urologic (GU)
  ('Prostate'), ('Bladder'),
  ('Left Kidney'), ('Right Kidney'), ('Kidney'),
  ('Left Ureter'), ('Right Ureter'), ('Ureter'),
  ('Left Testis'), ('Right Testis'), ('Testis'),
  ('Left Epididymis'), ('Right Epididymis'), ('Epididymis'),
  ('Penis'),
  -- Head & Neck
  ('Oral cavity'), ('Tongue'),
  ('Left Salivary gland'), ('Right Salivary gland'), ('Salivary gland'),
  ('Thyroid'), ('Parathyroid'),
  ('Larynx'), ('Pharynx'), ('Nasal cavity / Sinus'), ('Neck (soft tissue/unspecified)'),
  -- Respiratory
  ('Left Lung'), ('Right Lung'), ('Lung'),
  ('Left Pleura'), ('Right Pleura'), ('Pleura'),
  ('Left Bronchus'), ('Right Bronchus'), ('Bronchus'),
  -- Skin
  ('Skin'),
  -- Lymph Node / Hematolymphoid
  ('Lymph node'), ('Spleen'), ('Bone marrow'),
  -- Bone & Soft Tissue
  ('Bone'), ('Soft tissue'),
  -- CNS
  ('Brain'), ('Spinal cord'), ('Meninges'),
  -- Placenta / POC
  ('Placenta'), ('Products of conception'),
  -- Cytology
  ('GYN Cytology (Pap smears)'), ('Urine Cytology'), ('CSF (Cerebrospinal fluid)'),
  -- Fluid Cytology
  ('Pleural fluid'), ('Ascitic fluid'), ('Pericardial fluid'),
  -- Respiratory cytology
  ('Sputum'), ('Bronchial wash'), ('Bronchial brush'), ('BAL (bronchoalveolar lavage)'),
  -- Other
  ('Synovial fluid'), ('Cyst fluid'), ('Other')
ON CONFLICT (body_site_name) DO NOTHING;

-- ─── Ancillary orderables ─────────────────────────────────────────────────────
-- category values must match the AncillaryCategory enum values in the DB.
INSERT INTO ancillary_orderable (name, category, sort_order) VALUES
  -- H&E Levels
  ('H&E Levels',                       'HE_LEVELS',    0),
  -- Special Stains
  ('Periodic Acid Schiff (PAS)',        'SPECIAL_STAIN', 0),
  ('Grocott (GMS)',                     'SPECIAL_STAIN', 1),
  ('Ziehl-Neelsen (ZN)',               'SPECIAL_STAIN', 2),
  ('Silver stain',                      'SPECIAL_STAIN', 3),
  ('Reticulin',                         'SPECIAL_STAIN', 4),
  -- IHC
  ('ER',                                'IHC',  0),
  ('PR',                                'IHC',  1),
  ('HER2',                              'IHC',  2),
  ('Ki67',                              'IHC',  3),
  ('CD20',                              'IHC',  4),
  ('CD3',                               'IHC',  5),
  ('CD10',                              'IHC',  6),
  ('BCL6',                              'IHC',  7),
  ('MUM1',                              'IHC',  8),
  ('BCL2',                              'IHC',  9),
  ('Cyclin D1',                         'IHC', 10),
  ('CD30',                              'IHC', 11),
  ('CD15',                              'IHC', 12),
  ('Pax5',                              'IHC', 13),
  ('CD117',                             'IHC', 14),
  ('DOG1',                              'IHC', 15),
  ('MLH1',                              'IHC', 16),
  ('PMS2',                              'IHC', 17),
  ('MSH2',                              'IHC', 18),
  ('MSH6',                              'IHC', 19),
  ('Synaptophysin',                     'IHC', 20),
  ('Chromogranin',                      'IHC', 21),
  ('p16',                               'IHC', 22),
  ('Desmin',                            'IHC', 23),
  ('Myogenin',                          'IHC', 24),
  ('S100',                              'IHC', 25),
  ('CD99',                              'IHC', 26),
  -- Molecular
  ('22C3 (PD-L1)',                      'MOLECULAR', 0),
  ('SP263 (PD-L1)',                     'MOLECULAR', 1),
  ('EGFR',                              'MOLECULAR', 2),
  ('Gene Fusion Panel',                 'MOLECULAR', 3),
  ('MSI (Microsatellite Instability)',  'MOLECULAR', 4),
  ('KRAS',                              'MOLECULAR', 5),
  ('NRAS',                              'MOLECULAR', 6),
  ('BRAF',                              'MOLECULAR', 7),
  -- Send-out
  ('Histology Review',                  'SEND_OUT', 0),
  ('Histology & IHC Review',            'SEND_OUT', 1),
  ('Molecular Send-out',                'SEND_OUT', 2)
ON CONFLICT (name, category) DO NOTHING;

-- ─── Ancillary panels ─────────────────────────────────────────────────────────
INSERT INTO ancillary_panel (name, category, sort_order) VALUES
  -- IHC panels
  ('Breast Panel',              'IHC',      0),
  ('Lymphoma Starter Panel',    'IHC',      1),
  ('Lymphoma Extended Panel',   'IHC',      2),
  ('GIST Panel',                'IHC',      3),
  ('MMR Panel',                 'IHC',      4),
  ('Gastric Panel',             'IHC',      5),
  ('Neuroendocrine Panel',      'IHC',      6),
  ('Head & Neck Panel',         'IHC',      7),
  ('Soft Tissue Core Panel',    'IHC',      8),
  -- Molecular panels
  ('PDL1 Panel',                'MOLECULAR', 0),
  ('Lung Panel',                'MOLECULAR', 1),
  ('Colorectal Panel',          'MOLECULAR', 2)
ON CONFLICT (name, category) DO NOTHING;

-- ─── Ancillary panel items ────────────────────────────────────────────────────
-- Resolve panel and orderable IDs by name; ON CONFLICT DO NOTHING is idempotent.
INSERT INTO ancillary_panel_item (panel_id, orderable_id)
SELECT p.id, o.id FROM ancillary_panel p, ancillary_orderable o
WHERE (p.name = 'Breast Panel'           AND p.category = 'IHC'       AND o.name IN ('ER','PR','HER2','Ki67')                                           AND o.category = 'IHC')
   OR (p.name = 'Lymphoma Starter Panel' AND p.category = 'IHC'       AND o.name IN ('CD20','CD3','Ki67')                                               AND o.category = 'IHC')
   OR (p.name = 'Lymphoma Extended Panel'AND p.category = 'IHC'       AND o.name IN ('CD10','BCL6','MUM1','BCL2','Cyclin D1','CD30','CD15','Pax5')       AND o.category = 'IHC')
   OR (p.name = 'GIST Panel'             AND p.category = 'IHC'       AND o.name IN ('CD117','DOG1')                                                    AND o.category = 'IHC')
   OR (p.name = 'MMR Panel'              AND p.category = 'IHC'       AND o.name IN ('MLH1','PMS2','MSH2','MSH6')                                        AND o.category = 'IHC')
   OR (p.name = 'Gastric Panel'          AND p.category = 'IHC'       AND o.name IN ('HER2')                                                            AND o.category = 'IHC')
   OR (p.name = 'Neuroendocrine Panel'   AND p.category = 'IHC'       AND o.name IN ('Synaptophysin','Chromogranin','Ki67')                              AND o.category = 'IHC')
   OR (p.name = 'Head & Neck Panel'      AND p.category = 'IHC'       AND o.name IN ('p16')                                                             AND o.category = 'IHC')
   OR (p.name = 'Soft Tissue Core Panel' AND p.category = 'IHC'       AND o.name IN ('Desmin','Myogenin','S100','CD99')                                  AND o.category = 'IHC')
   OR (p.name = 'PDL1 Panel'             AND p.category = 'MOLECULAR' AND o.name IN ('22C3 (PD-L1)','SP263 (PD-L1)')                                     AND o.category = 'MOLECULAR')
   OR (p.name = 'Lung Panel'             AND p.category = 'MOLECULAR' AND o.name IN ('EGFR','Gene Fusion Panel')                                         AND o.category = 'MOLECULAR')
   OR (p.name = 'Colorectal Panel'       AND p.category = 'MOLECULAR' AND o.name IN ('MSI (Microsatellite Instability)','KRAS','NRAS','BRAF')             AND o.category = 'MOLECULAR')
ON CONFLICT (panel_id, orderable_id) DO NOTHING;
