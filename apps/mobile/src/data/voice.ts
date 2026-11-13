/**
 * Голосовой ввод: телефон записывает фразу (expo-audio), распознаёт её наш сервер (Whisper, POST /speech —
 * services/api/app/api/speech.py). Голос не уходит ни в Apple, ни в облако; запись на сервере не хранится.
 *
 * useVoice() — запись: start / stop / cancel, level — громкость 0…1 для свечения снизу.
 */
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useRef } from 'react';

/** Громкость микрофона в дБ (−160…0) → 0…1: тишина ~ −50 дБ, обычная речь −30…−10 дБ. */
const toLevel = (db?: number) => (db === undefined ? 0 : Math.min(1, Math.max(0, (db + 50) / 45)));

export function useVoice() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const on = useRef(false);

  /** Начать запись. Не вышло — понятная фраза, почему (нет разрешения и т. п.). */
  const start = async (): Promise<string | null> => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return 'Разрешите доступ к микрофону: Настройки → Expo Go → Микрофон';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      on.current = true;
      return null;
    } catch {
      return 'Микрофон сейчас недоступен — попробуйте ещё раз';
    }
  };

  /** Закончить запись; адрес файла записи (или null, если записи не было). */
  const stop = async (): Promise<string | null> => {
    if (!on.current) return null;
    on.current = false;
    try {
      await recorder.stop();
    } finally {
      // вернуть звук как был: иначе на айфоне всё играет тихо, через разговорный динамик
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
    return recorder.uri;
  };

  return { start, stop, cancel: () => void stop(), level: toLevel(state.metering), recording: state.isRecording, ms: state.durationMillis };
}
