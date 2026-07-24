"use client";
import { useEffect, useRef } from "react";

// Adapted from a "Sonic Waveform" hero background snippet — ported to
// TypeScript and to this project's transparent-overlay convention.
//
// Deliberate change from the source: the original used a translucent black
// fillRect each frame (`rgba(0,0,0,0.1)`) to leave motion trails, which
// assumes an opaque black backdrop. Here the canvas sits over this page's
// own gradient background, so trails would slowly paint it solid black —
// replaced with a full `clearRect` (no trail) so the page background stays
// visible. Color is parameterized to the app's existing palette instead of
// the source's hardcoded teal.
interface SonicWaveformCanvasProps {
  className?: string;
  /** "r,g,b" — kept as a plain string so it drops straight into rgba(). */
  color?: string;
}

export function SonicWaveformCanvas({ className = "absolute inset-0 z-0", color = "91,214,255" }: SonicWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion:reduce)").matches
        : false;

    let animationFrameId = 0;
    const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
    let time = 0;

    // Sized off the viewport, not canvas.clientWidth/Height — reading the
    // canvas's own box size here raced the initial layout pass and stuck at
    // the element's default 300x150 intrinsic size (see ConstellationCanvas,
    // which uses the same window-dimension approach for the same reason).
    function resizeCanvas() {
      canvas!.width = innerWidth;
      canvas!.height = innerHeight;
    }

    function draw() {
      const W = canvas!.width;
      const H = canvas!.height;
      ctx!.clearRect(0, 0, W, H);

      const lineCount = 40;
      const segmentCount = 80;
      const height = H / 2;

      for (let i = 0; i < lineCount; i++) {
        ctx!.beginPath();
        const progress = i / lineCount;
        const colorIntensity = Math.sin(progress * Math.PI);
        ctx!.strokeStyle = `rgba(${color},${colorIntensity * 0.28})`;
        ctx!.lineWidth = 1.2;

        for (let j = 0; j <= segmentCount; j++) {
          const x = (j / segmentCount) * W;

          const distToMouse = Math.hypot(x - mouse.x, height - mouse.y);
          const mouseEffect = Math.max(0, 1 - distToMouse / 400);

          const noise = Math.sin(j * 0.1 + time + i * 0.2) * 20;
          const spike = Math.cos(j * 0.2 + time + i * 0.1) * Math.sin(j * 0.05 + time) * 50;
          const y = height + noise + spike * (1 + mouseEffect * 2);

          if (j === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      }

      time += 0.008;
      if (!reduce) animationFrameId = requestAnimationFrame(draw);
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mousemove", handleMouseMove);
    resizeCanvas();
    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [color]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
