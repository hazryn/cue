import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { BuzzerModule } from './buzzer/buzzer.module';
import { CatalogModule } from './catalog/catalog.module';
import configuration, { AppConfig } from './config/configuration';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';

/** Produkcyjnie jeden kontener serwuje API, WebSocket i statyki — mniej ruchomych części. */
const FRONTEND_DIST = join(__dirname, '..', '..', 'frontend', 'dist');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Pierwszy plik z listy wygrywa: .env.local nadpisuje domyślne wartości z .env
      envFilePath: ['.env.local', '.env', '../.env.local', '../.env'],
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<AppConfig['db']>('db')!;
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          // Schemat zmienia wyłącznie migracja — nigdy automatyczna synchronizacja.
          synchronize: false,
          migrationsRun: true,
          migrations: [join(__dirname, 'migrations', '*.js')],
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ...(existsSync(FRONTEND_DIST)
      ? [
          ServeStaticModule.forRoot({
            rootPath: FRONTEND_DIST,
            exclude: ['/api/{*path}', '/socket.io/{*path}'],
          }),
        ]
      : []),
    AuthModule,
    CatalogModule,
    BuzzerModule,
    RealtimeModule,
    GameModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
