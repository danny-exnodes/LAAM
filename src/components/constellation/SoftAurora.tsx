"use client";
import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

// Ported from React Bits' <SoftAurora /> (ogl-based aurora shader) — adapted
// to TypeScript and to this project's Tailwind-only styling convention (no
// separate component CSS file; sizing is passed via className instead).
function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

const VERTEX_SHADER = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uBrightness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uNoiseFreq;
uniform float uNoiseAmp;
uniform float uBandHeight;
uniform float uBandSpread;
uniform float uOctaveDecay;
uniform float uLayerOffset;
uniform float uColorSpeed;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;

#define TAU 6.28318

vec3 gradientHash(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 234.6)),
    dot(p, vec3(269.5, 183.3, 198.3)),
    dot(p, vec3(169.5, 283.3, 156.9))
  );
  vec3 h = fract(sin(p) * 43758.5453123);
  float phi = acos(2.0 * h.x - 1.0);
  float theta = TAU * h.y;
  return vec3(cos(theta) * sin(phi), sin(theta) * cos(phi), cos(phi));
}

float quinticSmooth(float t) {
  float t2 = t * t;
  float t3 = t * t2;
  return 6.0 * t3 * t2 - 15.0 * t2 * t2 + 10.0 * t3;
}

vec3 cosineGradient(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

float perlin3D(float amplitude, float frequency, float px, float py, float pz) {
  float x = px * frequency;
  float y = py * frequency;

  float fx = floor(x); float fy = floor(y); float fz = floor(pz);
  float cx = ceil(x);  float cy = ceil(y);  float cz = ceil(pz);

  vec3 g000 = gradientHash(vec3(fx, fy, fz));
  vec3 g100 = gradientHash(vec3(cx, fy, fz));
  vec3 g010 = gradientHash(vec3(fx, cy, fz));
  vec3 g110 = gradientHash(vec3(cx, cy, fz));
  vec3 g001 = gradientHash(vec3(fx, fy, cz));
  vec3 g101 = gradientHash(vec3(cx, fy, cz));
  vec3 g011 = gradientHash(vec3(fx, cy, cz));
  vec3 g111 = gradientHash(vec3(cx, cy, cz));

  float d000 = dot(g000, vec3(x - fx, y - fy, pz - fz));
  float d100 = dot(g100, vec3(x - cx, y - fy, pz - fz));
  float d010 = dot(g010, vec3(x - fx, y - cy, pz - fz));
  float d110 = dot(g110, vec3(x - cx, y - cy, pz - fz));
  float d001 = dot(g001, vec3(x - fx, y - fy, pz - cz));
  float d101 = dot(g101, vec3(x - cx, y - fy, pz - cz));
  float d011 = dot(g011, vec3(x - fx, y - cy, pz - cz));
  float d111 = dot(g111, vec3(x - cx, y - cy, pz - cz));

  float sx = quinticSmooth(x - fx);
  float sy = quinticSmooth(y - fy);
  float sz = quinticSmooth(pz - fz);

  float lx00 = mix(d000, d100, sx);
  float lx10 = mix(d010, d110, sx);
  float lx01 = mix(d001, d101, sx);
  float lx11 = mix(d011, d111, sx);

  float ly0 = mix(lx00, lx10, sy);
  float ly1 = mix(lx01, lx11, sy);

  return amplitude * mix(ly0, ly1, sz);
}

float auroraGlow(float t, vec2 shift) {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  uv += shift;

  float noiseVal = 0.0;
  float freq = uNoiseFreq;
  float amp = uNoiseAmp;
  vec2 samplePos = uv * uScale;

  for (float i = 0.0; i < 3.0; i += 1.0) {
    noiseVal += perlin3D(amp, freq, samplePos.x, samplePos.y, t);
    amp *= uOctaveDecay;
    freq *= 2.0;
  }

  float yBand = uv.y * 10.0 - uBandHeight * 10.0;
  return 0.3 * max(exp(uBandSpread * (1.0 - 1.1 * abs(noiseVal + yBand))), 0.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float t = uSpeed * 0.4 * uTime;

  vec2 shift = vec2(0.0);
  if (uEnableMouse) {
    shift = (uMouse - 0.5) * uMouseInfluence;
  }

  vec3 col = vec3(0.0);
  // NOTE: upstream SoftAurora tints each layer through a hue-cycling
  // cosineGradient here, which drifts the aurora through unrelated colors
  // (green/red) regardless of uColor1/uColor2 — dropped in favor of a direct
  // tint so the aurora stays locked to the two supplied palette colors.
  col += 0.99 * auroraGlow(t, shift) * uColor1;
  col += 0.99 * auroraGlow(t + uLayerOffset, shift) * uColor2;

  col *= uBrightness;
  float alpha = clamp(length(col), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

interface SoftAuroraProps {
  speed?: number;
  scale?: number;
  brightness?: number;
  color1?: string;
  color2?: string;
  noiseFrequency?: number;
  noiseAmplitude?: number;
  bandHeight?: number;
  bandSpread?: number;
  octaveDecay?: number;
  layerOffset?: number;
  colorSpeed?: number;
  enableMouseInteraction?: boolean;
  mouseInfluence?: number;
  /** Polled every frame (0..~0.6, e.g. live TTS amplitude while speaking) —
   * eased toward and used to boost speed/brightness, so the aurora visibly
   * animates faster/brighter while the assistant talks. Read via a ref
   * (NOT a prop dependency) so it can change every frame without tearing
   * down and recreating the ogl renderer. */
  getIntensity?: () => number;
  className?: string;
}

export function SoftAurora({
  speed = 0.6,
  scale = 1.5,
  brightness = 1.0,
  color1 = "#f7f7f7",
  color2 = "#e100ff",
  noiseFrequency = 2.5,
  noiseAmplitude = 1.0,
  bandHeight = 0.5,
  bandSpread = 1.0,
  octaveDecay = 0.1,
  layerOffset = 0,
  colorSpeed = 1.0,
  enableMouseInteraction = true,
  mouseInfluence = 0.25,
  getIntensity,
  className = "absolute inset-0 z-0",
}: SoftAuroraProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const getIntensityRef = useRef(getIntensity);
  getIntensityRef.current = getIntensity;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    let program: Program;
    let currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];

    function handleMouseMove(e: MouseEvent) {
      const rect = gl.canvas.getBoundingClientRect();
      targetMouse = [(e.clientX - rect.left) / rect.width, 1.0 - (e.clientY - rect.top) / rect.height];
    }

    function handleMouseLeave() {
      targetMouse = [0.5, 0.5];
    }

    function resize() {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      if (program) {
        program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
      }
    }
    window.addEventListener("resize", resize);
    resize();

    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height] },
        uSpeed: { value: speed },
        uScale: { value: scale },
        uBrightness: { value: brightness },
        uColor1: { value: hexToVec3(color1) },
        uColor2: { value: hexToVec3(color2) },
        uNoiseFreq: { value: noiseFrequency },
        uNoiseAmp: { value: noiseAmplitude },
        uBandHeight: { value: bandHeight },
        uBandSpread: { value: bandSpread },
        uOctaveDecay: { value: octaveDecay },
        uLayerOffset: { value: layerOffset },
        uColorSpeed: { value: colorSpeed },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseInfluence: { value: mouseInfluence },
        uEnableMouse: { value: enableMouseInteraction },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    if (enableMouseInteraction) {
      gl.canvas.addEventListener("mousemove", handleMouseMove);
      gl.canvas.addEventListener("mouseleave", handleMouseLeave);
    }

    let animationFrameId = 0;
    let currentBoost = 0;

    function update(time: number) {
      program.uniforms.uTime.value = time * 0.001;

      // eases toward live intensity (e.g. TTS amplitude while speaking) and
      // boosts uSpeed/uBrightness — uSpeed already scales how fast the noise
      // scrolls (see `t = uSpeed * 0.4 * uTime` in the fragment shader), so
      // this is enough to read as "animating faster" without touching uTime.
      const targetBoost = getIntensityRef.current?.() ?? 0;
      currentBoost += (targetBoost - currentBoost) * 0.08;
      program.uniforms.uSpeed.value = speed * (1 + currentBoost * 0.8);
      program.uniforms.uBrightness.value = brightness * (1 + currentBoost * 0.7);

      if (enableMouseInteraction) {
        currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
        (program.uniforms.uMouse.value as Float32Array)[0] = currentMouse[0];
        (program.uniforms.uMouse.value as Float32Array)[1] = currentMouse[1];
      } else {
        (program.uniforms.uMouse.value as Float32Array)[0] = 0.5;
        (program.uniforms.uMouse.value as Float32Array)[1] = 0.5;
      }

      renderer.render({ scene: mesh });
    }
    // Cap to 60fps: `uTime` is driven off the real rAF timestamp (not a
    // per-call accumulator), so throttling how often we call update() only
    // reduces draw-call rate — it does NOT change the animation's visual
    // speed. This is the most fill-rate-costly of this page's canvases
    // (full-screen per-pixel noise, 3 octaves x 2 layers), so it matters
    // most here: it never stops while the tab is visible, so 15+ minutes
    // idle is enough sustained GPU load to spin up the fan.
    const FRAME_INTERVAL_MS = 1000 / 60;
    let lastFrameAt = 0;
    function loop(now: number) {
      animationFrameId = requestAnimationFrame(loop);
      if (now - lastFrameAt < FRAME_INTERVAL_MS) return;
      lastFrameAt = now;
      update(now);
    }
    // A full-screen fragment shader is the most fill-rate-costly of this
    // page's canvases (per-pixel noise, 3 octaves x 2 layers) — stop the
    // loop entirely while the tab is backgrounded instead of burning GPU
    // cycles on invisible frames.
    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      } else if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(loop);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      if (enableMouseInteraction) {
        gl.canvas.removeEventListener("mousemove", handleMouseMove);
        gl.canvas.removeEventListener("mouseleave", handleMouseLeave);
      }
      container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    speed,
    scale,
    brightness,
    color1,
    color2,
    noiseFrequency,
    noiseAmplitude,
    bandHeight,
    bandSpread,
    octaveDecay,
    layerOffset,
    colorSpeed,
    enableMouseInteraction,
    mouseInfluence,
  ]);

  return <div ref={containerRef} className={className} aria-hidden />;
}
