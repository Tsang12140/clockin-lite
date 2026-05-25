const DONE_SOUND_SRC = '/done.mp3';

let doneAudio: HTMLAudioElement | null = null;

function getDoneAudio() {
  if (typeof window === 'undefined') return null;
  if (!doneAudio) {
    doneAudio = new Audio(DONE_SOUND_SRC);
    doneAudio.preload = 'auto';
    doneAudio.volume = 0.9;
  }
  return doneAudio;
}

export function primeCompletionSound() {
  const audio = getDoneAudio();
  if (!audio) return;

  audio.load();

  const wasMuted = audio.muted;
  audio.muted = true;
  void audio.play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = wasMuted;
    })
    .catch(() => {
      audio.muted = wasMuted;
    });
}

export function playCompletionSound() {
  const audio = getDoneAudio();
  if (!audio) return;

  audio.muted = false;
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
