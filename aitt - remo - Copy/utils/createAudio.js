import gTTS from "gtts";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

function getDuration(file) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

function convertToWav(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .audioCodec("pcm_s16le")
      .format("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(outputFile);
  });
}

export async function createAudio(scenes) {
  const durations = [];

  for (let i = 0; i < scenes.length; i++) {
    const mp3Path = `audio${i}.mp3`;
    const wavPath = `audio${i}.wav`;

    await new Promise((resolve, reject) => {
      const gtts = new gTTS(scenes[i].explanation, "en");

      gtts.save(mp3Path, err => {
        if (err) reject(err);
        else resolve();
      });
    });

    let durationSource = mp3Path;

    try {
      await convertToWav(mp3Path, wavPath);
      if (fs.existsSync(wavPath)) {
        durationSource = wavPath;
      }
    } catch (err) {
      console.warn(`Audio ${i}: WAV conversion skipped, using MP3 duration (${err.message})`);
    }

    const duration = await getDuration(durationSource);
    durations.push(duration);
  }

  console.log("✅ Audio + durations ready");

  return durations;
}
