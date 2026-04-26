import fs from "fs";
import path from "path";
import { ingestPDF } from "./rag/ingest.js";

async function ingestFolder(folderPath) {
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const fullPath = path.join(folderPath, file);

    if (fs.lstatSync(fullPath).isDirectory()) {
      // 🔁 recursively process subfolder
      await ingestFolder(fullPath);
    } else if (file.endsWith(".pdf")) {
      console.log("📄 Ingesting:", fullPath);
      await ingestPDF(fullPath);
    }
  }
}

// 🔥 Run for entire data folder
await ingestFolder("./data");

console.log("🎉 ALL PDFs ingested");