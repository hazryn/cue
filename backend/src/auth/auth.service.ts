import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Porównanie po SHA-256 obu stron: timingSafeEqual wymaga równych długości,
   * a hash to załatwia bez ujawniania długości hasła.
   */
  private matches(password: string): boolean {
    const expected = createHash('sha256').update(this.config.get<string>('adminPassword') ?? '').digest();
    const given = createHash('sha256').update(password ?? '').digest();
    return timingSafeEqual(expected, given);
  }

  login(password: string): { token: string } {
    if (!this.matches(password)) throw new UnauthorizedException('Błędne hasło');
    const token = this.jwt.sign({ role: 'admin', jti: randomUUID() }, { expiresIn: '24h' });
    return { token };
  }

  /** Weryfikacja używana zarówno przez HTTP guard, jak i handshake WebSocketu. */
  verify(token: string | undefined): boolean {
    if (!token) return false;
    try {
      return this.jwt.verify<{ role?: string }>(token).role === 'admin';
    } catch {
      return false;
    }
  }
}
