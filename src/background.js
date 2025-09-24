// freee退勤通知 - Background Script
// Chrome拡張機能のバックグラウンドで通知を管理する

class NotificationManager {
  constructor() {
    this.activeAlarms = new Set();
    this.currentWorkDate = null; // 現在の勤務日を記録
    this.init();
  }

  init() {
    console.log("freee退勤通知バックグラウンドが開始されました");

    // content scriptからのメッセージを監視
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 非同期レスポンスを有効にする
    });

    // アラームイベントを監視
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });

    // インストール時の初期化
    chrome.runtime.onInstalled.addListener(() => {
      console.log("拡張機能がインストールされました");
      this.createNotificationPermission();
      this.initializeDailyReset();
    });

    // Service Worker起動時の初期化
    chrome.runtime.onStartup.addListener(() => {
      console.log("Service Workerが起動しました");
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
      default:
        console.log("不明なメッセージタイプ:", message.type);
    }
  }

  // 通知権限を確認・取得
  async createNotificationPermission() {
    try {
      const level = await new Promise((resolve) => {
        chrome.notifications.getPermissionLevel(resolve);
      });

      console.log("通知権限レベル:", level);

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

  // 8時間勤務完了の通知をスケジュール
  scheduleWorkEndNotifications(completionInfo) {
    // 日付変更チェックとアラームクリア
    this.checkAndResetDaily();

    // 既存のアラームをクリア
    this.clearAllAlarms();

    // 今日の勤務日を記録
    const today = this.getTodayDateString();
    this.currentWorkDate = today;
    chrome.storage.local.set({ currentWorkDate: today });

    if (completionInfo.status === "completed") {
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
          warningTime1: 10, // Default 10 minutes
          warningTime2: 1, // Default 1 minute
        },
        (items) => {
          const { warningTime1, warningTime2 } = items;

          const now = new Date();
          const currentTime = now.getHours() * 60 + now.getMinutes();
          const completion = this.timeToMinutes(completionInfo.completionTime);

          // Schedule first notification
          const notificationTime1 = completion - warningTime1;
          if (notificationTime1 > currentTime) {
            const delay1 = notificationTime1 - currentTime;
            this.scheduleAlarm(`${warningTime1}min-warning`, delay1, {
              type: "warning", // Generic warning type
              minutesBefore: warningTime1,
              completionTime: completionInfo.completionTime,
            });
          }

          // Schedule second notification
          const notificationTime2 = completion - warningTime2;
          if (notificationTime2 > currentTime) {
            const delay2 = notificationTime2 - currentTime;
            this.scheduleAlarm(`${warningTime2}min-warning`, delay2, {
              type: "warning", // Generic warning type
              minutesBefore: warningTime2,
              completionTime: completionInfo.completionTime,
            });
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
          this.showImmediateNotification({
            type: "status",
            title: "退勤通知設定完了",
            message: `${today}の通知をセットしました\n完了予定: ${completionInfo.completionTime}\n通知1: ${warningTime1}分前\n通知2: ${warningTime2}分前`,
            iconUrl: chrome.runtime.getURL("icons/icon48.png"),
          });
        }
      );
    }
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
      chrome.storage.local.get("completionTimeForOvertime", (result) => {
        const completionTime = result.completionTimeForOvertime;
        if (completionTime) {
          const completionMinutes = this.timeToMinutes(completionTime);
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const overtimeMinutes = currentMinutes - completionMinutes;

          if (overtimeMinutes > 0) {
            this.showNotification({
              type: "basic",
              title: "超過勤務中",
              message: `8時間勤務を約${overtimeMinutes}分超過しています。`,
              iconUrl: chrome.runtime.getURL("icons/icon48.png"),
              requireInteraction: false,
            });
          }
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
            },
            (items) => {
              if (items.enableOvertimeNotifications) {
                // 超過時間計算のために完了時刻を保存
                chrome.storage.local.set({
                  completionTimeForOvertime: alarmData.completionTime,
                });

                // 定期的なアラームを作成
                chrome.alarms.create("overtime-notifier", {
                  delayInMinutes: items.overtimeInterval,
                  periodInMinutes: items.overtimeInterval,
                });
                console.log(
                  `超過勤務通知を${items.overtimeInterval}分ごとに設定しました。`
                );
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
        title: options.title,
        message: options.message,
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
            console.log(
              `通知を自動消去しました (${autoDismissDelay / 1000}秒後):`,
              notificationId
            );
          }
        });
      }, autoDismissDelay);
    } catch (error) {
      console.error("通知表示エラー:", error);
    }
  }

  // 全てのアラームをクリア
  clearAllAlarms() {
    chrome.alarms.getAll((alarms) => {
      alarms.forEach((alarm) => {
        chrome.alarms.clear(alarm.name);
        chrome.storage.local.remove(`alarm_${alarm.name}`);
      });
    });
    this.activeAlarms.clear();
    console.log("全てのアラームをクリアしました");
  }

  // 日付チェックと毎日リセット初期化
  initializeDailyReset() {
    chrome.storage.local.get(["currentWorkDate"], (result) => {
      const storedDate = result.currentWorkDate;
      const today = this.getTodayDateString();

      if (storedDate && storedDate !== today) {
        console.log(`日付変更検出: ${storedDate} → ${today}`);
        this.resetForNewDay();
      }

      this.currentWorkDate = today;
    });
  }

  // 日付変更チェック
  checkAndResetDaily() {
    const today = this.getTodayDateString();

    if (this.currentWorkDate && this.currentWorkDate !== today) {
      console.log(`日付変更検出: ${this.currentWorkDate} → ${today}`);
      this.resetForNewDay();
    }
  }

  // 新しい日のリセット処理
  resetForNewDay() {
    console.log("新しい日の処理を開始します");

    // 前日のアラームをすべてクリア
    this.clearAllAlarms();

    // 前日の勤務日データをクリア
    chrome.storage.local.remove(["currentWorkDate"]);

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
      case "status": // 設定完了
        return 8000; // 8秒（確認用なので短め）
      default:
        return 15000; // デフォルト15秒
    }
  }
}

// バックグラウンドスクリプト初期化
const notificationManager = new NotificationManager();

// グローバルスコープに保存（デバッグ用）
globalThis.notificationManagerInstance = notificationManager;
