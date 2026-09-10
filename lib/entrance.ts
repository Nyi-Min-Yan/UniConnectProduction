let entranceAudio: HTMLAudioElement | null = null;

export function playEntranceSong(opts?: { loop?: boolean }): void {
  try {
    if (entranceAudio) {
      entranceAudio.pause();
      entranceAudio = null;
    }
    const audio = new Audio('/entrance.mp3');
    entranceAudio = audio;
    audio.loop = !!opts?.loop;
    audio.play().catch(() => {});
    const clear = () => {
      if (entranceAudio === audio) entranceAudio = null;
    };
    audio.addEventListener('ended', clear);
    audio.addEventListener('error', clear);
  } catch {
    /* ignore */
  }
}

export function stopEntranceSong(): void {
  try {
    if (entranceAudio) {
      entranceAudio.pause();
      entranceAudio.currentTime = 0;
      entranceAudio = null;
    }
  } catch {
    /* ignore */
  }
}