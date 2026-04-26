import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

export async function createVideo(sceneCount, durations, outputName) {
  // 🎬 Create individual scene videos
  for (let i = 0; i < sceneCount; i++) {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(`scene${i}.png`) // 🖼️ FIRST
        .inputOptions([
          "-loop 1",
          `-t ${durations[i]}`
        ])
        .input(`audio${i}.mp3`) // 🎧 SECOND
        .outputOptions([
          "-y",
          "-c:v libx264",
          "-c:a aac",
          "-shortest",
          "-pix_fmt yuv420p",

          // 🔥 ADD FADE TRANSITIONS
          `-vf fade=t=in:st=0:d=0.5,fade=t=out:st=${durations[i] - 0.5}:d=0.5`
      ])
        .output(`video${i}.mp4`)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });
  }

  // 📄 Create file list for merging
  let fileList = "";
  for (let i = 0; i < sceneCount; i++) {
    fileList += `file 'video${i}.mp4'\n`;
  }

  fs.writeFileSync("filelist.txt", fileList);

  // 🎬 Merge videos
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input("filelist.txt")
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions([
        "-c copy"
      ])
      .output(outputName)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}