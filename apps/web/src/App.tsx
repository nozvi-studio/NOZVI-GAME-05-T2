import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { Prompt as P } from './game/interaction/InteractionController';
import { Prompt } from './ui/Prompt';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<P>(null);
  useEffect(() => {
    const game = new Game(hostRef.current!, 'men_suit');
    game.onPrompt = setPrompt;
    game.start();
    return () => game.dispose();
  }, []);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} data-testid="game-host" style={{ width: '100%', height: '100%' }} />
      <Prompt prompt={prompt} />
    </div>
  );
}
