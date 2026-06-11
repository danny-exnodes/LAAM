'use client';

import styles from './landing.module.css';
import { AuroraBackground } from './AuroraBackground';
import { LandingNav } from './LandingNav';
import { Hero } from './Hero';
import { MechShowcase } from './MechShowcase';
import { FeatureGrid } from './FeatureGrid';
import { HowItWorks } from './HowItWorks';
import { Footer } from './Footer';

// Public landing page composition. `isAuthed` comes from the server page (auth())
// and only switches the nav CTA between "Get started / Sign in" and "Dashboard".
export function Landing({ isAuthed }: { isAuthed: boolean }) {
  return (
    <div className={styles.root}>
      <AuroraBackground />
      <div className={styles.content}>
        <LandingNav isAuthed={isAuthed} />
        <main>
          <Hero />
          <MechShowcase />
          <HowItWorks />
          <FeatureGrid />
        </main>
        <Footer />
      </div>
    </div>
  );
}
