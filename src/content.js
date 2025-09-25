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
    this.checkInitialWorkStatus(); // 初期勤務状態をチェック
    this.observeDialogAppearance();
    this.startBreakButtonMonitoring(); // 休憩開始ボタンの監視を開始
  }

  // 初期勤務状態をチェック（修正ボタンを押さずに）
  checkInitialWorkStatus() {
    // 少し遅延させてページの読み込みを待つ
    setTimeout(() => {
      try {
        // 出勤ボタンの存在をチェック
        const workStartButton = this.findWorkStartButton();

        if (workStartButton) {
          const beforeWorkInfo = {
            status: "before_work",
            message: "出勤前（出勤ボタンが表示されています）",
            workDate: this.getTodayDateString(),
          };

          this.lastNotificationData = beforeWorkInfo;
          this.sendNotificationData(beforeWorkInfo);
        }
      } catch (error) {
        console.error("初期勤務状態チェックエラー:", error);
      }
    }, 2000); // 2秒待機
  }

  // 出勤ボタンを探す
  findWorkStartButton() {
    // 複数のセレクターで出勤ボタンを探す
    const selectors = [
      'button:contains("出勤")',
      'button[aria-label*="出勤"]',
      'button[class*="出勤"]',
      'button[title*="出勤"]',
      '.vb-button:contains("出勤")',
      // テキストで「出勤」を含むボタンを探す
      "button",
    ];

    // まず簡単なセレクターで試す
    let button =
      document.querySelector('button[aria-label*="出勤"]') ||
      document.querySelector('button[title*="出勤"]');

    if (button) return button;

    // すべてのボタンをチェックして「出勤」という文字を含むものを探す
    const allButtons = document.querySelectorAll("button");
    for (let btn of allButtons) {
      if (btn.textContent && btn.textContent.includes("出勤")) {
        return btn;
      }
    }

    return null;
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

        // 休憩終了モードの場合は特別な通知を送信
        if (this.isBreakEndMode) {
          this.isBreakEndMode = false; // フラグをリセット
          this.sendBreakEndWithWorkInfo(completionInfo);
        } else {
          this.sendNotificationData(completionInfo);
        }
      }
    } catch (error) {
      console.error("勤怠データ処理エラー:", error);
    }
  }

  // 修正ダイアログから勤怠データを抽出
  extractAttendanceData() {
    try {
      const texts = document.querySelectorAll(
        ".vb-tableListRow .vb-tableListCell__text"
      );
      if (texts.length === 0) {
        console.warn("勤怠データのテーブル要素が見つかりません");
        return null;
      }

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
    } catch (error) {
      console.error("勤怠データ抽出エラー:", error);
      return null;
    }
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
        totalBreakMinutes: totalBreakMinutes,
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
        totalBreakMinutes: totalBreakMinutes,
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
        totalBreakMinutes: totalBreakMinutes,
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

    // 現在の通知設定を取得して含める
    chrome.storage.sync.get(
      {
        enableNotification1: true,
        warningTime1: 10,
        customWarning1: 25,
        enableNotification2: true,
        warningTime2: 1,
        customWarning2: 2,
        enableOvertimeNotifications: false,
        overtimeInterval: 30,
        customOvertime: 45,
      },
      (settings) => {
        const dataWithDateAndSettings = {
          ...completionInfo,
          workDate: today,
          notificationSettings: settings, // 通知設定を含める
        };

        // 設定も含めて重複チェック
        if (
          JSON.stringify(dataWithDateAndSettings) ===
          JSON.stringify(this.lastNotificationData)
        ) {
          console.log("同じ日の同じデータかつ同じ設定のため送信をスキップ");
          return;
        }

        this.lastNotificationData = dataWithDateAndSettings;

        // storage.localにも保存（復元用）
        chrome.storage.local.set({
          [`workData_${today}`]: dataWithDateAndSettings,
        });

        // Service Workerが休眠している可能性があるため、送信を試行
        try {
          chrome.runtime.sendMessage(
            {
              type: "scheduleWorkEndNotification",
              data: dataWithDateAndSettings,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "バックグラウンドへの送信エラー:",
                  chrome.runtime.lastError
                );
                // Service Workerが応答しない場合、再試行
                setTimeout(() => {
                  chrome.runtime.sendMessage({
                    type: "scheduleWorkEndNotification",
                    data: dataWithDateAndSettings,
                  });
                }, 100);
              }
            }
          );
        } catch (error) {
          console.error("メッセージ送信でエラー:", error);
        }
      }
    );
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
          const breakTimeDisplay = storedData.totalBreakMinutes > 0
            ? `休憩: ${Math.floor(storedData.totalBreakMinutes / 60)}時間${storedData.totalBreakMinutes % 60}分`
            : '';

          updatedData.message = `8時間完了予定: ${storedData.completionTime} (残り約${Math.floor(remainingMinutes / 60)}時間${remainingMinutes % 60}分)
${breakTimeDisplay}
※正確な時間と現在のステータスは「修正」ボタンで確認してください`;
          updatedData.remainingMinutes = remainingMinutes;
        } else {
          // 完了時刻を過ぎている - 超過勤務状態（但し勤務中）
          const overtimeMinutes = currentMinutes - completionMinutes;
          const breakTimeDisplay = storedData.totalBreakMinutes > 0
            ? `休憩: ${Math.floor(storedData.totalBreakMinutes / 60)}時間${storedData.totalBreakMinutes % 60}分`
            : '';

          updatedData.status = "completed";
          updatedData.message = `8時間勤務完了済み（約${Math.floor(overtimeMinutes / 60)}時間${overtimeMinutes % 60}分超過）
${breakTimeDisplay}
※正確な時間と現在のステータスは「修正」ボタンで確認してください`;
          updatedData.overtimeMinutes = overtimeMinutes;
        }
      } else if (storedData.status === "completed") {
        // 既に完了済みで勤務中の場合、超過時間を再計算
        const overtimeMinutes = currentMinutes - completionMinutes;
        const breakTimeDisplay = storedData.totalBreakMinutes > 0
          ? `休憩: ${Math.floor(storedData.totalBreakMinutes / 60)}時間${storedData.totalBreakMinutes % 60}分`
          : '';

        updatedData.message = `8時間勤務完了済み（約${Math.floor(overtimeMinutes / 60)}時間${overtimeMinutes % 60}分超過）
${breakTimeDisplay}
※正確な時間と現在のステータスは「修正」ボタンで確認してください`;
        updatedData.overtimeMinutes = overtimeMinutes;
      }
    }

    return updatedData;
  }

  // 休憩開始ボタンのリアルタイム検知を開始
  startBreakButtonMonitoring() {
    // MutationObserverで休憩開始・終了ボタンの出現・クリックを監視
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          // 新しく追加されたノードから休憩関連ボタンを探す
          this.attachBreakButtonListener();
          this.attachBreakEndButtonListener();
          this.checkBreakStatus(); // 休憩状態をチェック
        }
      });
    });

    // DOM全体を監視
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 初回実行
    this.attachBreakButtonListener();
    this.attachBreakEndButtonListener();
    this.checkBreakStatus();
  }

  // 現在の休憩時間を計算（非同期）
  calculateCurrentBreakTime(callback) {
    // 保存データから最新の勤怠情報を取得
    const today = this.getTodayDateString();
    chrome.storage.local.get([`workData_${today}`], (result) => {
      const storedData = result[`workData_${today}`];

      // 現在時刻
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      let currentBreakMinutes = 0;
      let totalBreakMinutes = storedData?.totalBreakMinutes || 0;

      // 最新の休憩開始時刻を推定（現在の休憩時間計算用）
      if (this.lastNotificationData?.type === 'breakStart') {
        // 休憩開始データから現在の休憩時間を計算
        const breakStartTime = this.lastNotificationData.breakStartTime ||
                             `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
        const breakStartMinutes = this.timeToMinutes(breakStartTime);
        currentBreakMinutes = Math.max(0, currentMinutes - breakStartMinutes);
      }

      const breakTimeDisplay = totalBreakMinutes > 0
        ? `合計休憩: ${Math.floor(totalBreakMinutes / 60)}時間${totalBreakMinutes % 60}分`
        : '';

      const currentBreakDisplay = currentBreakMinutes > 0
        ? `現在の休憩: ${Math.floor(currentBreakMinutes / 60)}時間${currentBreakMinutes % 60}分`
        : '現在休憩中です';

      const message = currentBreakMinutes > 0 && totalBreakMinutes > 0
        ? `${currentBreakDisplay}\n${breakTimeDisplay}`
        : currentBreakMinutes > 0
        ? currentBreakDisplay
        : totalBreakMinutes > 0
        ? `現在休憩中です\n${breakTimeDisplay}`
        : '現在休憩中です';

      callback({
        message: message,
        currentBreakMinutes: currentBreakMinutes,
        totalBreakMinutes: totalBreakMinutes
      });
    });
  }

  // 休憩中状態をチェック
  checkBreakStatus() {
    try {
      // 「休憩中」の表示を探す
      const breakStatusElements = Array.from(
        document.querySelectorAll("*")
      ).filter(
        (el) =>
          el.textContent &&
          el.textContent.includes("休憩中") &&
          !el.querySelector("*") // テキストのみの要素
      );

      // 休憩終了ボタンの存在をチェック
      const breakEndButton = Array.from(
        document.querySelectorAll("button")
      ).find((btn) => btn.textContent && btn.textContent.includes("休憩終了"));

      if (breakStatusElements.length > 0 || breakEndButton) {
        // 休憩中状態を検出
        this.calculateCurrentBreakTime((breakInfo) => {
          const breakStatusInfo = {
            status: "on_break",
            message: breakInfo.message,
            currentBreakMinutes: breakInfo.currentBreakMinutes,
            totalBreakMinutes: breakInfo.totalBreakMinutes,
            workDate: this.getTodayDateString(),
          };

          this.lastNotificationData = breakStatusInfo;
          this.sendNotificationData(breakStatusInfo);
        });
      }
    } catch (error) {
      console.error("休憩状態チェックエラー:", error);
    }
  }

  // 休憩開始ボタンにイベントリスナーを追加
  attachBreakButtonListener() {
    // 既存のリスナーを避けるため、カスタムデータ属性でチェック
    const breakButtons = Array.from(document.querySelectorAll("button")).filter(
      (btn) =>
        btn.textContent &&
        btn.textContent.includes("休憩開始") &&
        !btn.dataset.breakListenerAttached
    );

    breakButtons.forEach((button) => {
      button.dataset.breakListenerAttached = "true";
      button.addEventListener("click", () => {
        // 少し遅延させて、freee側の処理完了を待つ
        setTimeout(() => {
          this.showBreakTimeDialog();
        }, 500);
      });
    });
  }

  // 休憩終了ボタンにイベントリスナーを追加
  attachBreakEndButtonListener() {
    // 既存のリスナーを避けるため、カスタムデータ属性でチェック
    const breakEndButtons = Array.from(
      document.querySelectorAll("button")
    ).filter(
      (btn) =>
        btn.textContent &&
        btn.textContent.includes("休憩終了") &&
        !btn.dataset.breakEndListenerAttached
    );

    breakEndButtons.forEach((button) => {
      button.dataset.breakEndListenerAttached = "true";
      button.addEventListener("click", () => {
        // 休憩終了時の処理
        setTimeout(() => {
          this.handleBreakEnd();
        }, 500);
      });
    });
  }

  // 休憩終了時の処理
  handleBreakEnd() {
    // 進行中の休憩通知をキャンセル
    chrome.runtime.sendMessage(
      {
        type: "cancelBreakNotifications",
        data: { workDate: this.getTodayDateString() },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("休憩通知キャンセルエラー:", chrome.runtime.lastError);
        }
      }
    );

    // 休憩終了の状態通知を送信
    this.sendBreakEndNotification();
  }

  // 休憩終了時の状態通知
  sendBreakEndNotification() {
    // 少し遅延してfreeeの状態更新を待つ
    setTimeout(() => {
      // 修正ダイアログを開いて最新の勤怠データを取得
      this.triggerModifyDialogForBreakEnd();
    }, 1000);
  }

  // 休憩終了用の修正ダイアログ自動処理
  triggerModifyDialogForBreakEnd() {
    try {
      // 修正ボタンを探してクリック
      const modifyButtons = Array.from(
        document.querySelectorAll("button")
      ).filter((btn) => btn.textContent && btn.textContent.includes("修正"));

      if (modifyButtons.length > 0) {
        // 一時的に休憩終了モードフラグを設定
        this.isBreakEndMode = true;

        // 修正ボタンをクリック（自動でprocessTimeRecordsが実行される）
        modifyButtons[0].click();
      } else {
        // 修正ボタンが見つからない場合は簡易通知
        this.sendSimpleBreakEndNotification();
      }
    } catch (error) {
      console.error("休憩終了用修正ダイアログ実行エラー:", error);
      this.sendSimpleBreakEndNotification();
    }
  }

  // 簡易的な休憩終了通知
  sendSimpleBreakEndNotification() {
    const breakEndInfo = {
      status: "break_end",
      message: "休憩終了しました",
      workDate: this.getTodayDateString(),
    };

    // バックグラウンドに即座に通知を送信
    try {
      chrome.runtime.sendMessage(
        {
          type: "showBreakEndNotification",
          data: breakEndInfo,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("休憩終了通知エラー:", chrome.runtime.lastError);
          }
        }
      );
    } catch (error) {
      console.error("休憩終了通知送信エラー:", error);
    }
  }

  // 休憩終了時の勤務情報付き通知（デスクトップアラート無効化）
  sendBreakEndWithWorkInfo(completionInfo) {
    // デスクトップ通知は送信せず、ポップアップ更新のみ行う
    this.sendNotificationData(completionInfo);
  }

  // 休憩時間選択ダイアログを表示
  showBreakTimeDialog() {
    // 既存のダイアログがある場合は削除
    const existingDialog = document.getElementById("freee-break-dialog");
    if (existingDialog) {
      existingDialog.remove();
    }

    // ダイアログHTML
    const dialogHTML = `
      <div id="freee-break-dialog" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #4CAF50;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif;
        min-width: 300px;
      ">
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="margin: 0; color: #333;">☕ 休憩時間の設定</h3>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold;">休憩時間:</label>
          <select id="break-duration-select" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="10">10分</option>
            <option value="15">15分</option>
            <option value="30" selected>30分</option>
            <option value="45">45分</option>
            <option value="60">1時間</option>
            <option value="90">1時間30分</option>
            <option value="custom">カスタム入力</option>
          </select>
        </div>

        <div id="custom-duration-input" style="margin-bottom: 15px; display: none;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold;">カスタム時間（分）:</label>
          <input type="number" id="custom-duration" min="1" max="480" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" />
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold;">通知タイミング:</label>
          <select id="break-warning-select" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="10">10分前</option>
            <option value="5" selected>5分前</option>
            <option value="3">3分前</option>
            <option value="1">1分前</option>
          </select>
        </div>

        <div style="text-align: center;">
          <button id="break-dialog-ok" style="
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            margin-right: 10px;
            cursor: pointer;
            font-size: 14px;
          ">設定</button>
          <button id="break-dialog-cancel" style="
            background: #f44336;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          ">キャンセル</button>
        </div>
      </div>

      <!-- 背景オーバーレイ -->
      <div id="freee-break-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
      "></div>
    `;

    // ダイアログを挿入
    document.body.insertAdjacentHTML("beforeend", dialogHTML);

    // イベントリスナーを追加
    this.setupBreakDialogEvents();
  }

  // ダイアログのイベントリスナーを設定
  setupBreakDialogEvents() {
    const durationSelect = document.getElementById("break-duration-select");
    const customInput = document.getElementById("custom-duration-input");
    const customDuration = document.getElementById("custom-duration");
    const okButton = document.getElementById("break-dialog-ok");
    const cancelButton = document.getElementById("break-dialog-cancel");
    const overlay = document.getElementById("freee-break-overlay");

    // カスタム入力の表示/非表示
    durationSelect.addEventListener("change", () => {
      if (durationSelect.value === "custom") {
        customInput.style.display = "block";
        customDuration.focus();
      } else {
        customInput.style.display = "none";
      }
    });

    // OKボタン
    okButton.addEventListener("click", () => {
      let duration = parseInt(durationSelect.value);
      if (durationSelect.value === "custom") {
        duration = parseInt(customDuration.value);
        if (!duration || duration < 1 || duration > 480) {
          alert("カスタム時間は1分〜480分の範囲で入力してください");
          return;
        }
      }

      const warningTime = parseInt(
        document.getElementById("break-warning-select").value
      );

      // 休憩通知をスケジュール
      this.scheduleBreakNotification(duration, warningTime);

      // ダイアログを閉じる
      this.closeBreakDialog();
    });

    // キャンセル・オーバーレイクリック
    cancelButton.addEventListener("click", () => this.closeBreakDialog());
    overlay.addEventListener("click", () => this.closeBreakDialog());

    // Escキーでキャンセル
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          this.closeBreakDialog();
        }
      },
      { once: true }
    );
  }

  // ダイアログを閉じる
  closeBreakDialog() {
    const dialog = document.getElementById("freee-break-dialog");
    const overlay = document.getElementById("freee-break-overlay");
    if (dialog) dialog.remove();
    if (overlay) overlay.remove();
  }

  // 休憩通知をスケジュール
  scheduleBreakNotification(duration, warningTime) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    const breakData = {
      type: "scheduleBreakEndNotification",
      data: {
        breakStartTime: currentTime,
        breakDuration: duration,
        warningTime: warningTime,
        workDate: this.getTodayDateString(),
      },
    };

    // バックグラウンドスクリプトに送信
    chrome.runtime.sendMessage(breakData, (response) => {
      if (chrome.runtime.lastError) {
        console.error("休憩通知スケジュールエラー:", chrome.runtime.lastError);
      } else if (response && response.success) {
        console.log(
          `休憩通知をスケジュールしました: ${duration}分休憩、${warningTime}分前通知`
        );
      }
    });

    // 休憩開始の状態通知を送信
    this.sendBreakStartNotification(duration, warningTime);
  }

  // 休憩開始時の状態通知
  sendBreakStartNotification(duration, warningTime) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const breakStartInfo = {
      type: "breakStart",
      status: "break_start",
      duration: duration,
      warningTime: warningTime,
      breakStartTime: currentTime, // 休憩開始時刻を追加
      message: `休憩開始しました (${duration}分の予定、${warningTime}分前に通知)`,
      workDate: this.getTodayDateString(),
    };

    // バックグラウンドに即座に通知を送信
    try {
      chrome.runtime.sendMessage(
        {
          type: "showBreakStartNotification",
          data: breakStartInfo,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("休憩開始通知エラー:", chrome.runtime.lastError);
          }
        }
      );
    } catch (error) {
      console.error("休憩開始通知送信エラー:", error);
    }

    // 状態データも更新（ポップアップ表示用）
    this.lastNotificationData = breakStartInfo;
    this.sendNotificationData(breakStartInfo);
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
