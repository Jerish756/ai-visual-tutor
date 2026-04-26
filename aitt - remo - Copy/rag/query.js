import dotenv from "dotenv";
dotenv.config();

import { pipeline } from "@xenova/transformers";
import { Pinecone } from "@pinecone-database/pinecone";

// ✅ Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

const index = pinecone.Index("ai-tutor");
const MIN_RELEVANCE_SCORE = 0.5;

// ✅ Load embedding model
let extractor;

async function loadModel() {
  extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
}

// 🔹 Convert query to embedding
async function getEmbedding(text) {
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true
  });

  let embedding = null;

  if (output?.data?.length) {
    embedding = output.data;
  } else if (Array.isArray(output) && output[0]?.length) {
    embedding = output[0];
  }

  if (!embedding) {
    console.log("Failed to extract query embedding:", output);
    return [];
  }

  return Array.from(embedding);
}

// 🔥 MAIN FUNCTION
export async function getRelevantContext(topic) {
  if (!extractor) {
    console.log("⏳ Loading embedding model...");
    await loadModel();
  }

  const embedding = await getEmbedding(topic);

  if (!embedding.length) {
    return "";
  }

  const result = await index.query({
    vector: embedding,
    topK: 5,
    includeMetadata: true
  });

  const matches = result.matches || [];

const topScore = matches[0]?.score ?? 0;

if (!matches.length || topScore < MIN_RELEVANCE_SCORE) {
  console.log(
    `⚠️ No relevant Pinecone match for "${topic}". Top score: ${topScore}`
  );
  return "";
}

// ✅ Filter low-quality matches
const filteredMatches = matches.filter(
  match => match.score >= MIN_RELEVANCE_SCORE
);

if (filteredMatches.length === 0) {
  console.log(`⚠️ All matches below threshold for "${topic}"`);
  return "";
}

// ✅ Build clean context
const context = filteredMatches
  .map(match => match.metadata.text)
  .join("\n\n")
  .slice(0, 3000);

return context;
}
