import { expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/index';
it('exports a protocol version', () => expect(PROTOCOL_VERSION).toBe(2));
