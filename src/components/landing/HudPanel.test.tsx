import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resolve } from '@/i18n';
import { landing } from '@/i18n/dictionaries/landing';
import { CORE_FEATURES } from './features';
import { HudPanel } from './HudPanel';

vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => {
  const { fill: _fill, ...rest } = props; return <img {...(rest as object)} />;
} }));

const t = (k: string, v?: Record<string, string | number>) => resolve(landing, 'en', k, v);

describe('HudPanel', () => {
  it('renders the feature title, a telemetry label and its value', () => {
    const monitoring = CORE_FEATURES[0];
    render(<HudPanel feature={monitoring} t={t} />);
    expect(screen.getByText('Real-time monitoring')).toBeInTheDocument();
    expect(screen.getByText('Live sessions')).toBeInTheDocument(); // feat.1.t1 label
    expect(screen.getByText('42')).toBeInTheDocument(); // telemetry value (universal data)
  });

  it('shows illustrative badge for monitoring (cnt-2) but not for chat', () => {
    const monitoring = CORE_FEATURES[0]; // illustrative: true
    const { unmount } = render(<HudPanel feature={monitoring} t={t} />);
    expect(screen.getByText('ILLUSTRATIVE DATA')).toBeInTheDocument();
    unmount();

    const chat = CORE_FEATURES[1]; // no illustrative flag
    render(<HudPanel feature={chat} t={t} />);
    expect(screen.queryByText('ILLUSTRATIVE DATA')).toBeNull();
  });
});
