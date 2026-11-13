import { MSG, type InputMessage } from '@office/protocol';
import type { Predictor, ServerSnapshot } from './prediction';

type StateChange<S> = ((callback: (state: S) => void) => unknown) & {
  remove(callback: (state: S) => void): void;
};

/** The part of the joined room the local prediction uses; tests substitute a fake. */
export type PredictionRoom<S = { employees: { get(id: string): ServerSnapshot | undefined } }> = {
  readonly sessionId: string;
  send(type: typeof MSG.input, input: InputMessage): void;
  onStateChange: StateChange<S>;
};

/**
 * Connects a predictor to the joined room: every produced input is sent as `MSG.input`, and
 * every state patch reconciles against the local employee (keyed by `sessionId`). Returns
 * the function that disconnects both directions.
 */
export function bindPrediction(room: PredictionRoom, predictor: Predictor): () => void {
  predictor.onInput = (input) => {
    try {
      room.send(MSG.input, input);
    } catch (error) {
      // A closed socket drops the input; the next patch after a rejoin reconciles.
      console.warn('Input not sent.', error);
    }
  };
  const onPatch = (state: { employees: { get(id: string): ServerSnapshot | undefined } }) => {
    const self = state.employees.get(room.sessionId);
    if (self) predictor.reconcile(self);
  };
  room.onStateChange(onPatch);
  return () => {
    room.onStateChange.remove(onPatch);
    predictor.onInput = undefined;
  };
}
