// freee退勤通知 - Offscreen Audio Script
// 通知音を再生するためのオフスクリーンドキュメント

let audioContext = null;

// メッセージを受信して音声を再生
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "playNotificationSound") {
    playNotificationSound(message.soundType || "default");
    sendResponse({ success: true });
  }
  return true;
});

// 通知音を再生（Web Audio APIを使用）
function playNotificationSound(soundType) {
  try {
    // AudioContextを作成（再利用）
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // サウンドタイプに応じて音を変える
    switch (soundType) {
      case "warning":
        playWarningSound();
        break;
      case "success":
        playSuccessSound();
        break;
      case "break":
        playBreakSound();
        break;
      default:
        playDefaultSound();
    }
  } catch (error) {
    console.error("音声再生エラー:", error);
  }
}

// デフォルトの通知音（シンプルなビープ）
function playDefaultSound() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 880; // A5
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

// 警告音（退勤前の通知）- 2回ビープ
function playWarningSound() {
  const playBeep = (startTime, frequency) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.4, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.2);
  };

  const now = audioContext.currentTime;
  playBeep(now, 880);       // A5
  playBeep(now + 0.3, 880); // A5
  playBeep(now + 0.6, 1046.5); // C6
}

// 成功音（勤務完了）- 上昇メロディ
function playSuccessSound() {
  const playNote = (startTime, frequency, duration) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };

  const now = audioContext.currentTime;
  playNote(now, 523.25, 0.15);      // C5
  playNote(now + 0.15, 659.25, 0.15); // E5
  playNote(now + 0.3, 783.99, 0.15);  // G5
  playNote(now + 0.45, 1046.5, 0.3);  // C6
}

// 休憩終了音（やさしいチャイム）
function playBreakSound() {
  const playChime = (startTime, frequency) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "triangle";

    gainNode.gain.setValueAtTime(0.25, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.4);
  };

  const now = audioContext.currentTime;
  playChime(now, 784);       // G5
  playChime(now + 0.2, 988); // B5
  playChime(now + 0.4, 784); // G5
}
