import { Composition } from "remotion";
import { TutorialVideo } from "./SceneComposition";

const FPS = 30;

// Default props used only for Remotion Studio preview
const defaultScenes = [
  {
    title: "Introduction",
    explanation: "This is a sample explanation that will be replaced with real AI-generated content when the video is rendered.",
    imagePath: "https://picsum.photos/1280/720?grayscale",
    audioPath: "",
  },
];
const defaultDurations = [6];
const defaultFrameCounts = defaultDurations.map((d) => Math.ceil(d * FPS));

export function Root() {
  const totalFrames = defaultFrameCounts.reduce(
    (sum, frames) => sum + frames,
    0
  );

  return (
    <Composition
      id="TutorialVideo"
      component={TutorialVideo}
      durationInFrames={totalFrames}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{
        scenes: defaultScenes,
        durations: defaultDurations,
        frameCounts: defaultFrameCounts,
        fps: FPS,
      }}
      calculateMetadata={async ({ props }) => {
        const total = (props.frameCounts ?? props.durations.map((d) => Math.max(1, Math.ceil(d * props.fps)))).reduce(
          (sum, frames) => sum + frames,
          0
        );
        return { durationInFrames: total };
      }}
    />
  );
}
