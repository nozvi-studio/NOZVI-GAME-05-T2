import { describe, expect, it } from 'vitest';
import { BALANCE, OFFICE_ROOM, PROTOCOL_VERSION } from '@office/protocol';
import { E2E_WIRE } from '../e2e/bots';

describe('e2e bot wire constants', () => {
  it('match the protocol package', () => {
    expect(E2E_WIRE).toEqual({
      room: OFFICE_ROOM,
      protocolVersion: PROTOCOL_VERSION,
      maxClients: BALANCE.net.maxClients,
    });
  });
});
