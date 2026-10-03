// One composition, scaled as video by native PiP. Never rendered in the page UI.
export const PIP_WIDTH = 1000;
export const PIP_HEIGHT = 780;
export const DISC = { x: 500, y: 400, radius: 290 };
export const ARM_PIVOT = { x: 960, y: 150 };
export const ARM_LENGTH = 500;

export type PipPlayback = {
  title: string;
  creator: string;
  currentTime: number;
  duration: number;
  playing: boolean;
};
export type PipAssets = Record<"shell" | "vinyl" | "label" | "tonearm", CanvasImageSource>;
type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function playbackProgress(currentTime: number, duration: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, currentTime / duration));
}

// A rigid arm rotates around one fixed pivot; its length never stretches.
export function needleGeometry(progress: number) {
  const radius = 282 - 102 * Math.max(0, Math.min(1, progress));
  const dx = DISC.x - ARM_PIVOT.x;
  const dy = DISC.y - ARM_PIVOT.y;
  const distance = Math.hypot(dx, dy);
  const offset = Math.acos(
    (distance ** 2 + ARM_LENGTH ** 2 - radius ** 2) / (2 * distance * ARM_LENGTH),
  );
  const angle = Math.atan2(dy, dx) - offset;
  return {
    angle,
    x: ARM_PIVOT.x + ARM_LENGTH * Math.cos(angle),
    y: ARM_PIVOT.y + ARM_LENGTH * Math.sin(angle),
    radius,
  };
}

export function advanceRotation(angle: number, elapsedSeconds: number, playing: boolean) {
  return playing ? (angle + Math.max(0, elapsedSeconds) * (Math.PI / 6)) % (Math.PI * 2) : angle;
}

export function truncatePipText(
  ctx: Pick<DrawingContext, "measureText">,
  text: string,
  width: number,
) {
  const singleLine = text.replace(/[\r\n\t]+/g, " ");
  if (ctx.measureText(singleLine).width <= width) return singleLine;
  const chars = Array.from(singleLine);
  while (chars.length && ctx.measureText(`${chars.join("")}…`).width > width) chars.pop();
  return `${chars.join("")}…`;
}

export function drawPipTurntable(
  ctx: DrawingContext,
  assets: PipAssets,
  playback: PipPlayback,
  rotation: number,
) {
  // Crop the transparent asset padding, not the turntable or its text area.
  ctx.save();
  ctx.translate(-100, -60);
  ctx.fillStyle = "#050713";
  ctx.fillRect(0, 0, 1200, 900);
  ctx.drawImage(assets.shell, 0, 0, 1200, 900);
  ctx.save();
  ctx.translate(DISC.x, DISC.y);
  ctx.rotate(rotation);
  ctx.drawImage(assets.vinyl, -320, -320, 640, 640);
  ctx.drawImage(assets.label, -115, -115, 230, 230);
  ctx.restore();

  const needle = needleGeometry(playbackProgress(playback.currentTime, playback.duration));
  // Coordinates measured in the supplied 1448x1086 transparent tonearm asset.
  const assetPivot = { x: 1190, y: 215 };
  const assetTip = { x: 389, y: 1023 };
  const assetAngle = Math.atan2(assetTip.y - assetPivot.y, assetTip.x - assetPivot.x);
  const scale = ARM_LENGTH / Math.hypot(assetTip.x - assetPivot.x, assetTip.y - assetPivot.y);
  ctx.save();
  ctx.translate(ARM_PIVOT.x, ARM_PIVOT.y);
  ctx.rotate(needle.angle - assetAngle);
  ctx.scale(scale, scale);
  ctx.drawImage(assets.tonearm, -assetPivot.x, -assetPivot.y, 1448, 1086);
  ctx.restore();

  // Reserved text area below all record/arm geometry; never overlaps the vinyl.
  ctx.textAlign = "center";
  ctx.fillStyle = "#f5f3ff";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(truncatePipText(ctx, playback.title, 920), 600, 750);
  ctx.fillStyle = "#b8b6d6";
  ctx.font = "30px sans-serif";
  ctx.fillText(truncatePipText(ctx, playback.creator, 920), 600, 795);
  ctx.restore();
}
