import React from "react";
import {
  useCurrentFrame,
  interpolate,
  Easing,
  AbsoluteFill,
  Sequence,
  Audio,
} from "remotion";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function ease(frame, delay, duration, from, to, easingFn = Easing.out(Easing.cubic)) {
  return interpolate(frame, [delay, delay + duration], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easingFn,
  });
}

function splitLines(text, charsPerLine = 58) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length > charsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─────────────────────────────────────────────
// SINGLE SCENE
// ─────────────────────────────────────────────
function Scene({ scene, durationInFrames, fps }) {
  const frame = useCurrentFrame();

  // Ken Burns: zoom + slow pan
  const bgScale  = interpolate(frame, [0, durationInFrames], [1.0, 1.14], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bgTransX = interpolate(frame, [0, durationInFrames], [0, -1.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Title slide-up
  const titleY  = ease(frame, 0, 22, 70, 0);
  const titleOp = ease(frame, 0, 18, 0, 1);

  // Scene badge
  const badgeOp = ease(frame, 0, 14, 0, 1);

  // Explanation lines — stagger
  const lines     = splitLines(scene.explanation, 56);
  const LINE_GAP  = 9; // frames between each line

  // Global exit fade
  const fadeOutStart = durationInFrames - Math.floor(fps * 0.55);
  const globalOp = interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bottom bar width
  const barW = ease(frame, 10, 24, 0, 100);

  return (
    <AbsoluteFill style={{ opacity: globalOp, background: "#080810" }}>

      {/* ── BACKGROUND — Ken Burns ── */}
      <AbsoluteFill
        style={{
          transform: `scale(${bgScale}) translateX(${bgTransX}%)`,
          transformOrigin: "center center",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          src={scene.imagePath}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* ── GRADIENT OVERLAY ── */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 35%, rgba(0,0,0,0.88) 100%)",
        }}
      />

      {/* Left edge accent line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          background: "linear-gradient(to bottom, #6366f1, #8b5cf6, #ec4899)",
          opacity: ease(frame, 6, 20, 0, 1),
        }}
      />

      {/* ── SCENE COUNTER BADGE ── */}
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 52,
          opacity: badgeOp,
          background: "rgba(99,102,241,0.82)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: 100,
          padding: "8px 22px",
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: 1,
          boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
        }}
      >
        {scene.index + 1} / {scene.total}
      </div>

      {/* ── CONTENT AREA ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0 72px 68px 80px",
        }}
      >
        {/* TITLE */}
        <div
          style={{
            transform: `translateY(${titleY}px)`,
            opacity: titleOp,
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            fontSize: 56,
            fontWeight: 800,
            color: "#ffffff",
            textShadow: "0 4px 24px rgba(0,0,0,0.9)",
            lineHeight: 1.18,
            marginBottom: 26,
            maxWidth: 1060,
            letterSpacing: -0.5,
          }}
        >
          {scene.title}
        </div>

        {/* EXPLANATION LINES — staggered slide-in */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.map((line, i) => {
            const lineStart = 20 + i * LINE_GAP;
            const lineOp = ease(frame, lineStart, 14, 0, 1);
            const lineX  = ease(frame, lineStart, 16, -28, 0);
            return (
              <div
                key={i}
                style={{
                  opacity: lineOp,
                  transform: `translateX(${lineX}px)`,
                  fontFamily: "'Inter', 'Segoe UI', sans-serif",
                  fontSize: 30,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.91)",
                  lineHeight: 1.55,
                  textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BOTTOM ACCENT BAR — wipe in ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: `${barW}%`,
          height: 5,
          background: "linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)",
          transition: "width 0s",
        }}
      />

      {/* ── NARRATION AUDIO ── */}
      {scene.audioPath ? <Audio src={scene.audioPath} /> : null}
    </AbsoluteFill>
  );
}

// ─────────────────────────────────────────────
// ROOT COMPOSITION — sequences all scenes
// ─────────────────────────────────────────────
export function TutorialVideo({ scenes, durations, frameCounts, fps }) {
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: "#080810" }}>
      {scenes.map((scene, i) => {
        const durationInFrames = frameCounts?.[i] ?? Math.max(1, Math.ceil(durations[i] * fps));
        const from = offset;
        offset += durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <Scene
              scene={{ ...scene, index: i, total: scenes.length }}
              durationInFrames={durationInFrames}
              fps={fps}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
