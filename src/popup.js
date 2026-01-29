// freee退勤通知 - ポップアップスクリプト
// 拡張機能の設定画面を管理する

document.addEventListener("DOMContentLoaded", () => {
  const statusElement = document.getElementById("status");
  const workHoursInput = document.getElementById("work-hours");
  const enableNotification1 = document.getElementById("enable-notification-1");
  const notification1Setting = document.getElementById(
    "notification-1-setting"
  );
  const warningTime1 = document.getElementById("warning-time-1");
  const customWarning1Setting = document.getElementById(
    "custom-warning-1-setting"
  );
  const customWarning1 = document.getElementById("custom-warning-1");
  const enableNotification2 = document.getElementById("enable-notification-2");
  const notification2Setting = document.getElementById(
    "notification-2-setting"
  );
  const warningTime2 = document.getElementById("warning-time-2");
  const customWarning2Setting = document.getElementById(
    "custom-warning-2-setting"
  );
  const customWarning2 = document.getElementById("custom-warning-2");
  const enableOvertimeNotifications = document.getElementById(
    "enable-overtime-notifications"
  );
  const overtimeInterval = document.getElementById("overtime-interval");
  const overtimeIntervalSetting = document.getElementById(
    "overtime-interval-setting"
  );
  const customOvertimeSetting = document.getElementById(
    "custom-overtime-setting"
  );
  const customOvertime = document.getElementById("custom-overtime");
  const enableSound = document.getElementById("enable-sound");

  // 設定を読み込み
  loadSettings();

  // 設定変更イベントリスナー
  workHoursInput.addEventListener("input", saveSettings);

  enableNotification1.addEventListener("change", () => {
    const isEnabled = enableNotification1.checked;
    warningTime1.disabled = !isEnabled;
    customWarning1.disabled = !isEnabled;
    notification1Setting.classList.toggle("hidden", !isEnabled);
    // カスタム設定の表示も制御
    if (!isEnabled || warningTime1.value !== "custom") {
      customWarning1Setting.style.display = "none";
    }
    saveSettings();
  });

  warningTime1.addEventListener("change", () => {
    // カスタム選択時の表示制御
    const isCustom = warningTime1.value === "custom";
    customWarning1Setting.style.display = isCustom ? "block" : "none";
    if (isCustom) {
      customWarning1.focus();
    }
    saveSettings();
  });

  customWarning1.addEventListener("input", saveSettings);

  enableNotification2.addEventListener("change", () => {
    const isEnabled = enableNotification2.checked;
    warningTime2.disabled = !isEnabled;
    customWarning2.disabled = !isEnabled;
    notification2Setting.classList.toggle("hidden", !isEnabled);
    // カスタム設定の表示も制御
    if (!isEnabled || warningTime2.value !== "custom") {
      customWarning2Setting.style.display = "none";
    }
    saveSettings();
  });

  warningTime2.addEventListener("change", () => {
    // カスタム選択時の表示制御
    const isCustom = warningTime2.value === "custom";
    customWarning2Setting.style.display = isCustom ? "block" : "none";
    if (isCustom) {
      customWarning2.focus();
    }
    saveSettings();
  });

  customWarning2.addEventListener("input", saveSettings);

  enableOvertimeNotifications.addEventListener("change", () => {
    const isEnabled = enableOvertimeNotifications.checked;
    overtimeInterval.disabled = !isEnabled;
    customOvertime.disabled = !isEnabled;
    overtimeIntervalSetting.classList.toggle("hidden", !isEnabled);

    // カスタム設定の表示も制御
    if (!isEnabled || overtimeInterval.value !== "custom") {
      customOvertimeSetting.style.display = "none";
    }

    if (!isEnabled) {
      // アラームを解除する
      chrome.alarms.clear("overtime-notifier");
    }
    saveSettings();
  });

  overtimeInterval.addEventListener("change", () => {
    // カスタム選択時の表示制御
    const isCustom = overtimeInterval.value === "custom";
    customOvertimeSetting.style.display = isCustom ? "block" : "none";
    if (isCustom) {
      customOvertime.focus();
    }
    saveSettings();
  });

  customOvertime.addEventListener("input", saveSettings);

  enableSound.addEventListener("change", saveSettings);

  // freeeページの状態をチェック
  checkFreeePageStatus();

  // 設定を読み込む
  function loadSettings() {
    chrome.storage.sync.get(
      {
        workHours: 8,
        enableNotification1: true,
        warningTime1: 10,
        customWarning1: 25,
        enableNotification2: true,
        warningTime2: 1,
        customWarning2: 2,
        enableOvertimeNotifications: false,
        overtimeInterval: 30,
        customOvertime: 45,
        enableSound: true,
      },
      (items) => {
        workHoursInput.value = items.workHours;
        enableNotification1.checked = items.enableNotification1;
        warningTime1.value = items.warningTime1;
        customWarning1.value = items.customWarning1;
        warningTime1.disabled = !items.enableNotification1;
        customWarning1.disabled = !items.enableNotification1;
        notification1Setting.classList.toggle(
          "hidden",
          !items.enableNotification1
        );
        customWarning1Setting.style.display =
          items.enableNotification1 && items.warningTime1 === "custom"
            ? "block"
            : "none";

        enableNotification2.checked = items.enableNotification2;
        warningTime2.value = items.warningTime2;
        customWarning2.value = items.customWarning2;
        warningTime2.disabled = !items.enableNotification2;
        customWarning2.disabled = !items.enableNotification2;
        notification2Setting.classList.toggle(
          "hidden",
          !items.enableNotification2
        );
        customWarning2Setting.style.display =
          items.enableNotification2 && items.warningTime2 === "custom"
            ? "block"
            : "none";

        enableOvertimeNotifications.checked = items.enableOvertimeNotifications;
        overtimeInterval.value = items.overtimeInterval;
        customOvertime.value = items.customOvertime;
        overtimeInterval.disabled = !items.enableOvertimeNotifications;
        customOvertime.disabled = !items.enableOvertimeNotifications;
        overtimeIntervalSetting.classList.toggle(
          "hidden",
          !items.enableOvertimeNotifications
        );
        customOvertimeSetting.style.display =
          items.enableOvertimeNotifications &&
          items.overtimeInterval === "custom"
            ? "block"
            : "none";

        enableSound.checked = items.enableSound;
      }
    );
  }

  // 設定を保存する
  function saveSettings() {
    const settings = {
      workHours: parseFloat(workHoursInput.value) || 8,
      enableNotification1: enableNotification1.checked,
      warningTime1:
        warningTime1.value === "custom"
          ? "custom"
          : parseInt(warningTime1.value),
      customWarning1: parseInt(customWarning1.value) || 25,
      enableNotification2: enableNotification2.checked,
      warningTime2:
        warningTime2.value === "custom"
          ? "custom"
          : parseInt(warningTime2.value),
      customWarning2: parseInt(customWarning2.value) || 2,
      enableOvertimeNotifications: enableOvertimeNotifications.checked,
      overtimeInterval:
        overtimeInterval.value === "custom"
          ? "custom"
          : parseInt(overtimeInterval.value),
      customOvertime: parseInt(customOvertime.value) || 45,
      enableSound: enableSound.checked,
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
              const workData = response.workData;

              if (workData && workData.status === "finished") {
                // 退勤済みの表示
                statusElement.innerHTML = `🏁 ${workData.message}`;
                statusElement.className = "status active";
              } else if (workData && workData.status === "before_work") {
                // 出勤前の表示
                statusElement.innerHTML = `⏰ ${workData.message}`;
                statusElement.className = "status inactive";
              } else if (workData && workData.status === "on_break") {
                // 休憩中の表示
                statusElement.innerHTML = `☕ ${workData.message.replace(
                  /\n/g,
                  "<br>"
                )}<br><small>正確な時間は「修正」ボタンで更新してください。</small>`;
                statusElement.className = "status active";
              } else if (workData && workData.status === "completed") {
                // 8時間勤務完了済み（超過勤務中）の表示
                let detailInfo = `<small>${response.workTime.replace(
                  /\n/g,
                  "<br>"
                )}</small>`;
                statusElement.innerHTML = `✅ ${detailInfo}`;
                statusElement.className = "status active";
              } else {
                // 勤務中（pending）の表示
                let detailInfo = `<small>${response.workTime.replace(
                  /\n/g,
                  "<br>"
                )}</small>`;
                statusElement.innerHTML = `✅ 勤務中<br>${detailInfo}`;
                statusElement.className = "status active";
              }
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
