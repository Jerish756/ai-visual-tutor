import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { loadImage, createCanvas } from "canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDER_SCRIPT = path.join(__dirname, "..", "remotion-renderer", "render.js");
const ROOT_DIR      = path.join(__dirname, "..");

const FPS       = 30;
const ASSET_PORT = process.env.LOCAL_ASSET_PORT || process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────
// 1.  Download background images → save locally as scene{i}.png
//     Use HTTP URLs (localhost) so headless Chrome can load them
//     without file:// CORS issues
// ─────────────────────────────────────────────────────────────────
async function downloadImages(scenes) {
  const enriched = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene     = scenes[i];
    const localPath = path.join(ROOT_DIR, `scene${i}.png`);
    const prompt    = encodeURIComponent(`${scene.title}, educational illustration, vibrant colors`);
    const url       = `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true`;

    console.log(`🖼️  Downloading scene ${i} image...`);
    await new Promise((r) => setTimeout(r, i * 400)); // stagger to avoid hammering

    try {
      const canvas = createCanvas(1280, 720);
      const ctx    = canvas.getContext("2d");
      const img    = await loadImage(url);
      ctx.drawImage(img, 0, 0, 1280, 720);
      fs.writeFileSync(localPath, canvas.toBuffer("image/png"));
      console.log(`  ✅ scene${i}.png saved`);
    } catch (err) {
      console.warn(`  ⚠️  scene${i} using fallback gradient`);
      const canvas = createCanvas(1280, 720);
      const ctx    = canvas.getContext("2d");
      const colors = [
        ["#1e1e3a", "#0f172a"],
        ["#0d2137", "#1a3a5c"],
        ["#1a0d37", "#3a1a5c"],
        ["#0d3729", "#1a5c3a"],
      ];
      const [c1, c2] = colors[i % colors.length];
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);
      fs.writeFileSync(localPath, canvas.toBuffer("image/png"));
    }

    // ✅ Use HTTP URL — Express serves ./ statically, no file:// CORS issues
    enriched.push({
      ...scene,
      imagePath: `http://127.0.0.1:${ASSET_PORT}/scene${i}.png`,
      audioPath: `http://127.0.0.1:${ASSET_PORT}/${fs.existsSync(path.join(ROOT_DIR, `audio${i}.wav`)) ? `audio${i}.wav` : `audio${i}.mp3`}`,
    });
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────────────
// 2.  Spawn render.js child process
//     Pass scenes & durations as temp JSON file (avoids CLI length limits)
// ─────────────────────────────────────────────────────────────────
function runRemotionRender(scenes, durations, outputPath) {
  return new Promise((resolve, reject) => {
    // Write to a temp JSON file — avoids PowerShell arg-length / special-char issues
    const tmpFile = path.join(ROOT_DIR, "_render_input.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ scenes, durations, outputPath }));

    console.log("🚀 Spawning Remotion renderer...");

    const child = spawn(
      process.execPath,
      [RENDER_SCRIPT, tmpFile],
      {
        cwd:   path.join(__dirname, "..", "remotion-renderer"),
        stdio: "inherit",
        env:   { ...process.env },
      }
    );

    child.on("close", (code) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      if (code === 0) resolve();
      else reject(new Error(`Remotion renderer exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────
// 3.  Main export
// ─────────────────────────────────────────────────────────────────
export async function createRemotionVideo(scenes, durations, outputName) {
  const enrichedScenes = await downloadImages(scenes);
  const outputPath     = path.join(ROOT_DIR, outputName);

  await runRemotionRender(enrichedScenes, durations, outputPath);
  console.log("🎉 Remotion video ready:", outputName);
}
