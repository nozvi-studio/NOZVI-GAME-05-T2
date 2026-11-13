import { useSyncExternalStore } from 'react';
import type { EmployeeRoster } from './employeeRoster';

/** Dev-only render counter read by e2e (`window.__officeListRenders`). */
function countRender(): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __officeListRenders?: number };
  w.__officeListRenders = (w.__officeListRenders ?? 0) + 1;
}

/**
 * 2D panel listing every employee in the room (REQ-UI-003). Subscribed to the roster, so it
 * re-renders only when the list or a label changes, never per frame. Names render as text.
 */
export function EmployeeList({ roster }: { roster: EmployeeRoster }) {
  const entries = useSyncExternalStore(roster.subscribe, roster.getSnapshot);
  countRender();
  return (
    <section
      aria-label="Online employees"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        minWidth: 160,
        maxWidth: 240,
        color: '#fff',
        background: 'rgba(34,36,38,0.8)',
        borderRadius: 8,
        padding: '8px 12px',
        font: '13px system-ui',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Online ({entries.length})</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {entries.map((e) => (
          <li
            key={e.sessionId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '2px 0',
              opacity: e.connected ? 1 : 0.5,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span data-testid="employee-name">
                {/* One text node for the local row: "Name (you)". */}
                {e.isLocal ? `${e.name} (you)` : e.name}
              </span>
            </span>
            <span data-testid="employee-label" style={{ opacity: 0.8 }}>
              {e.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
