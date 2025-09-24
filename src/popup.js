// freee退勤通知 - ポップアップスクリプト
// 拡張機能の設定画面を管理する

document.addEventListener("DOMContentLoaded", () => {
  const statusElement = document.getElementById("status");
  const warningTime1 = document.getElementById("warning-time-1");
  const warningTime2 = document.getElementById("warning-time-2");
  const enableOvertimeNotifications = document.getElementById(
    "enable-overtime-notifications"
  );
  const overtimeInterval = document.getElementById("overtime-interval");
  const overtimeIntervalSetting = document.getElementById("overtime-interval-setting");

  // 設定を読み込み
  loadSettings();

  // 設定変更イベントリスナー
  warningTime1.addEventListener("change", saveSettings);
  warningTime2.addEventListener("change", saveSettings);
  enableOvertimeNotifications.addEventListener("change", () => {
    const isEnabled = enableOvertimeNotifications.checked;
    overtimeInterval.disabled = !isEnabled;
    overtimeIntervalSetting.classList.toggle("hidden", !isEnabled);

    if (!isEnabled) {
      // アラームを解除する
      chrome.alarms.clear("overtime-notifier");
      console.log("超過勤務通知アラームを解除しました。");
    }
    saveSettings();
  });
  overtimeInterval.addEventListener("change", saveSettings);

  // freeeページの状態をチェック
  checkFreeePageStatus();

  // 設定を読み込む
  function loadSettings() {
    chrome.storage.sync.get(
      {
        warningTime1: 10,
        warningTime2: 1,
        enableOvertimeNotifications: false,
        overtimeInterval: 30,
      },
      (items) => {
        warningTime1.value = items.warningTime1;
        warningTime2.value = items.warningTime2;
        enableOvertimeNotifications.checked = items.enableOvertimeNotifications;
        overtimeInterval.value = items.overtimeInterval;
        overtimeInterval.disabled = !items.enableOvertimeNotifications;
        overtimeIntervalSetting.classList.toggle("hidden", !items.enableOvertimeNotifications);
      }
    );
  }

  // 設定を保存する
  function saveSettings() {
    const settings = {
      warningTime1: parseInt(warningTime1.value),
      warningTime2: parseInt(warningTime2.value),
      enableOvertimeNotifications: enableOvertimeNotifications.checked,
      overtimeInterval: parseInt(overtimeInterval.value),
    };

    chrome.storage.sync.set(settings, () => {
      console.log("設定が保存されました:", settings);
    });
  }

  // freeeページの状態をチェック
  function checkFreeePageStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];

      if (
        currentTab &&
        currentTab.url &&
        currentTab.url.includes("p.secure.freee.co.jp")
      ) {
        statusElement.textContent = "✅ freeeページで動作中";
        statusElement.className = "status active";

        // content scriptに状態確認を要求
        chrome.tabs.sendMessage(
          currentTab.id,
          {
            type: "getStatus",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              statusElement.textContent = "⚠️ ページを再読み込みしてください";
              statusElement.className = "status inactive";
            } else if (response && response.working) {
              statusElement.innerHTML = `✅ 勤務中<br><small>${response.workTime}</small>`;
              statusElement.className = "status active";
            }
          }
        );
      } else {
        statusElement.textContent = "❌ freeeページを開いてください";
        statusElement.className = "status inactive";
      }
    });
  }

  // 通知権限をチェック
  chrome.notifications.getPermissionLevel((level) => {
    if (level !== "granted") {
      const warningDiv = document.createElement("div");
      warningDiv.className = "info";
      warningDiv.style.backgroundColor = "#ffe6e6";
      warningDiv.style.color = "#d63031";
      warningDiv.innerHTML =
        "<h3>⚠️ 権限が必要</h3><p>通知を受け取るには、ブラウザの通知権限を有効にしてください。</p>";
      statusElement.parentNode.insertBefore(
        warningDiv,
        statusElement.nextSibling
      );
    }
  });
});
