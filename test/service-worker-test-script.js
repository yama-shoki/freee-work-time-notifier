// Service Worker直接テストスクリプト（貼り付け用）
// 各テストケースを個別にコピー＆ペーストして実行できます。
// 実行前に「ユーティリティ: 全アラームクリア」を実行することを推奨します。

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
// ======================ここまでをコピペ=======================

// ユーティリティ: 全アラームクリア。TODO: テストケースの確認をしたら毎回これを実行
// ===========================ここから====================
chrome.alarms.clearAll(() => {
  console.log("🗑️ 全てのアラームをクリアしました。");
});
// ======================ここまでをコピペ=======================

// ユーティリティ: 通知設定をデフォルトに戻す
// ===========================ここから====================
chrome.storage.sync.set(
  {
    enableNotification1: true,
    warningTime1: 1,
    enableNotification2: true,
    warningTime2: 0.5, // または1
    enableBreakNotifications: true,
    breakWarningTime: 1,
    breakDuration: 15,
    enableOvertimeNotifications: true,
    overtimeInterval: 1,
  },
  () => {
    console.log("⚙️ 通知設定をデフォルトに戻しました。");
  }
);
// ======================ここまでをコピペ=======================

// テストケース1: 退勤通知テスト（30秒後と1分後 + 勤怠完了 + 8時間超過30秒ごと ）
// ===========================ここから====================
(async function testCase1_WorkEndNotification() {
  console.log("=".repeat(50));
  console.log("🎯 テストケース1: 退勤通知（1回目・2回目）テスト開始");
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
        enableBreakNotifications: true,
        breakWarningTime: 1,
        breakDuration: 15,
        enableOvertimeNotifications: true,
        overtimeInterval: 0.5,
      },
      resolve
    );
  });
  console.log("⚙️ テスト設定を適用しました。");

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
  console.log("✅ テストケース1 セットアップ完了！通知を確認してください。");
  console.log("=".repeat(50));
})();
// ======================ここまでをコピペ=======================

// テストケース2: 休憩終了通知テスト（+30秒後）
// ===========================ここから====================
(async function testCase2_BreakEndNotification() {
  console.log("=".repeat(50));
  console.log("🎯 テストケース2: 休憩終了通知テスト開始");
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
  console.log("⚙️ テスト設定を適用しました。");

  const breakData = {
    breakStartTime: currentTime,
    breakDuration: 1, // 1分休憩
    warningTime: 0.5, // 30秒前通知
    workDate: testDate,
  };

  console.log(
    `☕ 休憩終了通知をスケジュール: ${
      breakData.breakStartTime
    }開始 → ${addMinutesToCurrentTime(1)}終了予定`
  );
  notificationManager.scheduleBreakEndNotification(breakData);
  console.log("✅ テストケース2 セットアップ完了！通知を確認してください。");
  console.log("=".repeat(50));
})();
// ======================ここまでをコピペ=======================

// テストケース3: 8時間完了済みケース
// ===========================ここから====================
(async function testCase3_CompletedOvertimeNotification() {
  console.log("=".repeat(50));
  console.log("🎯 テストケース3: 8時間完了済み（超過勤務）通知テスト開始");
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  // テスト用の設定を一時的に変更 (必要に応じて)
  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableOvertimeNotifications: true,
        overtimeInterval: 1, // 1分後
      },
      resolve
    );
  });
  console.log("⚙️ テスト設定を適用しました。");

  const completedData = {
    status: "completed",
    completionTime: addMinutesToCurrentTime(-1),
    actualWorkMinutes: 500, // 8時間20分
    overtimeMinutes: 20,
    message: "8時間勤務完了済み（20分超過）",
    workDate: testDate,
  };

  console.log(
    `⏰ 完了済み通知をスケジュール: ${completedData.completionTime}で完了済み`
  );
  notificationManager.scheduleWorkEndNotifications(completedData);
  console.log("✅ テストケース3 セットアップ完了！通知を確認してください。");
  console.log("=".repeat(50));
})();
// ======================ここまでをコピペ=======================

// テストケース4: 退勤済みケース
// ===========================ここから====================
(async function testCase4_FinishedNotification() {
  console.log("=".repeat(50));
  console.log("🎯 テストケース4: 退勤済みテスト開始");
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
  console.log("✅ テストケース4 セットアップ完了！通知を確認してください。");
  console.log("=".repeat(50));
})();
// ======================ここまでをコピペ=======================

// テストケース5: 通知オフ設定テスト
// ===========================ここから====================
(async function testCase5_NotificationOffTest() {
  console.log("=".repeat(50));
  console.log("🎯 テストケース5: 通知オフ設定テスト開始");
  const now = new Date();
  const testDate = now.toISOString().split("T")[0];

  console.log("\n🔄 通知設定をオフに変更してテスト");

  await new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        enableNotification1: false,
        enableNotification2: false,
        enableBreakNotifications: false,
        enableOvertimeNotifications: false, // 超過勤務通知もオフにする
      },
      resolve
    );
  });
  console.log("⚙️ 通知設定をオフにしました。");

  const noNotificationData = {
    status: "pending",
    completionTime: addMinutesToCurrentTime(6),
    actualWorkMinutes: 400,
    remainingMinutes: 80,
    message: "通知オフテスト用データ",
    workDate: testDate,
  };

  console.log(
    `🚫 通知オフ状態でスケジュール: ${noNotificationData.completionTime}`
  );
  notificationManager.scheduleWorkEndNotifications(noNotificationData);
  console.log(
    "✅ テストケース5 セットアップ完了！通知が表示されないことを確認してください。"
  );
  console.log("=".repeat(50));

  // 注意: このテストケースを実行した後、通知設定はオフのままになります。
  // 必要に応じて、「ユーティリティ: 通知設定をデフォルトに戻す」を実行してください。
})();
// ======================ここまでをコピペ=======================
