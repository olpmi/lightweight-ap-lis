Table doctor {
  doctor_id bigint [pk, increment]
  last_name varchar(100) [not null]
  first_name varchar(100) [not null]
}

Table patient {
  patient_id varchar(50) [pk]
  last_name varchar(100) [not null]
  first_name varchar(100) [not null]
  date_of_birth date [not null]
  sex varchar(20) [not null]
}

Table employee_role {
  employee_role_id int [pk, increment]
  role_name varchar(30) [not null, unique, note: 'Examples: Pathologist, Technologist']
}

Table employee {
  employee_id bigint [pk, increment]
  last_name varchar(100) [not null]
  first_name varchar(100) [not null]
  user_name varchar(100) [not null, unique]
  employee_role_id int [not null]
  default_language varchar(10) [not null, default: 'en']
}

Table body_site {
  body_site_id int [pk, increment]
  body_site_name varchar(255) [not null, unique]
  description text
}

Table specimen_type {
  specimen_type_id int [pk, increment]
  specimen_type_name varchar(255) [not null, unique]
  description text
}

Table report_template {
  report_template_id int [pk, increment]
  template_name varchar(255) [not null, unique]
  template_text text
  is_active boolean [not null, default: true]
  type varchar(20) [not null, default: 'final', note: 'final|preliminary|addendum|revision']
}

Table order_sequence_year {
  year_two_digit int [not null]
  prefix char(2) [not null]
  last_value int [not null, default: 0]

  indexes {
    (year_two_digit, prefix) [pk]
  }

  Note: 'Concurrency-safe sequence per year+prefix for order ID generation'
}

Table orders {
  order_id char(11) [pk, note: 'Format: SU250000001']
  patient_id varchar(50) [not null]
  doctor_id bigint [not null]
  case_type varchar(50)
  clinical_history text
  registered_date datetime [not null]
  completed_date datetime
  is_reactivated boolean [not null, default: false]
  reactivated_from_report_id bigint

  Note: 'Order ID format: SU + 2-digit year + 7-digit incrementing sequence within year'
}

Table specimen {
  specimen_id varchar(20) [pk, note: 'Format: {order_id}-A, {order_id}-B, ..., {order_id}-AA']
  order_id char(11) [not null]
  specimen_code varchar(10) [not null, note: 'Alphabetic suffix only, e.g. A, B, AA']
  body_site_id int
  specimen_type_id int
  cold_ischemic_time int [note: 'Minutes']

  indexes {
    (order_id, specimen_code) [unique]
  }
}

Table block {
  block_id varchar(30) [pk, note: 'Format: {order_id}-{specimen_code}1']
  specimen_id varchar(20) [not null]
  block_number int [not null, note: '1, 2, 3, ... per specimen']
  created_datetime datetime
  discarded boolean [not null, default: false]

  indexes {
    (specimen_id, block_number) [unique]
  }
}

Table slide {
  slide_id varchar(40) [pk, note: 'Format: {order_id}-{specimen_code}{block_number}-S1']
  block_id varchar(30) [not null]
  slide_number int [not null, note: '1, 2, 3, ... per block']
  slide_type varchar(50) [note: 'Examples: H&E, unstained, IHC, special stain']
  discarded boolean [not null, default: false]

  indexes {
    (block_id, slide_number) [unique]
  }
}

Table report {
  report_id bigint [pk, increment]
  order_id char(11) [not null]
  version_number int [not null, note: 'Incrementing report version per order']
  diagnosis text
  comment text
  report_template_id int
  gross text
  gross_payload text
  synoptic_data text
  synoptic_payload text
  pathologist_employee_id bigint
  created_at datetime [not null]
  signed_out_datetime datetime
  is_final boolean [not null, default: false]
  is_prelim boolean [not null, default: false]
  reactivation_type varchar(20)
  reactivation_reason text
  supersedes_report_id bigint

  indexes {
    (order_id, version_number) [unique]
  }

  Note: 'Multiple reports per order allowed to preserve revision history after re-activation'
}

Table report_file {
  report_file_id bigint [pk, increment]
  report_id bigint [not null]
  file_type varchar(50) [not null, note: 'Examples: rendered_pdf, signed_pdf, amended_pdf']
  file_name varchar(255)
  original_file_name varchar(255)
  mime_type varchar(100) [not null, default: 'application/pdf']
  storage_path varchar(500)
  created_at datetime [not null]

  indexes {
    (report_id, file_type, created_at)
  }
}

Table custom_template {
  id varchar(25) [pk, note: 'cuid()']
  template_key varchar(500) [not null, unique]
  family varchar(100) [not null]
  kind varchar(20) [not null]
  schema_style varchar(20) [not null]
  title varchar(500) [not null]
  core_json json [not null]
  created_at datetime [not null]
  updated_at datetime [not null]
}

Table custom_template_translation {
  id varchar(25) [pk, note: 'cuid()']
  template_key varchar(500) [not null]
  language_code varchar(10) [not null]
  translation_json json [not null]
  created_at datetime [not null]
  updated_at datetime [not null]

  indexes {
    (template_key, language_code) [unique]
  }
}

Table report_layout {
  report_layout_id int [pk, increment]
  report_type varchar(20) [not null, unique, note: 'final|preliminary|addendum|revision']
  name varchar(255) [not null]
  html_template text [not null]
  is_active boolean [not null, default: true]
  created_at datetime [not null]
  updated_at datetime [not null]

  Note: 'PDF report layout template (HTML/Handlebars) for a report type'
}

Enum ancillary_category {
  HE_LEVELS
  IHC
  SPECIAL_STAIN
  MOLECULAR
  SEND_OUT
  HE
}

Enum ancillary_order_status {
  PULL_BLOCK
  MICROTOMY
  SLIDE_STAIN
  DISTRIBUTED
  CANCELLED
  PULL_MATERIAL
  MATERIAL_SENT
  MATERIAL_RETURNED
}

Table ancillary_orderable {
  id int [pk, increment]
  name varchar(200) [not null]
  category ancillary_category [not null]
  is_active boolean [not null, default: true]
  sort_order int [not null, default: 0]

  indexes {
    (name, category) [unique]
  }
}

Table ancillary_panel {
  id int [pk, increment]
  name varchar(200) [not null]
  category ancillary_category [not null]
  is_active boolean [not null, default: true]
  sort_order int [not null, default: 0]

  indexes {
    (name, category) [unique]
  }
}

Table ancillary_panel_item {
  panel_id int [not null]
  orderable_id int [not null]

  indexes {
    (panel_id, orderable_id) [pk]
  }
}

Table ancillary_order {
  id int [pk, increment]
  order_id char(11) [not null]
  block_id varchar(30) [not null]
  orderable_id int [not null]
  status ancillary_order_status [not null, default: 'PULL_BLOCK']
  level_count int
  notes text
  result_notes text
  ordered_at datetime [not null]
  in_progress_at datetime
  completed_at datetime
  cancelled_at datetime
  ordered_by_id bigint
}

Ref: orders.patient_id > patient.patient_id
Ref: orders.doctor_id > doctor.doctor_id
Ref: orders.reactivated_from_report_id > report.report_id

Ref: employee.employee_role_id > employee_role.employee_role_id

Ref: specimen.order_id > orders.order_id
Ref: specimen.body_site_id > body_site.body_site_id
Ref: specimen.specimen_type_id > specimen_type.specimen_type_id

Ref: block.specimen_id > specimen.specimen_id
Ref: slide.block_id > block.block_id

Ref: report.order_id > orders.order_id
Ref: report.report_template_id > report_template.report_template_id
Ref: report.pathologist_employee_id > employee.employee_id
Ref: report.supersedes_report_id > report.report_id

Ref: report_file.report_id > report.report_id

Ref: custom_template_translation.template_key > custom_template.template_key

Ref: ancillary_order.order_id > orders.order_id
Ref: ancillary_order.block_id > block.block_id
Ref: ancillary_order.orderable_id > ancillary_orderable.id
Ref: ancillary_order.ordered_by_id > employee.employee_id

Ref: ancillary_panel_item.panel_id > ancillary_panel.id
Ref: ancillary_panel_item.orderable_id > ancillary_orderable.id