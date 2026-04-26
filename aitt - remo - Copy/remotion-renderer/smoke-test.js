/**
 * smoke-test.js  —  full pipeline test WITH audio
 *
 * Generates a real gTTS audio file, downloads a real image,
 * then renders via Remotion. Run from main project dir:
 *
 *   node remotion-renderer/smoke-test.js
 */

const path    = require("path");
const fs      = require("fs");
const { spawn } = require("child_process");

// ── gTTS is in the MAIN project's node_modules ────────────────────
const gTTS = require("../node_modules/gtts/lib/gtts.js");

const ROOT       = path.join(__dirname, "..");
const RENDER     = path.join(__dirname, "render.js");
const OUTPUT     = path.join(ROOT, "smoke-test-output.mp4");
const TMP_JSON   = path.join(ROOT, "_render_input.json");
const AUDIO_PATH = path.join(ROOT, "audio0.mp3");

const scenes = [{
  title:       "Newton's First Law",
  explanation: "Newton's First Law states that an object at rest stays at rest, and an object in motion stays in motion unless acted upon by an external unbalanced force. This fundamental principle is known as the law of inertia.",
  imagePath:   "http://localhost:3000/scene0.png",
  audioPath:   "http://localhost:3000/audio0.mp3",
  index:       0,
  total:       1,
}];

async function run() {
  console.log("🧪 Smoke test starting...\n");

  // 1. Generate audio
  console.log("🔊 Generating TTS audio...");
  await new Promise((resolve, reject) => {
    const gtts = new gTTS(scenes[0].explanation, "en");
    gtts.save(AUDIO_PATH, (err) => (err ? reject(err) : resolve()));
  });

  // 2. Get audio duration via ffprobe
  const { execSync } = require("child_process");
  let duration;
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format "${AUDIO_PATH}"`,
      { encoding: "utf-8" }
    );
    duration = parseFloat(JSON.parse(result).format.duration);
  } catch {
    duration = 6; // fallback
  }
  console.log(`   ✅ Audio duration: ${duration.toFixed(2)}s`);

  // 3. Download image using node-fetch
  console.log("🖼️  Downloading test image...");
  try {
    const { createCanvas, loadImage } = require("../node_modules/canvas/lib/index.js");
    const canvas = createCanvas(1280, 720);
    const ctx    = canvas.getContext("2d");
    const img    = await loadImage(
      "https://image.pollinations.ai/prompt/Physics%20Newton%20motion%20laws%20illustration?width=1280&height=720&nologo=true"
    );
    ctx.drawImage(img, 0, 0, 1280, 720);
    fs.writeFileSync(path.join(ROOT, "scene0.png"), canvas.toBuffer("image/png"));
    console.log("   ✅ scene0.png saved");
  } catch (err) {
    console.warn("   ⚠️  Using fallback image (fetch failed):", err.message);
    const { createCanvas } = require("../node_modules/canvas/lib/index.js");
    const canvas = createCanvas(1280, 720);
    const ctx    = canvas.getContext("2d");
    const grad   = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, "#1e1e3a");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    fs.writeFileSync(path.join(ROOT, "scene0.png"), canvas.toBuffer("image/png"));
  }

  // 4. Write temp JSON for render.js
  fs.writeFileSync(TMP_JSON, JSON.stringify({
    scenes,
    durations:  [duration],
    outputPath: OUTPUT,
  }));
  console.log("\n🚀 Calling Remotion renderer...");

  // 5. Spawn render.js
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RENDER, TMP_JSON], {
      cwd:   __dirname,
      stdio: "inherit",
    });
    child.on("close", (code) => {
      try { fs.unlinkSync(TMP_JSON); } catch (_) {}
      code === 0 ? resolve() : reject(new Error(`Exit code ${code}`));
    });
    child.on("error", reject);
  });

  console.log("\n✅ SMOKE TEST PASSED");
  console.log("   Output:", OUTPUT);
  console.log("   Open the file to visually verify motion effects + audio sync.");
}

run().catch((err) => {
  console.error("\n❌ SMOKE TEST FAILED:", err.message);
  process.exit(1);
});
