import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { pipeline } from "@xenova/transformers";
import { Pinecone } from "@pinecone-database/pinecone";

const HF_DATASETS_BASE_URL = "https://datasets-server.huggingface.co";
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_DATASET_ROW_LIMIT = 100;
const MAX_DATASET_ROW_LIMIT = 500;

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

const indexName = process.env.PINECONE_INDEX || "ai-tutor";
const indexHost = process.env.PINECONE_HOST || "ai-tutor-hikzjgf.svc.aped-4627-b74a.pinecone.io";
const index = pinecone.index(indexName, indexHost);

let extractor;

async function loadModel() {
  if (!extractor) {
    console.log("Loading embedding model...");
    extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }
}

async function extractTextFromPDF(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(" ") + "\n";
  }

  return text;
}

function chunkText(text, size = DEFAULT_CHUNK_SIZE) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  const chunks = [];

  for (let i = 0; i < cleaned.length; i += size) {
    chunks.push(cleaned.slice(i, i + size));
  }

  return chunks.filter(chunk => chunk.trim().length > 50);
}

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
    console.log("Failed to extract embedding:", output);
    return [];
  }

  return Array.from(embedding);
}

function buildVectorId(sourceId, chunkIndex) {
  const hash = crypto
    .createHash("sha1")
    .update(`${sourceId}:${chunkIndex}`)
    .digest("hex");

  return `${hash}-${chunkIndex}`;
}

function sanitizeTextColumns(textColumns) {
  if (!textColumns) return [];
  if (Array.isArray(textColumns)) {
    return textColumns.map(col => String(col).trim()).filter(Boolean);
  }

  return String(textColumns)
    .split(",")
    .map(col => col.trim())
    .filter(Boolean);
}

function flattenStringValues(value, bucket = []) {
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (cleaned) bucket.push(cleaned);
    return bucket;
  }

  if (Array.isArray(value)) {
    value.forEach(item => flattenStringValues(item, bucket));
    return bucket;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(item => flattenStringValues(item, bucket));
  }

  return bucket;
}

function extractDatasetRowText(row, textColumns = []) {
  if (!row || typeof row !== "object") return "";

  if (textColumns.length > 0) {
    const selected = textColumns
      .map(column => row[column])
      .flatMap(value => flattenStringValues(value))
      .join("\n");

    if (selected.trim()) {
      return selected;
    }
  }

  return Object.entries(row)
    .filter(([, value]) => {
      if (typeof value === "string") return true;
      if (Array.isArray(value)) return value.some(item => typeof item === "string");
      return false;
    })
    .flatMap(([, value]) => flattenStringValues(value))
    .join("\n");
}

async function fetchJson(url, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.json();
}

async function resolveDatasetConfigAndSplit(dataset, config, split, token) {
  if (config && split) {
    return { config, split };
  }

  const params = new URLSearchParams({ dataset });
  const data = await fetchJson(`${HF_DATASETS_BASE_URL}/splits?${params}`, token);
  const firstSplit = data?.splits?.[0];

  if (!firstSplit) {
    throw new Error("Could not resolve dataset config/split");
  }

  return {
    config: config || firstSplit.config,
    split: split || firstSplit.split
  };
}

async function upsertTextChunks(chunks, sourceMeta) {
  let storedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const embedding = await getEmbedding(chunk);

      if (!embedding || embedding.length !== 384) {
        console.log(`Invalid embedding at chunk ${i}`);
        continue;
      }

      await index.upsert({
        records: [
          {
            id: buildVectorId(sourceMeta.sourceId, i),
            values: embedding,
            metadata: {
              text: chunk,
              source: sourceMeta.source,
              sourceType: sourceMeta.sourceType,
              subject: sourceMeta.subject || "general",
              dataset: sourceMeta.dataset || "",
              config: sourceMeta.config || "",
              split: sourceMeta.split || "",
              rowIndex: sourceMeta.rowIndex ?? -1
            }
          }
        ]
      });

      storedChunks += 1;
    } catch (err) {
      console.log(`Error storing chunk ${i}:`, err.message);
    }
  }

  return storedChunks;
}

async function ingestTextSource({
  sourceId,
  source,
  sourceType,
  subject,
  text,
  config,
  split,
  dataset,
  rowIndex
}) {
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    return 0;
  }

  return upsertTextChunks(chunks, {
    sourceId,
    source,
    sourceType,
    subject,
    config,
    split,
    dataset,
    rowIndex
  });
}

export async function ingestPDF(filePath) {
  await loadModel();

  console.log("Ingesting PDF:", filePath);
  const text = await extractTextFromPDF(filePath);

  const storedChunks = await ingestTextSource({
    sourceId: filePath,
    source: filePath,
    sourceType: "pdf",
    subject: filePath.split(path.sep)[1] || "general",
    text
  });

  console.log(`PDF ingestion complete: ${storedChunks} chunks stored`);
  return { storedChunks };
}

export async function ingestHFDataset({
  dataset,
  config,
  split,
  textColumns,
  maxRows = DEFAULT_DATASET_ROW_LIMIT,
  subject = "education",
  token
}) {
  if (!dataset) {
    throw new Error("Dataset name is required");
  }

  await loadModel();

  const safeRowLimit = Math.min(
    Math.max(Number(maxRows) || DEFAULT_DATASET_ROW_LIMIT, 1),
    MAX_DATASET_ROW_LIMIT
  );
  const selectedColumns = sanitizeTextColumns(textColumns);
  const resolved = await resolveDatasetConfigAndSplit(dataset, config, split, token);
  let offset = 0;
  let processedRows = 0;
  let storedChunks = 0;

  while (processedRows < safeRowLimit) {
    const pageSize = Math.min(100, safeRowLimit - processedRows);
    const params = new URLSearchParams({
      dataset,
      config: resolved.config,
      split: resolved.split,
      offset: String(offset),
      length: String(pageSize)
    });

    const data = await fetchJson(`${HF_DATASETS_BASE_URL}/rows?${params}`, token);
    const rows = Array.isArray(data?.rows) ? data.rows : [];

    if (rows.length === 0) {
      break;
    }

    for (const item of rows) {
      const row = item?.row || {};
      const rowText = extractDatasetRowText(row, selectedColumns);

      if (!rowText.trim()) {
        processedRows += 1;
        continue;
      }

      storedChunks += await ingestTextSource({
        sourceId: `${dataset}:${resolved.config}:${resolved.split}:${item.row_idx ?? offset}`,
        source: dataset,
        sourceType: "huggingface-dataset",
        subject,
        text: rowText,
        config: resolved.config,
        split: resolved.split,
        dataset,
        rowIndex: item.row_idx ?? offset
      });

      processedRows += 1;
      if (processedRows >= safeRowLimit) {
        break;
      }
    }

    offset += rows.length;

    if (rows.length < pageSize) {
      break;
    }
  }

  return {
    dataset,
    config: resolved.config,
    split: resolved.split,
    processedRows,
    storedChunks,
    textColumns: selectedColumns
  };
}
