import { useEffect, useRef } from 'react';
import { Game } from './game/Game';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = new Game(hostRef.current!);
    game.start();
    return () => game.dispose();
  }, []);
  return <div ref={hostRef} data-testid="game-host" style={{ width: '100%', height: '100%' }} />;
}
