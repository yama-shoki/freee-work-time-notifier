// freee退勤通知 - Background Script
// Chrome拡張機能のバックグラウンドで通知を管理する

class NotificationManager {
  constructor() {
    this.activeAlarms = new Set();
    this.currentWorkDate = null; // 現在の勤務日を記録
    this.init();
  }

  init() {
    console.log("freee退勤通知が開始されました");

    // content scriptからのメッセージを監視
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 非同期レスポンスを有効にする
    });

    // アラームイベントを監視
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });

    // ストレージ変更を監視
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    chrome.runtime.onInstalled.addListener(() => {
      console.log("拡張機能がインストールされました");
      this.createNotificationPermission();
      this.initializeDailyReset();
    });

    // Service Worker起動時の初期化
    chrome.runtime.onStartup.addListener(() => {
      this.createNotificationPermission();
      this.initializeDailyReset();
    });

    // 起動時に日付チェックを実行
    this.initializeDailyReset();

    // 権限チェック実行
    this.createNotificationPermission();
  }

  // メッセージハンドラー
  handleMessage(message, _, sendResponse) {
    switch (message.type) {
      case "scheduleWorkEndNotification":
        this.scheduleWorkEndNotifications(message.data);
        sendResponse({ success: true });
        break;
      case "scheduleBreakEndNotification":
        this.scheduleBreakEndNotifications(message.data);
        sendResponse({ success: true });
        break;
      case "cancelBreakNotifications":
        this.cancelBreakNotifications(message.data);
        sendResponse({ success: true });
        break;
      case "showBreakStartNotification":
        this.showBreakStartNotification(message.data);
        sendResponse({ success: true });
        break;
      case "showBreakEndNotification":
        this.showBreakEndNotification(message.data);
        sendResponse({ success: true });
        break;
      case "showBreakEndWithWorkNotification":
        this.showBreakEndWithWorkNotification(message.data);
        sendResponse({ success: true });
        break;
      default:
        console.log("不明なメッセージタイプ:", message.type);
        break;
    }
  }

  // 通知権限を確認・取得
  async createNotificationPermission() {
    try {
      const level = await new Promise((resolve) => {
        chrome.notifications.getPermissionLevel(resolve);
      });

      if (level !== "granted") {
        console.warn(
          "通知権限が許可されていません。Chromeの設定で通知を有効にしてください。"
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error("通知権限チェックエラー:", error);
      return false;
    }
  }

  // ストレージ変更ハンドラー
  handleStorageChange(changes, areaName) {
    if (areaName === "sync") {
      const overtimeSettingsChanged =
        changes.enableOvertimeNotifications ||
        changes.overtimeInterval ||
        changes.customOvertime;

      if (overtimeSettingsChanged) {
        chrome.storage.sync.get(
          {
            enableOvertimeNotifications: false,
            overtimeInterval: 30,
            customOvertime: 45,
          },
          (items) => {
            if (items.enableOvertimeNotifications) {
              chrome.storage.local.get(
                "completionTimeForOvertime",
                (result) => {
                  const completionTime = result.completionTimeForOvertime;
                  if (completionTime) {
                    // Only reschedule if 8 hours were already completed
                    const actualInterval =
                      items.overtimeInterval === "custom"
                        ? items.customOvertime
                        : parseInt(items.overtimeInterval);

                    // Clear existing overtime alarm
                    chrome.alarms.clear("overtime-notifier");

                    // Reschedule with new interval
                    chrome.alarms.create("overtime-notifier", {
                      delayInMinutes: actualInterval,
                      periodInMinutes: actualInterval,
                    });
                  }
                }
              );
            } else {
              // Overtime notifications disabled, clear alarm
              chrome.alarms.clear("overtime-notifier");
            }
          }
        );
      }
    }
  }

  // 8時間勤務完了の通知をスケジュール
  scheduleWorkEndNotifications(completionInfo) {
    // 日付変更チェックとアラームクリア
    this.checkAndResetDaily();

    // 既存の勤務終了アラームをクリア（休憩アラームは保持）
    this.clearWorkEndAlarms();

    // 今日の勤務日を記録
    const today = this.getTodayDateString();
    this.currentWorkDate = today;
    chrome.storage.local.set({ currentWorkDate: today });

    if (completionInfo.status === "finished") {
      // 退勤済みの場合の通知
      this.showImmediateNotification({
        type: "finished",
        title: "勤務状況確認",
        message: completionInfo.message,
        iconUrl: chrome.runtime.getURL("icons/icon48.png"),
      });
    } else if (completionInfo.status === "completed") {
      // 既に8時間完了している場合の通知
      this.showImmediateNotification({
        type: "completed",
        title: "8時間勤務完了済み",
        message: completionInfo.message,
        iconUrl: chrome.runtime.getURL("icons/icon48.png"),
      });
    } else if (completionInfo.status === "pending") {
      // Get settings from storage, then schedule notifications
      chrome.storage.sync.get(
        {
          enableNotification1: true,
          warningTime1: 10, // Default 10 minutes
          customWarning1: 25,
          enableNotification2: true,
          warningTime2: 1, // Default 1 minute
          customWarning2: 2,
          enableOvertimeNotifications: false,
          overtimeInterval: 30,
          customOvertime: 45,
        },
        (items) => {
          const {
            enableNotification1,
            warningTime1,
            customWarning1,
            enableNotification2,
            warningTime2,
            customWarning2,
            enableOvertimeNotifications,
            overtimeInterval,
            customOvertime,
          } = items;

          // カスタム時間の解決
          const actualWarningTime1 =
            warningTime1 === "custom" ? customWarning1 : parseInt(warningTime1);
          const actualWarningTime2 =
            warningTime2 === "custom" ? customWarning2 : parseInt(warningTime2);
          const actualOvertimeInterval =
            overtimeInterval === "custom"
              ? customOvertime
              : parseInt(overtimeInterval);

          const now = new Date();
          const currentTime = now.getHours() * 60 + now.getMinutes();
          const completion = this.timeToMinutes(completionInfo.completionTime);

          // Schedule first notification (only if enabled)
          if (enableNotification1) {
            const notificationTime1 = completion - actualWarningTime1;
            if (notificationTime1 > currentTime) {
              const delay1 = notificationTime1 - currentTime;
              this.scheduleAlarm(`${actualWarningTime1}min-warning`, delay1, {
                type: "warning", // Generic warning type
                minutesBefore: actualWarningTime1,
                completionTime: completionInfo.completionTime,
              });
            }
          }

          // Schedule second notification (only if enabled)
          if (enableNotification2) {
            const notificationTime2 = completion - actualWarningTime2;
            if (notificationTime2 > currentTime) {
              const delay2 = notificationTime2 - currentTime;
              this.scheduleAlarm(`${actualWarningTime2}min-warning`, delay2, {
                type: "warning", // Generic warning type
                minutesBefore: actualWarningTime2,
                completionTime: completionInfo.completionTime,
              });
            }
          }

          // Also need to update the completion notification
          if (completion > currentTime) {
            const delayCompletion = completion - currentTime;
            this.scheduleAlarm("completion", delayCompletion, {
              type: "completion",
              completionTime: completionInfo.completionTime,
            });
          }

          // Update the status notification message to be dynamic
          let notificationSummary = "";
          if (enableNotification1) {
            notificationSummary += `\n通知1: ${actualWarningTime1}分前`;
          }
          if (enableNotification2) {
            notificationSummary += `\n通知2: ${actualWarningTime2}分前`;
          }
          if (!enableNotification1 && !enableNotification2) {
            notificationSummary = "\n事前通知: オフ";
          }

          // 超過勤務通知の設定も追加
          if (enableOvertimeNotifications) {
            notificationSummary += `\n超過勤務: ${actualOvertimeInterval}分ごと`;
          } else {
            notificationSummary += `\n超過勤務: オフ`;
          }

          this.showImmediateNotification({
            type: "status",
            title: "退勤通知設定完了",
            message: `${this.getTodayDateString()}の通知をセットしました\n完了予定: ${
              completionInfo.completionTime
            }${notificationSummary}`,
            iconUrl: chrome.runtime.getURL("icons/icon48.png"),
          });
        }
      );
    }
  }

  // 休憩終了通知をスケジュール
  scheduleBreakEndNotification(breakData) {
    const { breakStartTime, breakDuration, warningTime, workDate } = breakData;

    // 休憩開始時刻を分に変換
    const breakStartMinutes = this.timeToMinutes(breakStartTime);

    // 現在時刻を取得
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 休憩終了予定時刻を計算
    const breakEndMinutes = breakStartMinutes + breakDuration;

    // 休憩終了時刻に通知をスケジュール
    if (breakEndMinutes > currentMinutes) {
      const delayMinutes = breakEndMinutes - currentMinutes;
      const alarmName = `break_end_${breakStartTime.replace(":", "")}`;
      this.scheduleAlarm(alarmName, delayMinutes, {
        type: "break_end_exact",
        breakEndTime: this.minutesToTime(breakEndMinutes),
      });
      console.log(
        `休憩終了時刻の通知をスケジュールしました: ${this.minutesToTime(
          breakEndMinutes
        )}`
      );
    }

    // 通知時刻を計算（休憩終了の○分前）
    const notificationMinutes = breakEndMinutes - warningTime;

    // 現在時刻より後の場合のみスケジュール
    if (notificationMinutes > currentMinutes) {
      const delayMinutes = notificationMinutes - currentMinutes;
      const baseAlarmName = `break_${breakStartTime.replace(":", "")}_warning`;

      // 既存の休憩アラームをクリア（同じ休憩時間の重複を防ぐ）
      const today = this.getTodayDateString();
      const fullAlarmName = `${today}_${baseAlarmName}`;
      chrome.alarms.clear(fullAlarmName);

      // 新しいアラームをスケジュール
      this.scheduleAlarm(baseAlarmName, delayMinutes, {
        type: "break_warning",
        breakStartTime: breakStartTime,
        breakDuration: breakDuration,
        warningTime: warningTime,
        breakEndTime: this.minutesToTime(breakEndMinutes),
      });
    }
  }

  // 休憩通知をキャンセル
  cancelBreakNotifications(cancelData) {
    const { workDate } = cancelData;

    // 休憩関連のアラームを検索してキャンセル
    chrome.alarms.getAll((alarms) => {
      alarms.forEach((alarm) => {
        // 休憩関連のアラーム名パターンをチェック
        if (alarm.name.includes("break_") && alarm.name.startsWith(workDate)) {
          chrome.alarms.clear(alarm.name);
          chrome.storage.local.remove(`alarm_${alarm.name}`);
          this.activeAlarms.delete(alarm.name);
        }
      });
    });
  }

  // 休憩開始時の即座通知
  showBreakStartNotification(data) {
    this.showImmediateNotification({
      type: "break_start",
      title: "☕ 休憩開始",
      message: data.message,
      iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    });
  }

  // 休憩終了時の即座通知
  showBreakEndNotification(data) {
    this.showImmediateNotification({
      type: "break_end",
      title: "🔄 休憩終了",
      message: data.message,
      iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    });
  }

  // 休憩終了+勤務情報の即座通知
  showBreakEndWithWorkNotification(data) {
    this.showImmediateNotification({
      type: "break_end_with_work",
      title: "🔄 休憩終了",
      message: data.message,
      iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    });
  }

  // アラームをスケジュール
  scheduleAlarm(name, delayMinutes, data) {
    // 日付付きのアラーム名を作成
    const datePrefix = this.getTodayDateString();
    const alarmName = `${datePrefix}_${name}`;

    chrome.alarms.create(alarmName, {
      delayInMinutes: delayMinutes,
    });

    // アラームデータを日付付きで保存
    const alarmData = {
      ...data,
      workDate: datePrefix,
      scheduledAt: new Date().toISOString(),
    };

    chrome.storage.local.set({
      [`alarm_${alarmName}`]: alarmData,
    });

    this.activeAlarms.add(alarmName);
  }

  // アラームイベントハンドラー
  handleAlarm(alarm) {
    // 超過勤務通知の処理
    if (alarm.name === "overtime-notifier") {
      console.log("超過勤務アラーム発火！"); // 追加
      chrome.storage.local.get("completionTimeForOvertime", (result) => {
        const completionTime = result.completionTimeForOvertime;
        if (completionTime) {
          const completionMinutes = this.timeToMinutes(completionTime);
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const overtimeMinutes = currentMinutes - completionMinutes;

          console.log(
            `完了時刻(分): ${completionMinutes}, 現在時刻(分): ${currentMinutes}, 超過時間(分): ${overtimeMinutes}`
          ); // 追加

          if (overtimeMinutes > 0) {
            this.showNotification({
              type: "basic",
              title: "超過勤務中",
              message: `8時間勤務を約${overtimeMinutes}分超過しています。`,
              iconUrl: chrome.runtime.getURL("icons/icon48.png"),
              requireInteraction: false,
            });
          } else {
            console.log("超過勤務時間0以下、通知スキップ"); // 追加
          }
        } else {
          console.log("completionTimeForOvertimeが設定されていません"); // 追加
        }
      });
      return; // 他の処理は行わない
    }

    // 通常のアラーム処理
    chrome.storage.local.get(`alarm_${alarm.name}`, (result) => {
      const alarmData = result[`alarm_${alarm.name}`];
      if (!alarmData) return;

      switch (alarmData.type) {
        case "warning":
          this.showNotification({
            type: "warning",
            title: `退勤${alarmData.minutesBefore}分前`,
            message: `8時間勤務完了まで${alarmData.minutesBefore}分です\n完了予定時刻: ${alarmData.completionTime}`,
            iconUrl: chrome.runtime.getURL("icons/icon48.png"),
            requireInteraction: true,
          });
          break;

        case "break_warning":
          this.showNotification({
            type: "break",
            title: `休憩終了${alarmData.warningTime}分前`,
            message: `休憩時間がもうすぐ終了します\n予定終了時刻: ${alarmData.breakEndTime}\n休憩開始: ${alarmData.breakStartTime}`,
            iconUrl: chrome.runtime.getURL("icons/icon48.png"),
            requireInteraction: true,
          });
          break;

        case "break_end_exact":
          this.showNotification({
            type: "break_end",
            title: "☕ 休憩終了",
            message: "休憩終了予定時刻になりました。",
            iconUrl: chrome.runtime.getURL("icons/icon48.png"),
            requireInteraction: true,
          });
          break;

        case "completion":
          this.showNotification({
            type: "success",
            title: "8時間勤務完了！",
            message: `お疲れさまでした！\n完了時刻: ${alarmData.completionTime}`,
            iconUrl: chrome.runtime.getURL("icons/icon48.png"),
            requireInteraction: true,
          });

          // 超過勤務通知をスケジュールするか確認
          chrome.storage.sync.get(
            {
              enableOvertimeNotifications: false,
              overtimeInterval: 30,
              customOvertime: 45,
            },
            (items) => {
              // 超過時間計算のために完了時刻を保存 (条件ブロックの外に移動)
              chrome.storage.local.set({
                completionTimeForOvertime: alarmData.completionTime,
              });

              if (items.enableOvertimeNotifications) {
                // カスタム時間の解決
                const actualInterval =
                  items.overtimeInterval === "custom"
                    ? items.customOvertime
                    : parseInt(items.overtimeInterval);

                // 定期的なアラームを作成
                chrome.alarms.create("overtime-notifier", {
                  delayInMinutes: actualInterval,
                  periodInMinutes: actualInterval,
                });
              }
            }
          );
          break;
      }

      // アラームデータを削除
      chrome.storage.local.remove(`alarm_${alarm.name}`);
      this.activeAlarms.delete(alarm.name);
    });
  }
  // 即座に通知を表示
  showImmediateNotification(options) {
    if (!options || typeof options !== "object") {
      console.error("無効な通知オプション:", options);
      return;
    }
    this.showNotification(options);
  }

  // 通知を表示
  async showNotification(options) {
    try {
      // 通知権限を再確認
      const hasPermission = await this.createNotificationPermission();
      if (!hasPermission) {
        console.error("通知権限がありません");
        return;
      }

      const notificationOptions = {
        type: "basic",
        iconUrl: options.iconUrl || chrome.runtime.getURL("icons/icon48.png"),
        title: options.title || "",
        message: options.message || "",
        requireInteraction: options.requireInteraction || false,
      };

      const notificationId = await new Promise((resolve, reject) => {
        chrome.notifications.create(
          `freee_notification_${Date.now()}`,
          notificationOptions,
          (id) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(id);
            }
          }
        );
      });

      // 通知の自動消去（通知タイプに応じて時間を調整）
      const autoDismissDelay = this.getAutoDismissDelay(options.type);
      setTimeout(() => {
        chrome.notifications.clear(notificationId, (wasCleared) => {
          if (wasCleared) {
          }
        });
      }, autoDismissDelay);
    } catch (error) {
      console.error("通知表示エラー:", error);
    }
  }

  // 勤務終了関連のアラームのみをクリア（休憩アラームは保持）
  clearWorkEndAlarms() {
    chrome.alarms.getAll((alarms) => {
      alarms.forEach((alarm) => {
        // 休憩関連のアラームは保持する
        if (!alarm.name.includes("break_")) {
          chrome.alarms.clear(alarm.name);
          chrome.storage.local.remove(`alarm_${alarm.name}`);
          this.activeAlarms.delete(alarm.name);
        }
      });
    });
  }

  // 全てのアラームをクリア（日付変更時など）
  clearAllAlarms() {
    chrome.alarms.getAll((alarms) => {
      alarms.forEach((alarm) => {
        chrome.alarms.clear(alarm.name);
        chrome.storage.local.remove(`alarm_${alarm.name}`);
      });
    });
    this.activeAlarms.clear();
  }

  // 日付チェックと毎日リセット初期化
  initializeDailyReset() {
    chrome.storage.local.get(["currentWorkDate"], (result) => {
      const storedDate = result.currentWorkDate;
      const today = this.getTodayDateString();

      if (storedDate && storedDate !== today) {
        this.resetForNewDay();
      }

      this.currentWorkDate = today;
    });
  }

  // 日付変更チェック
  checkAndResetDaily() {
    const today = this.getTodayDateString();

    if (this.currentWorkDate && this.currentWorkDate !== today) {
      this.resetForNewDay();
    }
  }

  // 新しい日のリセット処理
  resetForNewDay() {
    console.log("新しい日の処理を開始します");

    // 前日のアラームをすべてクリア
    this.clearAllAlarms();

    // 前日の勤務日データと作業データをクリア
    const yesterday = this.getYesterdayDateString();

    chrome.storage.local.remove([
      "currentWorkDate",
      `workData_${yesterday}`,
      "completionTimeForOvertime",
    ]);

    console.log("前日のアラームと設定をクリアしました");
  }

  // 今日の日付文字列を取得 (YYYY-MM-DD形式)
  getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 昨日の日付文字列を取得 (YYYY-MM-DD形式)
  getYesterdayDateString() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = (yesterday.getMonth() + 1).toString().padStart(2, "0");
    const day = yesterday.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  // 通知タイプに応じた自動消去時間を取得（ミリ秒）
  getAutoDismissDelay(notificationType) {
    switch (notificationType) {
      case "warning": // 退勤10分前・1分前
        return 20000; // 20秒（重要な通知なので少し長め）
      case "success": // 8時間完了
        return 15000; // 15秒
      case "completed": // 既に完了済み
        return 10000; // 10秒（情報通知なので短め）
      case "finished": // 退勤済み
        return 12000; // 12秒（確認用）
      case "status": // 設定完了
        return 8000; // 8秒（確認用なので短め）
      default:
        return 15000; // デフォルト15秒
    }
  }
}

// バックグラウンドスクリプト初期化
const notificationManager = new NotificationManager();
