import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resolve } from '@/i18n';
import { landing } from '@/i18n/dictionaries/landing';
import { CORE_FEATURES } from './features';
import { HudPanel } from './HudPanel';

const t = (k: string, v?: Record<string, string | number>) => resolve(landing, 'en', k, v);

describe('HudPanel', () => {
  it('renders the feature title, a telemetry label and its value', () => {
    const monitoring = CORE_FEATURES[0];
    render(<HudPanel feature={monitoring} t={t} />);
    expect(screen.getByText('Real-time monitoring')).toBeInTheDocument();
    expect(screen.getByText('Live sessions')).toBeInTheDocument(); // feat.1.t1 label
    expect(screen.getByText('42')).toBeInTheDocument(); // telemetry value (universal data)
  });
});
