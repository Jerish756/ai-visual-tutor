import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fs from "fs";
import path from "path";
import { Blob } from "buffer";
import { fileURLToPath } from "url";

import { createAudio } from "./utils/createAudio.js";
import { createRemotionVideo } from "./utils/createRemotionVideo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = __dirname;
const REMOTE_API = process.env.REMOTE_API_URL;
const RENDER_WORKER_TOKEN = process.env.RENDER_WORKER_TOKEN;
const LOCAL_ASSET_PORT = Number(process.env.LOCAL_ASSET_PORT || 3100);
const POLL_INTERVAL_MS = Number(process.env.RENDER_WORKER_POLL_MS || 5000);
const WORKER_ID = process.env.RENDER_WORKER_ID || "home-pc";

if (!REMOTE_API) {
  throw new Error("REMOTE_API_URL is required for render-worker.js");
}

if (!RENDER_WORKER_TOKEN) {
  throw new Error("RENDER_WORKER_TOKEN is required for render-worker.js");
}

process.env.LOCAL_ASSET_PORT = String(LOCAL_ASSET_PORT);

startAssetServer();
runWorkerLoop().catch(err => {
  console.error("Render worker crashed:", err);
  process.exit(1);
});

function startAssetServer() {
  const app = express();
  app.use(express.static(ROOT_DIR));
  app.listen(LOCAL_ASSET_PORT, "127.0.0.1", () => {
    console.log(`Local asset server running on http://127.0.0.1:${LOCAL_ASSET_PORT}`);
  });
}

async function runWorkerLoop() {
  console.log(`Render worker polling ${REMOTE_API} as ${WORKER_ID}`);

  while (true) {
    try {
      const job = await claimJob();
      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      await processJob(job);
    } catch (err) {
      if (err.message.includes("fetch failed") || err.code === "ECONNREFUSED") {
        console.log("📡 Render server is sleeping or unreachable. Retrying in 10s...");
        await sleep(10000);
      } else {
        console.error("Worker loop error:", err.message || err);
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }
}

async function claimJob() {
  const res = await fetch(`${REMOTE_API}/api/render-jobs/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-worker-token": RENDER_WORKER_TOKEN
    },
    body: JSON.stringify({ workerId: WORKER_ID })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Could not claim render job");
  }

  return data.job;
}

async function processJob(job) {
  console.log(`Processing job ${job.id} (${job.topic || "Untitled"})`);
  cleanupRenderFiles();

  try {
    const durations = await createAudio(job.scenes);
    const outputName = `${job.videoPrefix || "video"}_${job.id}.mp4`;
    await createRemotionVideo(job.scenes, durations, outputName);
    
    // ⏳ Wait a moment for Windows to release the file lock
    console.log("  ⏳ Waiting for file system to release lock...");
    await sleep(2000);
    
    await uploadResult(job.id, path.join(ROOT_DIR, outputName));
    cleanupRenderFiles();
  } catch (err) {
    console.error(`Job ${job.id} failed:`, err.message || err);
    await markFailed(job.id, err.message || "Render failed");
    cleanupRenderFiles();
  }
}

async function uploadResult(jobId, filePath) {
  const form = new FormData();
  const buffer = fs.readFileSync(filePath);
  form.append("video", new Blob([buffer], { type: "video/mp4" }), path.basename(filePath));

  const res = await fetch(`${REMOTE_API}/api/render-jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      "x-render-worker-token": RENDER_WORKER_TOKEN
    },
    body: form
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Could not upload rendered video");
  }

  console.log(`Job ${jobId} uploaded successfully`);
}

async function markFailed(jobId, errorMessage) {
  await fetch(`${REMOTE_API}/api/render-jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-worker-token": RENDER_WORKER_TOKEN
    },
    body: JSON.stringify({ error: errorMessage })
  });
}

function cleanupRenderFiles() {
  const files = fs.readdirSync(ROOT_DIR);
  files.forEach(file => {
    if (
      file.startsWith("scene") ||
      file.startsWith("audio") ||
      file.startsWith("_render_input") ||
      /^output_\d+\.mp4$/.test(file) ||
      /^upload_\d+\.mp4$/.test(file)
    ) {
      try {
        fs.unlinkSync(path.join(ROOT_DIR, file));
      } catch (_) {}
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
