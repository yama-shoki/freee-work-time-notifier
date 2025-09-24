// freee退勤通知 - Background Script
// Chrome拡張機能のバックグラウンドで通知を管理する

class NotificationManager {
    constructor() {
        this.activeAlarms = new Set();
        this.currentWorkDate = null; // 現在の勤務日を記録
        this.init();
    }

    init() {
        console.log('freee退勤通知バックグラウンドが開始されました');

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
            console.log('拡張機能がインストールされました');
            this.createNotificationPermission();
            this.initializeDailyReset();
        });

        // Service Worker起動時の初期化
        chrome.runtime.onStartup.addListener(() => {
            console.log('Service Workerが起動しました');
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
            case 'scheduleWorkEndNotification':
                this.scheduleWorkEndNotifications(message.data);
                sendResponse({ success: true });
                break;
            default:
                console.log('不明なメッセージタイプ:', message.type);
        }
    }

    // 通知権限を確認・取得
    async createNotificationPermission() {
        try {
            const level = await new Promise((resolve) => {
                chrome.notifications.getPermissionLevel(resolve);
            });

            console.log('通知権限レベル:', level);

            if (level !== 'granted') {
                console.warn('通知権限が許可されていません。Chromeの設定で通知を有効にしてください。');
                return false;
            }
            return true;
        } catch (error) {
            console.error('通知権限チェックエラー:', error);
            return false;
        }
    }

    // 8時間労働完了の通知をスケジュール
    scheduleWorkEndNotifications(completionInfo) {

        // 日付変更チェックとアラームクリア
        this.checkAndResetDaily();

        // 既存のアラームをクリア
        this.clearAllAlarms();

        // 今日の勤務日を記録
        const today = this.getTodayDateString();
        this.currentWorkDate = today;
        chrome.storage.local.set({ 'currentWorkDate': today });

        if (completionInfo.status === 'completed') {
            // 既に8時間完了している場合の通知
            this.showImmediateNotification({
                type: 'completed',
                title: '8時間労働完了済み',
                message: completionInfo.message,
                iconUrl: chrome.runtime.getURL('icons/icon48.png')
            });
        } else if (completionInfo.status === 'pending') {
            // 未完了の場合、10分前と1分前の通知をスケジュール
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();

            const completion = this.timeToMinutes(completionInfo.completionTime);
            const notification10min = completion - 10;
            const notification1min = completion - 1;

            // 10分前通知
            if (notification10min > currentTime) {
                const delay10min = notification10min - currentTime;
                this.scheduleAlarm('10min-warning', delay10min, {
                    type: '10min',
                    completionTime: completionInfo.completionTime
                });
            }

            // 1分前通知
            if (notification1min > currentTime) {
                const delay1min = notification1min - currentTime;
                this.scheduleAlarm('1min-warning', delay1min, {
                    type: '1min',
                    completionTime: completionInfo.completionTime
                });
            }

            // 完了時通知
            if (completion > currentTime) {
                const delayCompletion = completion - currentTime;
                this.scheduleAlarm('completion', delayCompletion, {
                    type: 'completion',
                    completionTime: completionInfo.completionTime
                });
            }

            // アラーム設定完了の通知
            this.showImmediateNotification({
                type: 'status',
                title: '退勤通知設定完了',
                message: `${today}の通知をセットしました\n完了予定: ${completionInfo.completionTime}\n10分前: ${completionInfo.notification10min}\n1分前: ${completionInfo.notification1min}`,
                iconUrl: chrome.runtime.getURL('icons/icon48.png')
            });

        }
    }

    // アラームをスケジュール
    scheduleAlarm(name, delayMinutes, data) {
        // 日付付きのアラーム名を作成
        const datePrefix = this.getTodayDateString();
        const alarmName = `${datePrefix}_${name}`;

        chrome.alarms.create(alarmName, {
            delayInMinutes: delayMinutes
        });

        // アラームデータを日付付きで保存
        const alarmData = {
            ...data,
            workDate: datePrefix,
            scheduledAt: new Date().toISOString()
        };

        chrome.storage.local.set({
            [`alarm_${alarmName}`]: alarmData
        });

        this.activeAlarms.add(alarmName);

    }

    // アラームイベントハンドラー
    handleAlarm(alarm) {

        chrome.storage.local.get(`alarm_${alarm.name}`, (result) => {
            const alarmData = result[`alarm_${alarm.name}`];
            if (!alarmData) return;

            switch (alarmData.type) {
                case '10min':
                    this.showNotification({
                        type: 'warning',
                        title: '退勤10分前',
                        message: `8時間労働完了まで10分です\n完了予定時刻: ${alarmData.completionTime}`,
                        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                        requireInteraction: true
                    });
                    break;

                case '1min':
                    this.showNotification({
                        type: 'warning',
                        title: '退勤1分前',
                        message: `8時間労働完了まで1分です！\n完了予定時刻: ${alarmData.completionTime}`,
                        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                        requireInteraction: true
                    });
                    break;

                case 'completion':
                    this.showNotification({
                        type: 'success',
                        title: '8時間労働完了！',
                        message: `お疲れさまでした！\n完了時刻: ${alarmData.completionTime}`,
                        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                        requireInteraction: true
                    });
                    break;

            }

            // アラームデータを削除
            chrome.storage.local.remove(`alarm_${alarm.name}`);
        });

        this.activeAlarms.delete(alarm.name);
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
                console.error('通知権限がありません');
                return;
            }

            const notificationOptions = {
                type: 'basic',
                iconUrl: options.iconUrl || chrome.runtime.getURL('icons/icon48.png'),
                title: options.title,
                message: options.message,
                requireInteraction: options.requireInteraction || false
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
                        console.log(`通知を自動消去しました (${autoDismissDelay / 1000}秒後):`, notificationId);
                    }
                });
            }, autoDismissDelay);

            // 音の通知（オプション）
            if (options.type === 'warning' || options.type === 'success') {
                this.playNotificationSound();
            }
        } catch (error) {
            console.error('通知表示エラー:', error);
        }
    }

    // 通知音を再生（オプション）
    playNotificationSound() {
        // ブラウザの通知音を使用（カスタムサウンドは追加実装が必要）
        chrome.notifications.create('sound_notification', {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon16.png'),
            title: '',
            message: ''
        }, (id) => {
            // すぐに削除してサウンドのみ再生
            setTimeout(() => {
                chrome.notifications.clear(id);
            }, 100);
        });
    }

    // 全てのアラームをクリア
    clearAllAlarms() {
        chrome.alarms.getAll((alarms) => {
            alarms.forEach(alarm => {
                chrome.alarms.clear(alarm.name);
                chrome.storage.local.remove(`alarm_${alarm.name}`);
            });
        });
        this.activeAlarms.clear();
        console.log('全てのアラームをクリアしました');
    }

    // 日付チェックと毎日リセット初期化
    initializeDailyReset() {
        chrome.storage.local.get(['currentWorkDate'], (result) => {
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
        console.log('新しい日の処理を開始します');

        // 前日のアラームをすべてクリア
        this.clearAllAlarms();

        // 前日の勤務日データをクリア
        chrome.storage.local.remove(['currentWorkDate']);

        console.log('前日のアラームと設定をクリアしました');
    }

    // 今日の日付文字列を取得 (YYYY-MM-DD形式)
    getTodayDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ユーティリティ関数: 時間文字列（HH:mm）を分に変換
    timeToMinutes(timeStr) {
        if (!timeStr || timeStr === '') return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // ユーティリティ関数: 分を時間文字列（HH:mm）に変換
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }


    // 通知タイプに応じた自動消去時間を取得（ミリ秒）
    getAutoDismissDelay(notificationType) {
        switch (notificationType) {
            case 'warning':    // 退勤10分前・1分前
                return 20000;  // 20秒（重要な通知なので少し長め）
            case 'success':    // 8時間完了
                return 15000;  // 15秒
            case 'completed':  // 既に完了済み
                return 10000;  // 10秒（情報通知なので短め）
            case 'status':     // 設定完了
                return 8000;   // 8秒（確認用なので短め）
            default:
                return 15000;  // デフォルト15秒
        }
    }
}

// バックグラウンドスクリプト初期化
const notificationManager = new NotificationManager();

// グローバルスコープに保存（デバッグ用）
globalThis.notificationManagerInstance = notificationManager;

// Service Worker永続化のためのkeep-alive
chrome.runtime.onStartup.addListener(() => {
    console.log('Chrome起動時にService Workerが起動しました');
});

// メッセージ受信時にService Workerを起動
chrome.runtime.onMessage.addListener(() => {
    console.log('メッセージ受信: Service Worker起動');
    return true;
});