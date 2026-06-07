"use client";

// ⚠️ TEMPORARY PREVIEW — throwaway gallery for the "Matte Dark" design-system
// foundation (tokens + primitives). Not part of the product nav; delete this
// route once the look & feel is signed off and the real pages are restyled.
// The wrapper forces `.dark` so the Matte Dark surface shows regardless of the
// user's current theme.

import { useState } from "react";
import { MatteCard, MatteButton, Bloom } from "@/components/ui";

function Swatch({ label, varName }: { label: string; varName: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-16 w-full rounded-xl border border-[var(--border-subtle)]"
        style={{ background: `var(${varName})` }}
      />
      <span className="text-xs text-[var(--text-muted)]">
        {label} · {varName}
      </span>
    </div>
  );
}

function Bars() {
  const heights = [40, 28, 64, 44];
  return (
    <div className="flex h-24 items-end gap-3">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)]"
          style={{
            height: `${h}%`,
            ...(i === 2
              ? { background: "var(--accent-muted)", borderColor: "var(--accent-glow)" }
              : {}),
          }}
        />
      ))}
    </div>
  );
}

export default function UiPreviewPage() {
  const [range, setRange] = useState<"1D" | "1W" | "1M">("1D");

  return (
    <div className="dark min-h-dvh bg-[var(--bg-base)] px-6 py-10 text-[var(--text-primary)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-[var(--accent)]">
            Temporary preview
          </span>
          <h1 className="text-3xl font-light tracking-tight">
            Matte Dark — design foundation
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Opaque matte surfaces · cyan/aqua accent · ambient gradient + bloom ·
            no backdrop-blur. Tokens in <code>globals.css</code>, primitives in{" "}
            <code>components/ui</code>.
          </p>
        </header>

        {/* Swatches */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Swatch label="Base" varName="--bg-base" />
          <Swatch label="Surface 1" varName="--surface-1" />
          <Swatch label="Surface 2" varName="--surface-2" />
          <Swatch label="Surface 3" varName="--surface-3" />
          <Swatch label="Accent" varName="--accent" />
        </section>

        {/* Buttons */}
        <section className="flex flex-wrap items-center gap-3">
          <MatteButton variant="primary">Buy POV</MatteButton>
          <MatteButton variant="ghost">View all</MatteButton>
          <MatteButton variant="subtle">New challenge</MatteButton>
          <MatteButton variant="primary" disabled>
            Disabled
          </MatteButton>
        </section>

        {/* Hero aurora card + KPI grid (mimics the reference dashboard) */}
        <section className="grid gap-5 lg:grid-cols-3">
          <MatteCard
            tone="accent"
            pad="lg"
            className="lg:col-span-1"
            bloom={<Bloom color="var(--bloom-aqua)" position="top-right" size="80%" />}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[var(--surface-3)]" />
                <div>
                  <p className="text-sm font-medium">Alex Rivera</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Member since June 2025
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Win Rate</p>
                <p className="text-4xl font-light italic">13.52%</p>
              </div>
              <Bars />
            </div>
          </MatteCard>

          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
            <MatteCard bloom={<Bloom position="bottom" size="120%" />}>
              <p className="text-sm text-[var(--text-secondary)]">
                Total Trading Capital
              </p>
              <p className="mt-2 text-3xl font-light">$54,709.50</p>
              <span className="mt-2 inline-block rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-xs text-[var(--accent)]">
                +12.5%
              </span>
            </MatteCard>

            <MatteCard>
              <p className="text-sm text-[var(--text-secondary)]">Target Progress</p>
              <p className="mt-2 text-3xl font-light">$7,350.00</p>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className="h-full w-2/5 rounded-full bg-[var(--accent)]" />
              </div>
            </MatteCard>

            <MatteCard className="sm:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-[var(--text-secondary)]">Your Equity</p>
                <div className="flex gap-1 rounded-full border border-[var(--border-subtle)] p-1">
                  {(["1D", "1W", "1M"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-glow)] ${
                        range === r
                          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-3xl font-light">$37,534.10</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Showing {range} range
              </p>
            </MatteCard>
          </div>
        </section>
      </div>
    </div>
  );
}
