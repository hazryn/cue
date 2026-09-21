import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

// Ten sam porządek co w aplikacji: .env.local nadpisuje .env
loadEnv({ path: join(__dirname, '..', '..', '.env.local') });
loadEnv({ path: join(__dirname, '..', '..', '.env') });

/** Używane wyłącznie przez CLI TypeORM (generowanie i uruchamianie migracji). */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 7202),
  username: process.env.DB_USER ?? 'cue',
  password: process.env.DB_PASSWORD ?? 'cue',
  database: process.env.DB_NAME ?? 'cue',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
});
