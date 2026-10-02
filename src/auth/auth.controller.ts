import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

const MAX_CREDENTIAL_LENGTH = 4096;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  google(@Body() body: Record<string, unknown> | undefined) {
    const credential = body?.credential;
    if (
      typeof credential !== 'string' ||
      !credential ||
      credential.length > MAX_CREDENTIAL_LENGTH
    ) {
      throw new BadRequestException('invalid_credential');
    }
    return this.auth.signInWithGoogle(credential);
  }
}
