import { createApp, parseAllowedOrigins } from './app';

const port = Number(process.env.PORT ?? 2567);
const { game } = createApp({ allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS) });
await game.listen(port);
console.log(`server listening on ${port}`);
