import { BALANCE } from '@office/protocol';
import { createApp, parseAllowedOrigins } from './app';
import { JoinRateLimiter } from './joinRateLimiter';
import { installNetProfile, netProfileFromEnv } from './netProfile';
import { roomServices } from './rooms/OfficeRoom';

const port = Number(process.env.PORT ?? 2567);
// JOIN_LIMIT_PER_MINUTE overrides the per-address join limit (e2e runs many joins from 127.0.0.1).
const joinLimit = Number(process.env.JOIN_LIMIT_PER_MINUTE ?? BALANCE.net.joinsPerMinutePerIp);
if (Number.isInteger(joinLimit) && joinLimit > 0)
  roomServices.joinLimiter = new JoinRateLimiter(joinLimit);

// CHAT_TTL_SECONDS overrides how long chat messages live (tests and e2e shorten the 60 s TTL).
const chatTtl = Number(process.env.CHAT_TTL_SECONDS ?? BALANCE.chat.ttlSeconds);
if (Number.isFinite(chatTtl) && chatTtl > 0) roomServices.chatTtlSeconds = chatTtl;

// NET_PROFILE=test (dev only, off by default) delays and jitters outgoing messages (REQ-NET-004).
const netProfile = netProfileFromEnv(process.env);
if (netProfile) {
  installNetProfile(netProfile);
  console.warn(`network test profile on: ${JSON.stringify(netProfile)}`);
}

const { game } = createApp({ allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS) });
await game.listen(port);
console.log(`server listening on ${port}`);
