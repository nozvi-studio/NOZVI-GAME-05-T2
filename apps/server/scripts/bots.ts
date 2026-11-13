/**
 * Headless bot clients for manual multi-client checks (REQ-NET-001, REQ-NET-004). Each bot
 * joins with `@colyseus/sdk` (no rendering) and walks a 2 m square near the spawn by sending
 * one `input` per 50 ms, like a real client.
 *
 *   pnpm --filter @office/server bots -- --code TEN-01 --count 9 [--url http://127.0.0.1:2567]
 *                                        [--minutes 10]
 *
 * The local server's join limit is 10 per minute per address; start it with
 * JOIN_LIMIT_PER_MINUTE=1000 when bots and a browser join from one machine. Ctrl+C leaves
 * all bots (a consented leave, so they disappear at once).
 */
import { parseArgs } from 'node:util';
import { Client, type Room } from '@colyseus/sdk';
import {
  BALANCE,
  MSG,
  OFFICE_ROOM,
  PROTOCOL_VERSION,
  type InputMessage,
  type OfficeState,
} from '@office/protocol';

const STEP_MS = 1000 / BALANCE.net.tickHz;
/** Steps per square side: 1 s of walking, 2 m at walk speed. */
const SIDE_STEPS = BALANCE.net.tickHz;

/** Input for step `seq` of bot `index`: a square walked clockwise, each bot turned 90° more. */
function botInput(seq: number, index: number): InputMessage {
  const side = Math.floor((seq - 1) / SIDE_STEPS) + index;
  return { seq, forward: 1, right: 0, run: false, yaw: ((side % 4) * Math.PI) / 2 };
}

const { values } = parseArgs({
  // `pnpm <script> -- --flag` passes the `--` through.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:2567' },
    code: { type: 'string', default: 'BOTS-01' },
    count: { type: 'string', default: '9' },
    minutes: { type: 'string', default: '0' },
  },
});
const count = Number(values.count);
const minutes = Number(values.minutes);

const rooms: Room<unknown, OfficeState>[] = [];
const timers: ReturnType<typeof setInterval>[] = [];

async function stop(code = 0): Promise<never> {
  timers.forEach(clearInterval);
  await Promise.all(rooms.map((r) => r.leave(true).catch(() => undefined)));
  console.log(`left ${rooms.length} bot(s)`);
  process.exit(code);
}
process.on('SIGINT', () => void stop());

for (let i = 0; i < count; i++) {
  try {
    const room = await new Client(values.url).joinOrCreate<OfficeState>(OFFICE_ROOM, {
      name: `Bot${i + 1}`,
      officeCode: values.code,
      avatarId: 'men_suit',
      protocolVersion: PROTOCOL_VERSION,
    });
    rooms.push(room);
    let seq = 0;
    timers.push(setInterval(() => room.send(MSG.input, botInput(++seq, i)), STEP_MS));
    console.log(`Bot${i + 1} joined ${room.roomId} as ${room.sessionId}`);
  } catch (e) {
    console.log(`Bot${i + 1} rejected: ${(e as Error).message}`);
  }
}
// Give the last join's patch time to reach the first bot before reporting the room size.
setTimeout(() => {
  const sample = rooms[0];
  if (sample) console.log(`Bot1 sees ${sample.state.employees.size} employee(s)`);
}, 1_000);
if (minutes > 0) setTimeout(() => void stop(), minutes * 60_000);
