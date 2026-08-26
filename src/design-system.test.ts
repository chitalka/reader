// @ts-expect-error Vitest executes this regression test in Node; the browser bundle omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/design-system.css', 'utf8');
const entrypoint = readFileSync('src/main.ts', 'utf8');

describe('unified reader design system', () => {
  it('loads after the legacy stylesheet and owns the shared scale', () => {
    expect(entrypoint.indexOf("import './design-system.css';"))
      .toBeGreaterThan(entrypoint.indexOf("import './style.css';"));
    expect(stylesheet).toContain('--ui-control-size: 34px;');
    expect(stylesheet).toContain('--ui-control-size: 40px;');
    expect(stylesheet).toContain('--ui-font-size: 13px;');
    expect(stylesheet).toContain('--ui-font-size-sm: 12px;');
  });

  it('keeps the reader surface frameless', () => {
    expect(stylesheet).toContain('.book-viewport {\n  border: 0;\n  background: transparent;\n  box-shadow: none;');
  });

  it('keeps only the controls on the reading surface frameless', () => {
    expect(stylesheet).toContain('.app-header .icon-button,');
    expect(stylesheet).toContain('.header-actions .open-button,');
    expect(stylesheet).toContain('.reader-footer .page-button {\n  border-color: transparent;');
    expect(stylesheet).toContain('.settings-close,\n.panel-close,\n.quote-menu-close {');
  });

  it('uses the approved motion tiers and a reduced-motion fallback', () => {
    expect(stylesheet).toContain('--motion-routine: 180ms;');
    expect(stylesheet).toContain('--motion-sheet: 360ms;');
    expect(stylesheet).toContain('--motion-preview: 125ms;');
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('transition-duration: 120ms;');
  });

  it('pulses only the pending time ellipsis and respects reduced motion', () => {
    expect(stylesheet).toContain('@keyframes reader-pending-ellipsis');
    expect(stylesheet).toContain(
      'animation: reader-pending-ellipsis 1200ms var(--ease-move) infinite;',
    );
    expect(stylesheet).toContain(
      '.reader-footer.is-pending #time-label,\n  .reader-footer.is-pending #time-label-compact {\n    animation: none;',
    );
  });

  it('gates hover styling and presents mobile overlays as sheets', () => {
    expect(stylesheet).toContain('@media (hover: hover) and (pointer: fine)');
    expect(stylesheet).toContain('--motion-closed-transform: translateY(100%);');
    expect(stylesheet).toContain('border-radius: 16px 16px 0 0;');
  });
});
