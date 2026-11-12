import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { Prompt as P } from './game/interaction/InteractionController';
import { Prompt } from './ui/Prompt';
import { JoinScreen, type JoinResult } from './ui/JoinScreen';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<P>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  useEffect(() => {
    if (!joined) return;
    const game = new Game(hostRef.current!, { name: joined.name, avatarId: joined.avatarId });
    game.onPrompt = setPrompt;
    game.onExit = () => {
      setPrompt(null);
      setJoined(null);
    };
    game.start();
    return () => game.dispose();
  }, [joined]);
  if (!joined) return <JoinScreen onJoin={setJoined} />;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} data-testid="game-host" style={{ width: '100%', height: '100%' }} />
      <Prompt prompt={prompt} />
    </div>
  );
}
