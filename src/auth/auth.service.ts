import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import { isFacultyId } from '../common/constants/faculties';
import { openSession, sealSession } from './utils/session-cipher';
import { Student, studentFromEmail } from './utils/student';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 1024;

interface SessionPayload {
  sub?: unknown;
  faculty?: unknown;
  exp?: unknown;
}

@Injectable()
export class AuthService {
  private readonly clientId = process.env.GOOGLE_CLIENT_ID || null;
  private readonly emailDomain =
    process.env.ALLOWED_EMAIL_DOMAIN || 'kmitl.ac.th';
  private readonly google = new OAuth2Client();

  private readonly secret =
    process.env.SESSION_SECRET || randomBytes(32).toString('hex');

  constructor() {
    if (this.clientId && !process.env.SESSION_SECRET) {
      throw new Error(
        'SESSION_SECRET is required when GOOGLE_CLIENT_ID is set',
      );
    }
  }

  get required(): boolean {
    return this.clientId !== null;
  }

  async signInWithGoogle(credential: string) {
    if (!this.clientId) {
      throw new ServiceUnavailableException('google_login_disabled');
    }
    const email = await this.verifiedEmail(credential, this.clientId);
    const lookup = studentFromEmail(email, this.emailDomain);
    if (!lookup.ok) throw new ForbiddenException(lookup.error);
    return this.issueSession(lookup.student);
  }

  issueSession(student: Student, now = Date.now()) {
    const token = sealSession(
      {
        sub: student.studentId,
        faculty: student.faculty,
        exp: now + SESSION_TTL_MS,
      },
      this.secret,
    );
    return { token };
  }

  verifySession(token: unknown, now = Date.now()): Student | null {
    if (
      typeof token !== 'string' ||
      !token ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      return null;
    }
    const payload = openSession(token, this.secret) as SessionPayload | null;
    return payload &&
      typeof payload.sub === 'string' &&
      typeof payload.exp === 'number' &&
      payload.exp > now &&
      isFacultyId(payload.faculty)
      ? { studentId: payload.sub, faculty: payload.faculty }
      : null;
  }

  private async verifiedEmail(
    credential: string,
    audience: string,
  ): Promise<string> {
    try {
      const ticket = await this.google.verifyIdToken({
        idToken: credential,
        audience,
      });
      const payload = ticket.getPayload();
      if (payload?.email && payload.email_verified) return payload.email;
    } catch {
      throw new UnauthorizedException('invalid_credential');
    }
    throw new UnauthorizedException('email_not_verified');
  }
}
