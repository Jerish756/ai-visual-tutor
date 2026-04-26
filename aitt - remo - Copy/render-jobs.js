import fs from "fs";

const JOBS_FILE = "./data/render-jobs.json";

ensureJobsFile();

export function createRenderJob(payload) {
  const jobs = loadJobs();
  const job = {
    id: Date.now().toString(),
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
    error: null,
    videoUrl: null,
    workerId: null,
    ...payload
  };

  jobs.unshift(job);
  saveJobs(jobs);
  return job;
}

export function getRenderJob(jobId) {
  const jobs = loadJobs();
  return jobs.find(job => job.id === jobId) || null;
}

export function claimNextRenderJob(workerId = "local-worker") {
  const jobs = loadJobs();
  const job = jobs.find(item => item.status === "queued");

  if (!job) {
    return null;
  }

  job.status = "processing";
  job.workerId = workerId;
  job.claimedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();
  saveJobs(jobs);
  return job;
}

export function completeRenderJob(jobId, videoUrl) {
  const jobs = loadJobs();
  const job = jobs.find(item => item.id === jobId);
  if (!job) return null;

  job.status = "completed";
  job.videoUrl = videoUrl;
  job.completedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();
  job.error = null;
  saveJobs(jobs);
  return job;
}

export function failRenderJob(jobId, errorMessage) {
  const jobs = loadJobs();
  const job = jobs.find(item => item.id === jobId);
  if (!job) return null;

  job.status = "failed";
  job.error = errorMessage || "Unknown render error";
  job.updatedAt = new Date().toISOString();
  saveJobs(jobs);
  return job;
}

function ensureJobsFile() {
  if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data", { recursive: true });
  }

  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify({ jobs: [] }, null, 2));
  }
}

function loadJobs() {
  try {
    const data = fs.readFileSync(JOBS_FILE, "utf8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch (err) {
    console.error("Error loading render jobs:", err);
    return [];
  }
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify({ jobs }, null, 2));
}
