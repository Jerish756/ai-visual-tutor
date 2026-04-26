import fs from "fs";
import path from "path";

const HISTORY_FILE = "./data/chat-history.json";

// Ensure data directory exists
if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data", { recursive: true });
}

// Initialize history file if it doesn't exist
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ sessions: [] }, null, 2));
}

/**
 * Load all chat history sessions
 */
export function getAllSessions() {
  try {
    const data = fs.readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(data);
    const sessions = Array.isArray(parsed) ? parsed : parsed.sessions;
    if (!Array.isArray(sessions)) return [];
    return sessions.map(normalizeSession);
  } catch (err) {
    console.error("Error reading history:", err);
    return [];
  }
}

/**
 * Get a specific session by ID
 */
export function getSession(sessionId) {
  const sessions = getAllSessions();
  return sessions.find(s => s.id === sessionId);
}

/**
 * Create a new chat session
 */
export function createSession(topic, difficulty, uploadedFile = null) {
  const sessions = getAllSessions();
  const session = {
    id: Date.now().toString(),
    topic: topic || "PDF Upload",
    difficulty,
    uploadedFile,
    startTime: new Date().toISOString(),
    endTime: null,
    messages: [],
    videos: [],
    quizzes: []
  };
  sessions.unshift(session);
  saveHistory(sessions);
  return session;
}

/**
 * Add a message to a session
 */
export function addMessage(sessionId, role, content) {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const message = {
    id: Date.now().toString(),
    role, // 'user' or 'bot'
    content,
    timestamp: new Date().toISOString()
  };

  session.messages.push(message);
  saveHistory(sessions);
  return message;
}

/**
 * Add a generated video to a session
 */
export function addVideo(sessionId, videoUrl, scenes = null) {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const video = {
    id: Date.now().toString(),
    url: videoUrl,
    scenes,
    generatedAt: new Date().toISOString()
  };

  session.videos.push(video);
  saveHistory(sessions);
  return video;
}

/**
 * Add quiz data to a session
 */
export function addQuiz(sessionId, questions, answers, score, accuracy) {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const quiz = {
    id: Date.now().toString(),
    questions,
    userAnswers: answers,
    score, // e.g., 6/8
    accuracy, // e.g., 75%
    completedAt: new Date().toISOString()
  };

  session.quizzes.push(quiz);
  saveHistory(sessions);
  return quiz;
}

/**
 * End a session
 */
export function endSession(sessionId) {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  session.endTime = new Date().toISOString();
  saveHistory(sessions);
  return session;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId) {
  let sessions = getAllSessions();
  sessions = sessions.filter(s => s.id !== sessionId);
  saveHistory(sessions);
  return true;
}

/**
 * Save history to file
 */
function saveHistory(sessions) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ sessions }, null, 2));
  } catch (err) {
    console.error("Error saving history:", err);
  }
}

/**
 * Get session summary for display
 */
export function getSessionSummary(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  return {
    id: session.id,
    topic: session.topic,
    difficulty: session.difficulty,
    startTime: session.startTime,
    endTime: session.endTime,
    messageCount: session.messages.length,
    videoCount: session.videos.length,
    quizCount: session.quizzes.length,
    totalAccuracy: calculateAverageAccuracy(session.quizzes)
  };
}

/**
 * Calculate average accuracy across all quizzes in a session
 */
function calculateAverageAccuracy(quizzes) {
  if (!quizzes || quizzes.length === 0) return null;
  const total = quizzes.reduce((sum, q) => sum + parseInt(q.accuracy), 0);
  return Math.round(total / quizzes.length);
}

function normalizeSession(session) {
  return {
    id: session.id || Date.now().toString(),
    topic: session.topic || "Untitled session",
    difficulty: session.difficulty || "school",
    uploadedFile: session.uploadedFile || null,
    startTime: session.startTime || new Date().toISOString(),
    endTime: session.endTime || null,
    messages: Array.isArray(session.messages) ? session.messages.map(normalizeMessage) : [],
    videos: Array.isArray(session.videos) ? session.videos : [],
    quizzes: Array.isArray(session.quizzes) ? session.quizzes : []
  };
}

function normalizeMessage(message) {
  return {
    id: message.id || Date.now().toString(),
    role: message.role || (message.sender === "user" ? "user" : "bot"),
    content: message.content || message.message || "",
    timestamp: message.timestamp || new Date().toISOString()
  };
}
