import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AuroraBackground } from './AuroraBackground';

describe('AuroraBackground', () => {
  it('renders the decorative layer without crashing (no 2D canvas in jsdom)', () => {
    const { container } = render(<AuroraBackground />);
    // The whole stack is decorative → must be hidden from the a11y tree.
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    // Includes the dot canvas.
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});
