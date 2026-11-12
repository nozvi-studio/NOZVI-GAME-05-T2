import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { Prompt as P } from './game/interaction/InteractionController';
import { Prompt } from './ui/Prompt';
import { JoinScreen, type JoinResult } from './ui/JoinScreen';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<P>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  useEffect(() => {
    if (!joined) return;
    const game = new Game(hostRef.current!, { name: joined.name, avatarId: joined.avatarId });
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    game.onPrompt = setPrompt;
    game.onToast = (message) => {
      clearTimeout(toastTimer);
      setToast(message);
      toastTimer = setTimeout(() => setToast(null), 1500);
    };
    game.onExit = () => {
      setPrompt(null);
      setToast(null);
      setJoined(null);
    };
    game.start();
    return () => {
      clearTimeout(toastTimer);
      game.dispose();
    };
  }, [joined]);
  if (!joined) return <JoinScreen onJoin={setJoined} />;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} data-testid="game-host" style={{ width: '100%', height: '100%' }} />
      <Prompt prompt={prompt} />
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
