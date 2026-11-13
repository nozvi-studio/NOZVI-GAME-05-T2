import { MSG, type InputMessage } from '@office/protocol';
import type { Predictor, ServerSnapshot } from './prediction';

type StateChange<S> = ((callback: (state: S) => void) => unknown) & {
  remove(callback: (state: S) => void): void;
};

/** The replicated fields of the local employee: position for reconciliation, plus seat. */
export type LocalSnapshot = ServerSnapshot & { readonly activity: string; readonly seatId: string };

/** The part of the joined room the local prediction uses; tests substitute a fake. */
export type PredictionRoom<S = { employees: { get(id: string): LocalSnapshot | undefined } }> = {
  readonly sessionId: string;
  send(type: typeof MSG.input, input: InputMessage): void;
  onStateChange: StateChange<S>;
};

/**
 * Connects a predictor to the joined room: every produced input is sent as `MSG.input`, and
 * every state patch hands the local employee (keyed by `sessionId`) to `apply`, which by
 * default reconciles the predictor (`Player.applyServer` also follows seat and activity).
 * Returns the function that disconnects both directions.
 */
export function bindPrediction(
  room: PredictionRoom,
  predictor: Predictor,
  apply: (self: LocalSnapshot) => void = (self) => predictor.reconcile(self),
): () => void {
  predictor.onInput = (input) => {
    try {
      room.send(MSG.input, input);
    } catch (error) {
      // A closed socket drops the input; the next patch after a rejoin reconciles.
      console.warn('Input not sent.', error);
    }
  };
  const onPatch = (state: { employees: { get(id: string): LocalSnapshot | undefined } }) => {
    const self = state.employees.get(room.sessionId);
    if (self) apply(self);
  };
  room.onStateChange(onPatch);
  return () => {
    room.onStateChange.remove(onPatch);
    predictor.onInput = undefined;
  };
}
