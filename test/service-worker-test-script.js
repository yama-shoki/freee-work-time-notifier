// Service Worker直接テストスクリプト（貼り付け用）
// 各テストケースを個別にコピー＆ペーストして実行できます。

// 共通補助関数
// ===========================ここから====================
function addMinutesToCurrentTime(minutes) {
  const now = new Date();
  const future = new Date(now.getTime() + minutes * 60000);
  return `${future.getHours().toString().padStart(2, "0")}:${future
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

// テストヘルパー関数
async function runTest(name, testFunction) {
  console.log("=".repeat(50));
  console.log(`🎯 テストケース: ${name} 開始`);

  // Setup: Clear all alarms and reset settings
  await new Promise((resolve) => chrome.alarms.clearAll(resolve));
  await new Promise((resolve) =>
    chrome.storage.sync.set(
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
      resolve
    )
  );
  console.log("⚙️ テスト環境をリセットしました。");

  await testFunction();

  console.log(`✅ テストケース: ${name} 完了！`);
  console.log("=".repeat(50));
}
// ======================ここまでをコピペ======================= (共通補助関数とテストヘルパー関数)

// テストケース1: 退勤通知テスト（1回目・2回目・完了・超過勤務）
// ===========================ここから====================
runTest("退勤通知（1回目・2回目・完了・超過勤務）", async () => {
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  // テスト用の設定を一時的に変更
  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableNotification1: true,
        warningTime1: 1, // 1分前通知
        enableNotification2: true,
        warningTime2: 0.5, // 30秒前通知 (実際は1分前として扱われる可能性あり)
        enableOvertimeNotifications: true,
        overtimeInterval: 0.5, // 30秒ごと
      },
      resolve
    );
  });
  console.log("⚙️ テスト設定を適用しました。1分前、30秒前、完了時、30秒ごとの超過勤務通知が期待されます。");

  const workEndData = {
    status: "pending",
    completionTime: addMinutesToCurrentTime(1), // 現在時刻+1分後を完了予定に
    actualWorkMinutes: 420,
    remainingMinutes: 60,
    message: "8時間完了予定: " + addMinutesToCurrentTime(1),
    workDate: testDate,
  };

  console.log(
    `📨 退勤通知をスケジュール: 完了予定 ${workEndData.completionTime}`
  );
  notificationManager.scheduleWorkEndNotifications(workEndData);
  console.log("期待される通知: 1分前、30秒前（実際は1分前）、完了時、その後30秒ごとの超過勤務通知。");
});
// ======================ここまでをコピペ=======================

// テストケース2: 休憩終了通知テスト（警告・正確な終了時刻）
// ===========================ここから====================
runTest("休憩終了通知（警告・正確な終了時刻）", async () => {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  const testDate = now.toISOString().split("T")[0];

  // テスト用の設定を一時的に変更 (必要に応じて)
  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableBreakNotifications: true,
        breakWarningTime: 0.5, // 30秒前通知
        breakDuration: 1, // 1分休憩
      },
      resolve
    );
  });
  console.log("⚙️ テスト設定を適用しました。休憩終了30秒前と正確な終了時刻に通知が期待されます。");

  const breakData = {
    breakStartTime: currentTime,
    breakDuration: 1, // 1分休憩
    warningTime: 0.5, // 30秒前通知
    workDate: testDate,
  };

  console.log(
    `☕ 休憩終了通知をスケジュール: ${breakData.breakStartTime}開始 → ${addMinutesToCurrentTime(
      1
    )}終了予定`
  );
  notificationManager.scheduleBreakEndNotification(breakData);
  console.log("期待される通知: 休憩終了30秒前（実際は1分前）、休憩終了時刻。");
});
// ======================ここまでをコピペ=======================

// テストケース3: 8時間完了済みケース（超過勤務通知）
// ===========================ここから====================
runTest("8時間完了済みケース（超過勤務通知）", async () => {
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  // テスト用の設定を一時的に変更
  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableOvertimeNotifications: true,
        overtimeInterval: 0.5, // 30秒ごと
      },
      resolve
    );
  });
  console.log("⚙️ テスト設定を適用しました。完了済み通知と、その後30秒ごとの超過勤務通知が期待されます。");

  const completedData = {
    status: "completed",
    completionTime: addMinutesToCurrentTime(-1), // 1分前に完了済み
    actualWorkMinutes: 500, // 8時間20分
    overtimeMinutes: 20,
    message: "8時間勤務完了済み（20分超過）",
    workDate: testDate,
  };

  console.log(
    `⏰ 完了済み通知をスケジュール: ${completedData.completionTime}で完了済み`
  );
  notificationManager.scheduleWorkEndNotifications(completedData);
  console.log("期待される通知: 完了済み通知、その後30秒ごとの超過勤務通知。");
});
// ======================ここまでをコピペ=======================

// テストケース4: 退勤済みケース
// ===========================ここから====================
runTest("退勤済みケース", async () => {
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  const finishedData = {
    status: "finished",
    endTime: addMinutesToCurrentTime(-30), // 30分前に退勤済み
    actualWorkMinutes: 480,
    message: "退勤済み (8時間0分勤務)",
    workDate: testDate,
  };

  console.log(`🏁 退勤済み通知を即座に表示`);
  notificationManager.scheduleWorkEndNotifications(finishedData);
  console.log("期待される通知: 即座に退勤済み通知が表示されます。");
});
// ======================ここまでをコピペ=======================

// テストケース5: 通知オフ設定テスト
// ===========================ここから====================
runTest("通知オフ設定テスト", async () => {
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  console.log("\n🔄 通知設定をオフに変更してテスト");

  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableNotification1: false,
        enableNotification2: false,
        enableOvertimeNotifications: false, // 超過勤務通知もオフにする
      },
      resolve
    );
  });
  console.log("⚙️ 通知設定をオフにしました。通知は期待されません。");

  const noNotificationData = {
    status: "pending",
    completionTime: addMinutesToCurrentTime(6), // 6分後に完了予定
    actualWorkMinutes: 400,
    remainingMinutes: 80,
    message: "通知オフテスト用データ",
    workDate: testDate,
  };

  console.log(
    `🚫 通知オフ状態でスケジュール: ${noNotificationData.completionTime}`
  );
  notificationManager.scheduleWorkEndNotifications(noNotificationData);
  console.log("期待される通知: なし。通知が表示されないことを確認してください。");
});
// ======================ここまでをコピペ=======================

// テストケース6: カスタム通知時間テスト
// ===========================ここから====================
runTest("カスタム通知時間テスト", async () => {
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableNotification1: true,
        warningTime1: "custom",
        customWarning1: 2,
        enableNotification2: true,
        warningTime2: "custom",
        customWarning2: 1,
        enableOvertimeNotifications: true,
        overtimeInterval: "custom",
        customOvertime: 3,
      },
      resolve
    );
  });
  console.log("⚙️ カスタム通知設定を適用しました。2分前、1分前、完了時、3分ごとの超過勤務通知が期待されます。");

  const workEndData = {
    status: "pending",
    completionTime: addMinutesToCurrentTime(3), // 現在時刻+3分後を完了予定に
    actualWorkMinutes: 420,
    remainingMinutes: 60,
    message: "カスタム通知テスト用データ",
    workDate: testDate,
  };

  console.log(
    `📨 退勤通知をスケジュール: 完了予定 ${workEndData.completionTime}`
  );
  notificationManager.scheduleWorkEndNotifications(workEndData);
  console.log("期待される通知: 2分前、1分前、完了時、その後3分ごとの超過勤務通知。");
});
// ======================ここまでをコピペ=======================

// テストケース7: 休憩通知のキャンセルテスト
// ===========================ここから====================
runTest("休憩通知のキャンセルテスト", async () => {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  const testDate = now.toISOString().split("T")[0];

  // まず休憩通知をスケジュール
  const breakData = {
    breakStartTime: currentTime,
    breakDuration: 2, // 2分休憩
    warningTime: 1, // 1分前通知
    workDate: testDate,
  };

  console.log("☕ 休憩通知をスケジュール (1分前と終了時)");
  notificationManager.scheduleBreakEndNotification(breakData);

  // 少し待ってからキャンセル
  await new Promise(resolve => setTimeout(resolve, 500)); // 0.5秒待機

  console.log("🚫 休憩通知をキャンセルします。");
  chrome.runtime.sendMessage(
    {
      type: "cancelBreakNotifications",
      data: { workDate: testDate },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("休憩通知キャンセルエラー:", chrome.runtime.lastError);
      } else {
        console.log("✅ 休憩通知キャンセルメッセージを送信しました。");
      }
    }
  );
  console.log("期待される通知: 休憩通知は表示されないはずです。");
});
// ======================ここまでをコピペ=======================

// テストケース8: 日付変更時のリセットテスト (手動確認推奨)
// ===========================ここから====================
runTest("日付変更時のリセットテスト (手動確認推奨)", async () => {
  console.log("このテストは手動での確認が必要です。ブラウザの日付を変更するか、翌日に再度実行してください。");
  console.log("期待される動作: 翌日になると、前日のアラームと設定が自動的にクリアされます。");
  console.log("現在の勤務日を保存し、翌日にこのテストを再度実行すると、リセットがトリガーされます。");

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowDateString = tomorrow.toISOString().split("T")[0];

  // 翌日の日付をシミュレートして保存
  await new Promise(resolve => chrome.storage.local.set({ currentWorkDate: tomorrowDateString }, resolve));

  // background.jsのinitializeDailyResetを呼び出すことで、日付変更をトリガー
  // ただし、Service Workerのライフサイクルにより自動で実行されるため、ここではシミュレーションのみ
  console.log(`シミュレーション: 現在の勤務日を ${tomorrowDateString} に設定しました。`);
  console.log("ブラウザを再起動するか、翌日に再度拡張機能をアクティブにすると、リセット処理が実行されます。");
  console.log("期待される通知: なし。すべてのアラームがクリアされていることを確認してください。");
});
// ======================ここまでをコピペ=======================