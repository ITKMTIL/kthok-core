import { FacultyId } from '../../common/constants/faculties';

const FACULTY_BY_CODE: Record<string, FacultyId> = {
  '01': 'engineering',
  '02': 'architecture',
  '03': 'industrial-education',
  '04': 'agricultural-technology',
  '05': 'science',
  '06': 'food-industry',
  '07': 'information-technology',
  '10': 'business',
  '11': 'materials-innovation',
  '12': 'advanced-manufacturing',
  '13': 'aviation',
  '14': 'liberal-arts',
  '15': 'medicine',
  '16': 'music-engineering',
  '17': 'dentistry',
};

const STUDENT_ID = /^\d{2}(\d{2})\d{4}$/;

export interface Student {
  studentId: string;
  faculty: FacultyId;
}

export type StudentLookup =
  | { ok: true; student: Student }
  | { ok: false; error: 'not_student_email' | 'unknown_faculty' };

export function studentFromEmail(email: string, domain: string): StudentLookup {
  const [local, host, ...rest] = email.trim().toLowerCase().split('@');
  const match = STUDENT_ID.exec(local);
  if (rest.length > 0 || host !== domain || !match) {
    return { ok: false, error: 'not_student_email' };
  }
  const faculty = FACULTY_BY_CODE[match[1]];
  if (!faculty) return { ok: false, error: 'unknown_faculty' };
  return { ok: true, student: { studentId: local, faculty } };
}
