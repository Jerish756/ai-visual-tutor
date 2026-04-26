import fs from "fs";
import { createCanvas, loadImage } from "canvas";

export async function createImages(scenes) {
  const BATCH_SIZE = 2;

  for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
    const batch = scenes.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (scene, index) => {
        const actualIndex = i + index;

        const canvas = createCanvas(1280, 720);
        const ctx = canvas.getContext("2d");

        // ✅ SIMPLE PROMPT (MOST STABLE)
        const prompt = `${scene.title}, illustration`;

        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720`;

        let image;

        try {
          // small delay
          await new Promise(r => setTimeout(r, 300));

          image = await loadImage(url);
        } catch (err) {
          console.log(`⚠️ Scene ${actualIndex} fallback`);
        }

        if (image) {
          ctx.drawImage(image, 0, 0, 1280, 720);
        } else {
          // fallback gradient
          const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
          gradient.addColorStop(0, "#1e3c72");
          gradient.addColorStop(1, "#2a5298");

          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 1280, 720);
        }

        // overlay
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(40, 60, 1200, 300);

        // title
        ctx.fillStyle = "#fff";
        ctx.font = "bold 50px Arial";
        ctx.fillText(cleanTitle(scene.title), 80, 140);

        // explanation
        ctx.font = "28px Arial";
        wrapText(ctx, scene.explanation, 80, 220, 1050, 40);

        fs.writeFileSync(`scene${actualIndex}.png`, canvas.toBuffer("image/png"));
      })
    );

    // small delay between batches
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log("✅ Images created (stable version)");
}

function cleanTitle(title) {
  return title.replace(/Scene\s*\d+[:\-]?\s*/i, "").trim();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}