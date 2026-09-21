import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Bez limitu hasło „familiada" padnie brute-forcem w kwadrans. */
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('admin')
  login(@Body() dto: LoginDto): { token: string } {
    return this.auth.login(dto.password);
  }
}
