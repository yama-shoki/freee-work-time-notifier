// freee退勤通知 - Content Script
// freeeページで勤怠データを監視し、8時間労働完了予定時刻を計算・通知する

class FreeeNotificationManager {
  constructor() {
    this.isProcessing = false;
    this.processingTimeout = null;
    this.dialogWasVisible = false;
    this.lastNotificationData = null;
    this.EIGHT_HOURS_MINUTES = 8 * 60; // 480分
    this.currentWorkDate = null; // 現在の勤務日を記録

    this.init();
  }

  init() {
    console.log("freee退勤通知が開始されました");
    this.checkWorkDateAndReset();
    this.observeDialogAppearance();
  }

  // 修正ダイアログの出現を監視（既存コードベース）
  observeDialogAppearance() {
    const observer = new MutationObserver(() => {
      if (this.isProcessing) return;

      clearTimeout(this.processingTimeout);
      this.processingTimeout = setTimeout(() => {
        const dialog = document.querySelector(
          ".vb-dialogBase.vb-dialogBase--paddingZero"
        );
        const dialogIsVisible = !!dialog;

        if (dialogIsVisible && !this.dialogWasVisible) {
          this.isProcessing = true;
          this.dialogWasVisible = true;
          this.processTimeRecords();
          this.isProcessing = false;
        } else if (!dialogIsVisible && this.dialogWasVisible) {
          this.dialogWasVisible = false;
        }
      }, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // 修正ダイアログから勤怠データを取得・処理
  processTimeRecords() {
    try {
      // 日付変更チェック
      this.checkWorkDateAndReset();

      const attendanceData = this.extractAttendanceData();
      if (attendanceData && attendanceData.startTime) {
        const completionInfo = this.calculate8HourCompletion(attendanceData);

        // 今日の勤務として記録
        const today = this.getTodayDateString();
        this.currentWorkDate = today;

        this.sendNotificationData(completionInfo);
      }
    } catch (error) {
      console.error("勤怠データ処理エラー:", error);
    }
  }

  // 修正ダイアログから勤怠データを抽出
  extractAttendanceData() {
    const texts = document.querySelectorAll(
      ".vb-tableListRow .vb-tableListCell__text"
    );
    if (texts.length === 0) return null;

    const attendanceData = {
      startTime: null,
      endTime: null,
      breaks: [],
    };

    let currentBreak = {};

    for (let i = 0; i < texts.length; i += 4) {
      const typeElement = texts[i];
      const timeInput = texts[i + 2]?.querySelector("input");

      if (!typeElement || !timeInput) continue;

      const type = typeElement.textContent;
      const time = timeInput.value;

      switch (type) {
        case "出勤":
          attendanceData.startTime = time;
          break;
        case "休憩開始":
          currentBreak = { startTime: time };
          break;
        case "休憩終了":
          if (currentBreak.startTime) {
            currentBreak.endTime = time;
            attendanceData.breaks.push(currentBreak);
            currentBreak = {};
          }
          break;
        case "退勤":
          attendanceData.endTime = time;
          break;
      }
    }

    // 未完了の休憩がある場合
    if (currentBreak.startTime && !currentBreak.endTime) {
      attendanceData.breaks.push(currentBreak);
    }

    return attendanceData;
  }

  // 8時間勤務完了予定時刻を計算
  calculate8HourCompletion(attendanceData) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const startMinutes = this.timeToMinutes(attendanceData.startTime);

    // 終了時刻の決定: 退勤時刻が設定されていても、現在時刻の方が遅い場合は現在時刻を使用
    let endMinutes;
    if (attendanceData.endTime) {
      const recordedEndMinutes = this.timeToMinutes(attendanceData.endTime);
      endMinutes = Math.max(recordedEndMinutes, currentMinutes); // より遅い時刻を使用
    } else {
      endMinutes = currentMinutes;
    }

    // 休憩時間の合計を計算
    let totalBreakMinutes = 0;
    attendanceData.breaks.forEach((breakPeriod) => {
      const breakStart = this.timeToMinutes(breakPeriod.startTime);
      const breakEnd = breakPeriod.endTime
        ? this.timeToMinutes(breakPeriod.endTime)
        : currentMinutes;
      totalBreakMinutes += breakEnd - breakStart;
    });

    // 実勤務時間を計算
    const actualWorkMinutes = endMinutes - startMinutes - totalBreakMinutes;

    // 8時間完了予定時刻を計算
    if (actualWorkMinutes >= this.EIGHT_HOURS_MINUTES) {
      // 既に8時間完了
      const overtimeMinutes = actualWorkMinutes - this.EIGHT_HOURS_MINUTES;
      const completionTime = this.addMinutesToTime(
        attendanceData.startTime,
        this.EIGHT_HOURS_MINUTES + totalBreakMinutes
      );

      return {
        status: "completed",
        completionTime: completionTime,
        actualWorkMinutes: actualWorkMinutes,
        overtimeMinutes: overtimeMinutes,
        message: `8時間勤務完了済み（${Math.floor(overtimeMinutes / 60)}時間${
          overtimeMinutes % 60
        }分超過）`,
      };
    } else {
      // まだ8時間未完了
      const remainingMinutes = this.EIGHT_HOURS_MINUTES - actualWorkMinutes;
      const completionTime = this.minutesToTime(
        currentMinutes + remainingMinutes
      );

      return {
        status: "pending",
        completionTime: completionTime,
        actualWorkMinutes: actualWorkMinutes,
        remainingMinutes: remainingMinutes,
        message: `8時間完了予定: ${completionTime} (残り${Math.floor(
          remainingMinutes / 60
        )}時間${remainingMinutes % 60}分)`,
      };
    }
  }

  // バックグラウンドスクリプトに通知データを送信
  sendNotificationData(completionInfo) {
    // 今日の日付を含めた比較で重複チェック
    const today = this.getTodayDateString();
    const dataWithDate = { ...completionInfo, workDate: today };

    if (
      JSON.stringify(dataWithDate) === JSON.stringify(this.lastNotificationData)
    ) {
      console.log("同じ日の同じデータのため送信をスキップ");
      return;
    }

    this.lastNotificationData = dataWithDate;

    chrome.runtime
      .sendMessage({
        type: "scheduleWorkEndNotification",
        data: dataWithDate,
      })
      .catch((error) => {
        console.error("バックグラウンドへの送信エラー:", error);
      });
  }

  // ユーティリティ関数: 時間文字列（HH:mm）を分に変換
  timeToMinutes(timeStr) {
    if (!timeStr || timeStr === "") return 0;
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }

  // ユーティリティ関数: 分を時間文字列（HH:mm）に変換
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`;
  }

  // ユーティリティ関数: 時間に分を加算
  addMinutesToTime(timeStr, minutesToAdd) {
    const totalMinutes = this.timeToMinutes(timeStr) + minutesToAdd;
    return this.minutesToTime(totalMinutes);
  }

  // 勤務日の変更チェック
  checkWorkDateAndReset() {
    const today = this.getTodayDateString();

    if (this.currentWorkDate && this.currentWorkDate !== today) {
      console.log(`日付変更検出: ${this.currentWorkDate} → ${today}`);
      // 前日のデータをリセット
      this.lastNotificationData = null;
      console.log("前日の通知データをリセットしました");
    }

    this.currentWorkDate = today;
  }

  // 今日の日付文字列を取得 (YYYY-MM-DD形式)
  getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

// グローバルアクセス用の単一インスタンス化
window.freeeNotificationManager = null;

// ページ読み込み時に初期化（1回のみ）
function initializeFreeeNotification() {
  if (!window.freeeNotificationManager) {
    window.freeeNotificationManager = new FreeeNotificationManager();
    console.log("freee退勤通知マネージャーを初期化しました");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeFreeeNotification);
} else {
  initializeFreeeNotification();
}

// メッセージハンドラー（設定画面からの状態確認用）
chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type === "getStatus") {
    const manager = window.freeeNotificationManager;
    if (manager) {
      sendResponse({
        working: true,
        workDate: manager.currentWorkDate,
        workTime: manager.lastNotificationData
          ? manager.lastNotificationData.message
          : "未設定",
      });
    } else {
      sendResponse({ working: false });
    }
  }
});
