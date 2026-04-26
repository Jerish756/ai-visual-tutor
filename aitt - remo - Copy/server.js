import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import multer from "multer";

import { createAudio } from "./utils/createAudio.js";
import { createRemotionVideo } from "./utils/createRemotionVideo.js";
import { ingestHFDataset, ingestPDF } from "./rag/ingest.js";
import { getRelevantContext } from "./rag/query.js";
import {
  createSession,
  getSession,
  getAllSessions,
  addMessage,
  addVideo,
  addQuiz,
  endSession,
  deleteSession,
  getSessionSummary
} from "./chat-history.js";
import {
  claimNextRenderJob,
  completeRenderJob,
  createRenderJob,
  failRenderJob,
  getRenderJob
} from "./render-jobs.js";

dotenv.config();

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function extractText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl: "./node_modules/pdfjs-dist/standard_fonts/"
  }).promise;

  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    text += content.items.map(i => i.str).join(" ") + "\n";
  }

  return text;
}
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(express.static(".")); // serve videos

// ================= MULTER =================
const upload = multer({
  dest: "uploads/"
});
const resultUpload = multer({
  dest: "uploads/"
});

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VIDEO_RENDER_MODE = process.env.VIDEO_RENDER_MODE || "local";
const RENDER_WORKER_TOKEN = process.env.RENDER_WORKER_TOKEN || "";

// ================= DIFFICULTY =================
const difficultyGuide = {
  school: "Use very simple language, basic concepts, real-life examples.",
  bachelors: "Include technical terms, moderate depth, some theory.",
  masters: "Deep explanation, advanced concepts, detailed reasoning."
};

// ================= CLEAN FILES =================
function cleanFiles() {
  const files = fs.readdirSync("./");
  files.forEach(file => {
    if (
      file.startsWith("scene")   ||   // scene PNGs downloaded per render
      file.startsWith("audio")        // narration MP3s per scene
      // NOTE: DO NOT delete output_*.mp4 or upload_*.mp4 files — these are final videos for serving
    ) {
      try { fs.unlinkSync(file); } catch (_) {}
    }
  });
}

function requireWorkerAuth(req, res, next) {
  if (!RENDER_WORKER_TOKEN) {
    return res.status(500).json({ error: "RENDER_WORKER_TOKEN is not configured" });
  }

  const token = req.headers["x-render-worker-token"];
  if (token !== RENDER_WORKER_TOKEN) {
    return res.status(401).json({ error: "Unauthorized worker" });
  }

  next();
}

async function renderOrQueueVideo({ scenes, videoPrefix, topic, difficulty, sourceType }) {
  if (VIDEO_RENDER_MODE === "worker") {
    const job = createRenderJob({
      topic,
      difficulty,
      sourceType,
      videoPrefix,
      scenes
    });

    return {
      queued: true,
      jobId: job.id,
      status: job.status
    };
  }

  const durations = await createAudio(scenes);
  const videoName = `${videoPrefix}_${Date.now()}.mp4`;
  await createRemotionVideo(scenes, durations, videoName);

  return {
    queued: false,
    video: `/${videoName}`
  };
}

// ================= GENERATE VIDEO FROM TOPIC =================
app.post("/generate", async (req, res) => {
  const { topic, difficulty } = req.body;

  try {
    cleanFiles();
    // 🔍 RAG CONTEXT
    const context = await getRelevantContext(topic);
    const hasContext = context && context.length > 50;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are an expert teacher explaining "${topic}" at ${difficulty} level.

${difficultyGuide[difficulty]}

${hasContext ? `Use this reference material as your base:\n${context}` : "Use your own knowledge."}

STRICT RULES:
- Return ONLY JSON
- Do NOT write "JSON:"
- Do NOT include explanation before or after
- Do NOT use markdown
- Output must start with [ and end with ]
- Generate 5 to 7 scenes
- Each explanation must be 3 to 4 sentences long
- Start from the basics and build up gradually — like a lecture
- Each scene must explain WHY the concept works, not just WHAT it is
- Use real world examples where possible
- The last scene should summarize and connect all previous scenes together

FORMAT:
[
 { "title": "", "visual": "", "explanation": "" }
]`
          }
        ]
      })
    });

    const data = await response.json();
    const output = data.choices[0].message.content;

    let scenes;

try {
  // 🔥 Try to extract all individual arrays and combine them
  const arrays = output.match(/\[\s*\{[\s\S]*?\}\s*\]/g);

  if (arrays && arrays.length > 0) {
    scenes = [];
    for (const arr of arrays) {
      const parsed = JSON.parse(arr);
      if (Array.isArray(parsed)) {
        scenes = scenes.concat(parsed);
      }
    }
  } else {
    // 🔥 FALLBACK: try normal single array extraction
    const match = output.match(/\[\s*{[\s\S]*}\s*\]/);
    if (match) {
      scenes = JSON.parse(match[0]);
    } else {
      // 🔥 FALLBACK 2: extract individual objects
      const objects = output.match(/{[\s\S]*?}/g);
      if (!objects) throw new Error("No JSON found");
      scenes = objects.map(obj => JSON.parse(obj));
    }
  }

} catch (err) {
  console.log("❌ PARSE ERROR:", err);
  console.log("❌ RAW AI OUTPUT:\n", output);
  return res.status(500).json({ error: "AI format error" });
}
    if (!Array.isArray(scenes) || scenes.length < 3) {
  console.log("❌ Invalid scenes:", scenes);
  return res.status(500).json({ error: "Invalid scenes generated" });
}
    const renderResult = await renderOrQueueVideo({
      scenes,
      videoPrefix: "output",
      topic,
      difficulty,
      sourceType: "topic"
    });

    if (!renderResult.queued) {
      const videoPath = path.join(process.cwd(), renderResult.video.slice(1));
      if (!fs.existsSync(videoPath)) {
        console.error("❌ Video file not found after generation:", videoPath);
        return res.status(500).json({ error: "Video file was not created" });
      }
    }

    res.json(renderResult);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Video generation failed" });
  }
});

// ================= GENERATE QUIZ =================
app.post("/generate-quiz", async (req, res) => {
  const { topic, difficulty } = req.body;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are an expert teacher. Generate 8 MCQs on "${topic}" at ${difficulty} level.

${difficultyGuide[difficulty]}

STRICT RULES:
- Each answer MUST be EXACTLY one of the options
- Do NOT use A/B/C/D labels
- Answer must match option text exactly
- Do NOT repeat similar questions
- Questions must test understanding, not just memorization
- Include questions that ask WHY and HOW, not just WHAT
- Wrong options must be plausible, not obviously incorrect
- Vary difficulty across questions — start easy, get harder

Return ONLY JSON, no explanation before or after:
[
 {
   "question": "",
   "options": ["", "", "", ""],
   "answer": ""
 }
]`
          }
        ]
      })
    });

    const data = await response.json();
    const output = data.choices[0].message.content;

    const match = output.match(/\[\s*{[\s\S]*}\s*\]/);
    const quiz = JSON.parse(match[0]);

    res.json(quiz);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Quiz generation failed" });
  }
});

// ================= UPLOAD → VIDEO =================
app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;

  try {
    console.log("📄 Uploaded:", filePath);
    cleanFiles();
    // ✅ Store in RAG
    await ingestPDF(filePath);

    // ❗ Simple version (we'll upgrade to RAG later)
    // 🔍 Get relevant context from RAG
    // 🔍 Get relevant context from RAG
const text = await extractText(filePath);

// Extract a clean intro chunk — skip blank lines, take first ~500 chars of real content
const uploadTopic = req.body.topic || "";
const cleanIntro = uploadTopic
  ? uploadTopic
  : text.split("\n").filter(line => line.trim().length > 20).slice(0, 5).join(" ").slice(0, 500);
const context = await getRelevantContext(cleanIntro);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are an expert teacher. Convert the following study material into detailed learning scenes${uploadTopic ? ` focused on "${uploadTopic}"` : ""}.
${context}

STRICT RULES:
- Return ONLY valid JSON
- Do NOT include any explanation outside JSON
- Output must be an ARRAY of 5 to 7 scenes
- Each explanation must be 3 to 4 sentences long with real reasoning, not just definitions
- Build each scene on the previous one — like a lecture, not isolated facts
- Include why the concept matters, not just what it is

FORMAT:
[
  {
    "title": "",
    "visual": "",
    "explanation": ""
  }
]`
          }
        ]
      })
    });

    const data = await response.json();
    const output = data.choices[0].message.content;

    let scenes;
try {
  const match = output.match(/\[\s*\{[\s\S]*\}/);
  if (match) {
    let raw = match[0].trim();
    if (!raw.endsWith(']')) raw += ']';
    scenes = JSON.parse(raw);
  } else {
    const objects = output.match(/\{[\s\S]*?\}/g);
    if (!objects) throw new Error("No JSON found");
    scenes = objects.map(obj => JSON.parse(obj));
  }
} catch (err) {
  console.log("❌ JSON PARSE ERROR:", err);
  console.log("❌ RAW AI OUTPUT:\n", output);
  return res.status(500).json({ error: "JSON parse failed" });
}

    const renderResult = await renderOrQueueVideo({
      scenes,
      videoPrefix: "upload",
      topic: uploadTopic || req.file.originalname || "PDF upload",
      difficulty: req.body.difficulty,
      sourceType: "pdf"
    });

    if (!renderResult.queued) {
      const videoPath = path.join(process.cwd(), renderResult.video.slice(1));
      if (!fs.existsSync(videoPath)) {
        console.error("❌ Video file not found after generation:", videoPath);
        return res.status(500).json({ error: "Video file was not created" });
      }
    }

    res.json(renderResult);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload video failed" });
  }
});

// ================= UPLOAD → QUIZ =================
app.post("/upload-quiz", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  try {
    const text = await extractText(filePath);
    const uploadTopic = req.body.topic || "";

    // build focused context — if topic given, find most relevant paragraphs
    let focusedText;
    if (uploadTopic) {
      const paras = text.split("\n").filter(l => l.trim().length > 30);
      const relevant = paras.filter(p =>
        p.toLowerCase().includes(uploadTopic.toLowerCase())
      );
      focusedText = (relevant.length > 0 ? relevant : paras).slice(0, 20).join("\n").slice(0, 3000);
    } else {
      focusedText = text.split("\n").filter(l => l.trim().length > 30).slice(0, 20).join("\n").slice(0, 3000);
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are an expert teacher. Based STRICTLY on the following study material${uploadTopic ? ` focused on "${uploadTopic}"` : ""}, generate 8 MCQs.

CONTENT:
${focusedText}

STRICT RULES:
- Every question MUST come directly from the content above
- Do NOT use outside knowledge
- Each answer MUST be EXACTLY one of the options
- Do NOT use A/B/C/D labels
- Answer must match option text exactly
- Wrong options must be plausible but clearly wrong based on the content
- Test understanding not just memorization
- Cover different sections of the content

Return ONLY a JSON array, no text before or after:
[
  { "question": "", "options": ["", "", "", ""], "answer": "" }
]`
          }
        ]
      })
    });

    const data = await response.json();
    const output = data.choices[0].message.content;

    let quiz;
    try {
      const match = output.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        quiz = JSON.parse(match[0]);
      } else {
        const objects = output.match(/\{[\s\S]*?\}/g);
        if (!objects) throw new Error("No JSON found");
        quiz = objects.map(obj => JSON.parse(obj));
      }
    } catch (err) {
      console.log("❌ PARSE ERROR:", err);
      console.log("❌ RAW OUTPUT:\n", output);
      return res.status(500).json({ error: "JSON parse failed" });
    }

    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload quiz failed" });
  }
});

// ================= HUGGING FACE DATASET -> RAG =================
app.post("/api/rag/huggingface", async (req, res) => {
  const {
    dataset,
    config,
    split,
    textColumns,
    maxRows,
    subject
  } = req.body;

  try {
    const result = await ingestHFDataset({
      dataset,
      config,
      split,
      textColumns,
      maxRows,
      subject,
      token: process.env.HF_TOKEN
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error("Hugging Face dataset ingest failed:", err);
    res.status(500).json({
      error: err.message || "Hugging Face dataset ingest failed"
    });
  }
});

// ================= RENDER JOBS =================
app.get("/api/render-jobs/:id", (req, res) => {
  const job = getRenderJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Render job not found" });
  }

  res.json({
    id: job.id,
    status: job.status,
    videoUrl: job.videoUrl,
    error: job.error,
    topic: job.topic,
    difficulty: job.difficulty,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  });
});

app.post("/api/render-jobs/claim", requireWorkerAuth, (req, res) => {
  const workerId = req.body?.workerId || "local-worker";
  const job = claimNextRenderJob(workerId);

  if (!job) {
    return res.json({ job: null });
  }

  res.json({
    job: {
      id: job.id,
      topic: job.topic,
      difficulty: job.difficulty,
      scenes: job.scenes,
      sourceType: job.sourceType,
      videoPrefix: job.videoPrefix
    }
  });
});

app.post("/api/render-jobs/:id/complete", requireWorkerAuth, resultUpload.single("video"), (req, res) => {
  const job = getRenderJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Render job not found" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Video file is required" });
  }

  const fileName = `${job.videoPrefix || "video"}_${job.id}.mp4`;
  const targetPath = path.join(process.cwd(), fileName);
  fs.copyFileSync(req.file.path, targetPath);
  try { fs.unlinkSync(req.file.path); } catch (_) {}

  const updated = completeRenderJob(job.id, `/${fileName}`);
  res.json(updated);
});

app.post("/api/render-jobs/:id/fail", requireWorkerAuth, (req, res) => {
  const updated = failRenderJob(req.params.id, req.body?.error);
  if (!updated) {
    return res.status(404).json({ error: "Render job not found" });
  }

  res.json(updated);
});

// ================= HISTORY ENDPOINTS =================

// Create a new session
app.post("/api/session/create", (req, res) => {
  const { topic, difficulty, uploadedFile } = req.body;
  const session = createSession(topic, difficulty, uploadedFile);
  res.json(session);
});

// Get all sessions
app.get("/api/sessions", (req, res) => {
  const sessions = getAllSessions().map(s => ({
    id: s.id,
    topic: s.topic,
    difficulty: s.difficulty,
    startTime: s.startTime,
    endTime: s.endTime,
    uploadedFile: s.uploadedFile,
    messageCount: s.messages.length,
    videoCount: s.videos.length,
    quizCount: s.quizzes.length,
    totalAccuracy: s.quizzes.length > 0 
      ? Math.round(s.quizzes.reduce((sum, q) => sum + parseInt(q.accuracy), 0) / s.quizzes.length)
      : null
  }));
  res.json(sessions);
});

// Get full session details
app.get("/api/session/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// Add message to session
app.post("/api/session/:id/message", (req, res) => {
  const { role, content } = req.body;
  const message = addMessage(req.params.id, role, content);
  if (!message) return res.status(404).json({ error: "Session not found" });
  res.json(message);
});

// Add video to session
app.post("/api/session/:id/video", (req, res) => {
  const { videoUrl, scenes } = req.body;
  const video = addVideo(req.params.id, videoUrl, scenes);
  if (!video) return res.status(404).json({ error: "Session not found" });
  res.json(video);
});

// Add quiz result to session
app.post("/api/session/:id/quiz", (req, res) => {
  const { questions, userAnswers, score, accuracy } = req.body;
  const quiz = addQuiz(req.params.id, questions, userAnswers, score, accuracy);
  if (!quiz) return res.status(404).json({ error: "Session not found" });
  res.json(quiz);
});

// End a session
app.post("/api/session/:id/end", (req, res) => {
  const session = endSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// Delete a session
app.delete("/api/session/:id", (req, res) => {
  const success = deleteSession(req.params.id);
  res.json({ success });
});

// ================= CHAT HISTORY =================
// Keep legacy chat log separate from session history to avoid file-format conflicts.
const chatHistoryPath = "./data/live-chat-log.json";

// Helper function to load chat history
function loadChatHistory() {
  if (!fs.existsSync(chatHistoryPath)) {
    return [];
  }
  const data = fs.readFileSync(chatHistoryPath, "utf-8");
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed : [];
}

// Helper function to save chat history
function saveChatHistory(history) {
  fs.writeFileSync(chatHistoryPath, JSON.stringify(history, null, 2));
}

// Endpoint to save a chat message
app.post("/chat/save", upload.single("media"), (req, res) => {
  const { message, sender, timestamp } = req.body;
  const media = req.file ? `/uploads/${req.file.filename}` : null;

  const chatHistory = loadChatHistory();
  const newMessage = { message, sender, timestamp, media };
  chatHistory.push(newMessage);
  saveChatHistory(chatHistory);

  res.status(200).json({ success: true, message: "Chat saved successfully." });
});

// Endpoint to retrieve chat history
app.get("/chat/history", (req, res) => {
  const chatHistory = loadChatHistory();
  res.status(200).json(chatHistory);
});

// ================= START SERVER =================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
