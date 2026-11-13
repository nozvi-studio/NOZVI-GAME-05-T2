import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Game } from './game/Game';
import type { Prompt as P } from './game/interaction/InteractionController';
import { Prompt } from './ui/Prompt';
import { EmployeeList } from './ui/EmployeeList';
import type { EmployeeRoster } from './ui/employeeRoster';
import { JoinScreen, type JoinResult } from './ui/JoinScreen';
import { ConnectionBanner } from './ui/ConnectionBanner';
import {
  Connection,
  serverUrl,
  toConnectionError,
  type ConnectionError,
  type OfficeRoomHandle,
} from './net';

type Session = { identity: JoinResult; room: OfficeRoomHandle };

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<P>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [joined, setJoined] = useState<Session | null>(null);
  const [roster, setRoster] = useState<EmployeeRoster | null>(null);
  const [connection] = useState(() => new Connection(serverUrl(import.meta.env)));
  const [rejoinError, setRejoinError] = useState<ConnectionError | null>(null);
  const status = useSyncExternalStore(
    (onChange) => connection.onStatus(onChange),
    () => connection.status,
  );
  const reconnect = useSyncExternalStore(
    (onChange) => connection.reconnection.subscribe(onChange),
    () => connection.reconnection.state,
  );
  const join = async (identity: JoinResult) => {
    const room = await connection.join(identity);
    setJoined({ identity, room });
  };
  // REQ-NET-006: resume the held session or join afresh with the same identity.
  const rejoin = () => {
    if (!joined) return;
    setRejoinError(null);
    connection.rejoin().then(
      (room) => {
        // A resumed session reaches the game through onRoom; a fresh one needs a new game.
        if (room.sessionId !== joined.room.sessionId)
          setJoined({ identity: joined.identity, room });
      },
      (err: unknown) => setRejoinError(toConnectionError(err)),
    );
  };
  useEffect(() => {
    if (!joined) return;
    const { identity, room } = joined;
    const game = new Game(
      hostRef.current!,
      { name: identity.name, avatarId: identity.avatarId },
      room,
    );
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    game.onPrompt = setPrompt;
    game.onToast = (message) => {
      clearTimeout(toastTimer);
      setToast(message);
      toastTimer = setTimeout(() => setToast(null), 1500);
    };
    game.onExit = () => {
      // Main-door exit is a consented leave (REQ-MOVE-002).
      void connection.leave();
      setPrompt(null);
      setToast(null);
      setJoined(null);
    };
    // REQ-NET-005: stop sending while the connection is down; a resumed session (same
    // sessionId, new room handle) is reattached with a full resync.
    const offStatus = connection.onStatus((s) => {
      if (s === 'reconnecting' || s === 'lost') game.detachRoom();
    });
    const offRoom = connection.onRoom((resumed) => {
      if (resumed.sessionId === game.netRoom.sessionId) game.attachRoom(resumed);
    });
    game.start();
    setRoster(game.roster);
    return () => {
      offStatus();
      offRoom();
      setRoster(null);
      clearTimeout(toastTimer);
      game.dispose();
    };
  }, [joined, connection]);
  // Leave the room if the app unmounts while joined.
  useEffect(() => () => void connection.leave(), [connection]);
  if (!joined) return <JoinScreen onJoin={join} />;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} data-testid="game-host" style={{ width: '100%', height: '100%' }} />
      <Prompt prompt={prompt} />
      {roster && <EmployeeList roster={roster} />}
      <ConnectionBanner
        status={status}
        reconnect={reconnect}
        error={rejoinError}
        onRejoin={rejoin}
      />
      {toast && (
        <div role="status" style={{ position: 'absolute', bottom: 48, left: 0, right: 0 }}>
          <Prompt prompt={{ text: toast, available: true }} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          color: '#fff',
          background: 'rgba(34,36,38,0.8)',
          borderRadius: 8,
          padding: '6px 10px',
          font: '600 12px system-ui',
          pointerEvents: 'none',
        }}
      >
        G — Wave
      </div>
    </div>
  );
}
