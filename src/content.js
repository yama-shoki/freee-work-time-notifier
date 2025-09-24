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
    this.loadStoredData(); // 保存されたデータを復元
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

    // 退勤済みかどうかを判定
    const isFinished = attendanceData.endTime && attendanceData.endTime !== "";

    let endMinutes;
    if (isFinished) {
      // 退勤済み: 記録された退勤時刻を使用
      endMinutes = this.timeToMinutes(attendanceData.endTime);
    } else {
      // 勤務中: 現在時刻を使用
      endMinutes = currentMinutes;
    }

    // 休憩時間の合計を計算
    let totalBreakMinutes = 0;
    attendanceData.breaks.forEach((breakPeriod) => {
      const breakStart = this.timeToMinutes(breakPeriod.startTime);
      let breakEnd;

      if (breakPeriod.endTime) {
        breakEnd = this.timeToMinutes(breakPeriod.endTime);
      } else if (isFinished) {
        // 退勤済みで休憩終了時刻未入力の場合は退勤時刻まで
        breakEnd = endMinutes;
      } else {
        // 勤務中で休憩終了時刻未入力の場合は現在時刻まで
        breakEnd = currentMinutes;
      }

      // 負の休憩時間を防ぐ
      if (breakEnd > breakStart) {
        totalBreakMinutes += breakEnd - breakStart;
      } else {
        console.warn("無効な休憩時間を検出:", breakPeriod);
      }
    });

    // 実勤務時間を計算
    const actualWorkMinutes = endMinutes - startMinutes - totalBreakMinutes;

    // 退勤済みの場合
    if (isFinished) {
      const workHours = Math.floor(actualWorkMinutes / 60);
      const workMins = actualWorkMinutes % 60;

      return {
        status: "finished",
        endTime: attendanceData.endTime,
        actualWorkMinutes: actualWorkMinutes,
        message: `退勤済み (${workHours}時間${workMins}分勤務)`,
      };
    }

    // 勤務中の場合（既存ロジック）
    if (actualWorkMinutes >= this.EIGHT_HOURS_MINUTES) {
      // 既に8時間完了済みだが勤務中
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
    // 今日の日付とタイムスタンプを含めた比較で重複チェック
    const today = this.getTodayDateString();
    const now = new Date();
    const dataWithDate = {
      ...completionInfo,
      workDate: today,
    };

    if (
      JSON.stringify(dataWithDate) === JSON.stringify(this.lastNotificationData)
    ) {
      console.log("同じ日の同じデータのため送信をスキップ");
      return;
    }

    this.lastNotificationData = dataWithDate;

    // storage.localにも保存（復元用）
    chrome.storage.local.set({
      [`workData_${today}`]: dataWithDate,
    });

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

  // 保存されたデータを復元（日本時間で計算）
  loadStoredData() {
    const today = this.getTodayDateString();
    chrome.storage.local.get([`workData_${today}`], (result) => {
      const storedData = result[`workData_${today}`];
      if (storedData && storedData.workDate === today) {
        // 日本時間で現在時刻を取得
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // 保存データから時刻差分で再計算
        const recalculatedData = this.recalculateFromStoredData(
          storedData,
          currentMinutes
        );
        this.lastNotificationData = recalculatedData;

        console.log("保存データを復元しました:", recalculatedData);
      } else {
        console.log("復元可能な保存データが見つかりません");
      }
    });
  }

  // 保存データから現在時刻での状態を再計算
  recalculateFromStoredData(storedData, currentMinutes) {
    let updatedData = { ...storedData };

    // 退勤済みの場合はそのまま返す（時刻は変わらない）
    if (storedData.status === "finished") {
      return updatedData;
    }

    // 勤務中の場合のみ再計算
    if (storedData.completionTime) {
      const completionMinutes = this.timeToMinutes(storedData.completionTime);

      if (storedData.status === "pending") {
        const remainingMinutes = completionMinutes - currentMinutes;

        if (remainingMinutes > 0) {
          // まだ完了時刻前
          updatedData.message = `8時間完了予定: ${
            storedData.completionTime
          } (残り約${Math.floor(remainingMinutes / 60)}時間${
            remainingMinutes % 60
          }分) ※正確な時間と現在のステータスは「修正」ボタンで確認`;
          updatedData.remainingMinutes = remainingMinutes;
        } else {
          // 完了時刻を過ぎている - 超過勤務状態（但し勤務中）
          const overtimeMinutes = currentMinutes - completionMinutes;
          updatedData.status = "completed";
          updatedData.message = `8時間勤務完了済み（約${Math.floor(
            overtimeMinutes / 60
          )}時間${
            overtimeMinutes % 60
          }分超過） ※正確な時間と現在のステータスは「修正」ボタンで確認`;
          updatedData.overtimeMinutes = overtimeMinutes;
        }
      } else if (storedData.status === "completed") {
        // 既に完了済みで勤務中の場合、超過時間を再計算
        const overtimeMinutes = currentMinutes - completionMinutes;
        updatedData.message = `8時間勤務完了済み（約${Math.floor(
          overtimeMinutes / 60
        )}時間${
          overtimeMinutes % 60
        }分超過） ※正確な時間と現在のステータスは「修正」ボタンで確認`;
        updatedData.overtimeMinutes = overtimeMinutes;
      }
    }

    return updatedData;
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
        workData: manager.lastNotificationData,
        workTime: manager.lastNotificationData
          ? manager.lastNotificationData.message
          : "未設定",
      });
    } else {
      sendResponse({ working: false });
    }
  }
});
