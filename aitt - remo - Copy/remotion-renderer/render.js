/**
 * render.js  (CommonJS — called by createRemotionVideo.js via child_process.spawn)
 *
 * Usage:
 *   node render.js <pathToInputJson>
 *
 * Input JSON shape:
 *   { scenes: Scene[], durations: number[], outputPath: string }
 *
 * Each Scene:
 *   { title, explanation, imagePath, audioPath, index, total }
 *   imagePath / audioPath must be HTTP URLs (http://localhost:3000/...)
 */

const path  = require("path");
const fs    = require("fs");
const { bundle }                                         = require("@remotion/bundler");
const { renderMedia, selectComposition, ensureBrowser }  = require("@remotion/renderer");

const FPS = 30;

async function main() {
  const [, , inputJsonPath] = process.argv;

  if (!inputJsonPath) {
    console.error("❌ Usage: node render.js <inputJson>");
    process.exit(1);
  }

  const { scenes, durations, outputPath } = JSON.parse(
    fs.readFileSync(inputJsonPath, "utf-8")
  );

  // ── Compute exact total frames for audio sync ──────────────────
  // Each scene's frame count = ceil(duration * FPS)
  // The <Audio> component in a <Sequence durationInFrames={n}> plays
  // exactly n frames worth of audio → perfect sync by design.
  const frameCounts  = durations.map((d) => Math.max(1, Math.ceil(d * FPS)));
  const totalFrames  = frameCounts.reduce((s, n) => s + n, 0);

  console.log(`🎬 Remotion: ${scenes.length} scenes | ${totalFrames} total frames | FPS: ${FPS}`);
  scenes.forEach((s, i) =>
    console.log(`   Scene ${i + 1}: "${s.title}" — ${frameCounts[i]} frames (${durations[i].toFixed(2)}s)`)
  );

  // 1.  Ensure Chrome Headless Shell is present (cached after first download)
  console.log("\n🌐 Ensuring browser...");
  await ensureBrowser();

  // 2.  Webpack-bundle the Remotion React composition
  const entryPoint = path.join(__dirname, "src", "index.jsx");
  console.log("📦 Bundling composition...");
  const bundleLocation = await bundle({ entryPoint });

  // 3.  Select composition & inject inputProps
  const inputProps = { scenes, durations, frameCounts, fps: FPS };

  console.log("🎯 Selecting composition...");
  const composition = await selectComposition({
    serveUrl:   bundleLocation,
    id:         "TutorialVideo",
    inputProps,
  });

  // ── Override the duration based on actual audio lengths ──────────
  composition.durationInFrames = totalFrames;

  // 4.  Render → H.264 MP4
  console.log(`\n🎥 Rendering → ${outputPath}`);
  await renderMedia({
    composition,
    serveUrl:      bundleLocation,
    codec:         "h264",
    outputLocation: outputPath,
    inputProps,
    concurrency:   2,                           // 2 parallel tabs — good balance
    onProgress: ({ progress, renderedFrames }) => {
      const pct = Math.round(progress * 100);
      process.stdout.write(`\r  ⏳ ${pct}% (${renderedFrames}/${totalFrames} frames)`);
    },
    chromiumOptions: {
      disableWebSecurity: true,                 // allow loading http://localhost resources
      gl: "angle",                              // more stable on Windows
    },
  });

  console.log(`\n✅ Remotion render complete → ${path.basename(outputPath)}`);
}

main().catch((err) => {
  console.error("\n❌ Render failed:", err.message || err);
  process.exit(1);
});
