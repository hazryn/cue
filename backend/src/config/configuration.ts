export interface AppConfig {
  nodeEnv: string;
  port: number;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  adminPassword: string;
  adminTokenSecret: string;
  publicUrl: string;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '7200', 10),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '7202', 10),
    name: process.env.DB_NAME ?? 'cue',
    user: process.env.DB_USER ?? 'cue',
    password: process.env.DB_PASSWORD ?? 'cue',
    ssl: process.env.DB_SSL === 'true',
  },
  adminPassword: process.env.ADMIN_PASSWORD ?? 'familiada',
  adminTokenSecret: process.env.ADMIN_TOKEN_SECRET ?? 'dev-secret-zmien-na-produkcji',
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:7201',
});
