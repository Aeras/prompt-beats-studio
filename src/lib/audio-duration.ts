export async function readAudioDurationSeconds(source: File | string): Promise<number> {
  if (typeof document === "undefined") throw new Error("Audio duration is only available in the browser.");

  const objectUrl = source instanceof File ? URL.createObjectURL(source) : null;
  const audio = document.createElement("audio");
  audio.preload = "metadata";

  return await new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeAttribute("src");
      audio.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      callback();
    };
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Could not read audio duration."))), 12_000);

    audio.addEventListener("loadedmetadata", () => {
      const seconds = Math.round(audio.duration);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60) {
        finish(() => reject(new Error("Could not read a valid audio duration.")));
        return;
      }
      finish(() => resolve(seconds));
    }, { once: true });

    audio.addEventListener("error", () => finish(() => reject(new Error("Could not read audio duration."))), { once: true });
    audio.src = source instanceof File ? objectUrl! : source;
  });
}
