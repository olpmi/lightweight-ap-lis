import { describe, it, expect } from 'vitest';
import {
  importDoctorRowSchema,
  importPatientRowSchema,
  importStaffRowSchema,
} from '@lis/shared';

const patientRow = (over: Partial<Record<string, string>> = {}) => ({
  patient_id: '',
  last_name: 'Mwangi',
  first_name: 'Grace',
  date_of_birth: '1984-03-17',
  sex: 'Female',
  ...over,
});

const staffRow = (over: Partial<Record<string, string>> = {}) => ({
  user_name: 'gmwangi',
  last_name: 'Mwangi',
  first_name: 'Grace',
  role: 'Pathologist',
  default_language: '',
  password: '',
  ...over,
});

describe('importPatientRowSchema — sex', () => {
  it.each([
    ['M', 'Male'],
    ['male', 'Male'],
    ['f', 'Female'],
    ['Female', 'Female'],
    ['o', 'Other'],
    ['unknown', 'Unknown'],
    ['', 'Unknown'],
  ])('maps %s to %s', (input, expected) => {
    const parsed = importPatientRowSchema.parse(patientRow({ sex: input }));
    expect(parsed.sex).toBe(expected);
  });

  it('rejects an unrecognized value and names the accepted ones', () => {
    const result = importPatientRowSchema.safeParse(patientRow({ sex: 'X' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/Male, Female, Other, Unknown/);
    }
  });
});

describe('importPatientRowSchema — date_of_birth', () => {
  it('accepts a real leap day', () => {
    expect(importPatientRowSchema.parse(patientRow({ date_of_birth: '2024-02-29' })).date_of_birth)
      .toBe('2024-02-29');
  });

  it.each(['2023-02-29', '2024-13-01', '2024-00-10', '2024-02-30'])(
    'rejects the non-calendar date %s',
    (value) => {
      expect(importPatientRowSchema.safeParse(patientRow({ date_of_birth: value })).success).toBe(
        false,
      );
    },
  );

  it('rejects an ambiguous slash format rather than guessing day/month order', () => {
    const result = importPatientRowSchema.safeParse(patientRow({ date_of_birth: '05/01/2001' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/YYYY-MM-DD/);
    }
  });

  it('rejects a future date and a date before 1900', () => {
    expect(importPatientRowSchema.safeParse(patientRow({ date_of_birth: '2999-01-01' })).success)
      .toBe(false);
    expect(importPatientRowSchema.safeParse(patientRow({ date_of_birth: '1899-12-31' })).success)
      .toBe(false);
  });
});

describe('importPatientRowSchema — names and identifier', () => {
  it('trims and collapses internal whitespace', () => {
    const parsed = importPatientRowSchema.parse(
      patientRow({ first_name: '  Grace   Mary ', last_name: ' Mwangi ' }),
    );
    expect(parsed.first_name).toBe('Grace Mary');
    expect(parsed.last_name).toBe('Mwangi');
  });

  it('rejects a blank required name', () => {
    expect(importPatientRowSchema.safeParse(patientRow({ last_name: '   ' })).success).toBe(false);
  });

  it('rejects a name over 100 characters', () => {
    expect(importPatientRowSchema.safeParse(patientRow({ last_name: 'x'.repeat(101) })).success)
      .toBe(false);
  });

  it('accepts a blank patient_id, meaning "allocate one"', () => {
    expect(importPatientRowSchema.parse(patientRow({ patient_id: '' })).patient_id).toBe('');
  });

  it('rejects a patient_id over 50 characters', () => {
    expect(importPatientRowSchema.safeParse(patientRow({ patient_id: 'x'.repeat(51) })).success)
      .toBe(false);
  });
});

describe('importDoctorRowSchema', () => {
  it('requires both names', () => {
    expect(importDoctorRowSchema.safeParse({ last_name: 'Achieng', first_name: '' }).success).toBe(
      false,
    );
  });
});

describe('importStaffRowSchema', () => {
  it('rejects a user_name with characters the login form would not allow', () => {
    expect(importStaffRowSchema.safeParse(staffRow({ user_name: 'grace mwangi' })).success).toBe(
      false,
    );
    expect(importStaffRowSchema.safeParse(staffRow({ user_name: 'grace@lab' })).success).toBe(false);
  });

  it('defaults a blank language to en and accepts a supported one', () => {
    expect(importStaffRowSchema.parse(staffRow()).default_language).toBe('en');
    expect(importStaffRowSchema.parse(staffRow({ default_language: 'sw' })).default_language).toBe(
      'sw',
    );
  });

  it('rejects an unsupported language', () => {
    expect(importStaffRowSchema.safeParse(staffRow({ default_language: 'de' })).success).toBe(false);
  });

  it('accepts a blank password but rejects one under 8 characters', () => {
    expect(importStaffRowSchema.parse(staffRow({ password: '' })).password).toBe('');
    expect(importStaffRowSchema.safeParse(staffRow({ password: 'short' })).success).toBe(false);
    expect(importStaffRowSchema.parse(staffRow({ password: 'longenough1' })).password).toBe(
      'longenough1',
    );
  });
});
