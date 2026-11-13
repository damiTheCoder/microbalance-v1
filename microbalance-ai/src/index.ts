import 'dotenv/config';
import { buildApp } from './app.js';
import { truncate } from './core/client.js';

const port = Number(process.env.PORT ?? 3002);

buildApp()
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    console.log(`microbalance-ai listening on :${port}`);
  })
  .catch((error) => {
    console.error(truncate(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
