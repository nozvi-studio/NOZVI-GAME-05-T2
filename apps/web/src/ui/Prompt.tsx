import type { Prompt as P } from '../game/interaction/InteractionController';

export function Prompt({ prompt }: { prompt: P }) {
  if (!prompt) return null;
  return (
    <div
      data-testid="prompt"
      style={{
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '8px 16px',
        borderRadius: 8,
        background: 'rgba(34,36,38,0.8)',
        color: prompt.available ? '#fff' : '#f5a3a3',
        font: '600 15px system-ui',
      }}
    >
      {prompt.text}
    </div>
  );
}
