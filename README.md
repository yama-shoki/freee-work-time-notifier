# freee 退勤通知 Chrome 拡張機能

**freee での 8 時間勤務(勤務予定時間はカスタマイズ可能)が終わる前と完了時。休憩終了時にデスクトップ通知を自動送信します**。

今日、何時に勤務始めて、何時退勤だっけ。休憩の終了っていつだっけ？ってことが多いので作りました。

<p align="center">
  <img width="376" height="113" alt="スクリーンショット 2025-09-24 23 41 12" src="https://github.com/user-attachments/assets/3de27a2d-c543-430e-b6a1-fcbe1d58631f" />
</p>

---

<p align="center">
  <img width="339" height="370" alt="スクリーンショット 2025-09-24 23 39 55" src="https://github.com/user-attachments/assets/e8a967be-a5a4-4f7c-a367-59b9d45007d9" />
</p>

## ✨ できること

- 🕘 **退勤前に 2 回のタイミングで自動通知（時間は変更可能）**
- 📊 **複数回の休憩時間を自動計算**（昼休み＋離席+子どものお迎えなどに対応）
- ☕ **休憩終了前に通知**（設定した時間前に通知）
- 🔄 **毎日自動リセット**（前日の設定は自動クリア）
- 💻 **デスクトップ通知**（freee を閉じていても chrome で別のタブが開いていれば通知）
- ⏰ **超過勤務も検出**（8 時間を超過した場合も設定時間ごとに通知）
- 🔄 **データ復元機能**（ブラウザ再読み込み後も設定を自動復元）
- 🔧 **勤務時間のカスタマイズ**（8 時間をカスタマイズ可能）
- 🏁 **退勤済み検出**

## 🎯 こんな人におすすめ

- freee 勤怠管理を使っている
- 8 時間勤務の退勤タイミングを忘れがち
- 複数回の休憩を取る（離席・習い事の送迎など）
- Chrome ブラウザを使用している(Dia なども対応)

## 🚀 セットアップ

### 1. 通知権限の確認

- macOS の場合：**システム設定** > **通知** > **Google Chrome** が許可されていることを確認

<p align="center">
  <img width="707" height="949" alt="スクリーンショット 2025-09-24 23 42 14" src="https://github.com/user-attachments/assets/7261293d-484a-465f-b665-83b0f5eb3875" />
</p>

### 2. ダウンロード

[**こちらから Zip ダウンロード**](https://github.com/yama-shoki/freee-work-time-notifier/archive/refs/heads/main.zip)

### 3. 解凍 & 移動

ダウンロードした `freee-work-time-notifier-main.zip` を解凍

ダウンロードフォルダにあると誤って削除してしまう可能性があるため、解凍したフォルダを任意の場所に移動させてください。
（例: ドキュメントフォルダ内など、永続的に保存される場所）

<p align="center">
<img width="1436" height="651" alt="493822946-46d85a6b-18fb-406f-b41e-3d14c8d38c8f" src="https://github.com/user-attachments/assets/e388d002-3bb0-4232-81af-e4b0d5a87b29" />

</p>

### 4. Chrome 拡張機能に追加

**Chrome の場合：**

1. Chrome で `chrome://extensions/` を開く（アドレスバーにコピー&ペースト）
2. 右上の **「デベロッパーモード」** を ON にする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. 解凍したフォルダを選択

<p align="center">
  <img width="1920" height="1080" alt="493407753-5b60fbc1-8eab-4d1d-ad7d-7039923e8ee2" src="https://github.com/user-attachments/assets/e81a37be-82f0-49e4-a887-87a1a1511e76" />
</p>

**Dia の場合：**

1. 画面上部の **Extensions** > **Manage Extensions** を開く
2. **Developer mode** を ON にする
3. **Load unpacked** をクリック
4. 解凍したフォルダを選択

<p align="center">
 <img width="1920" height="1080" alt="493436858-ae63be10-ad0e-4138-a2fa-25d979f5d571" src="https://github.com/user-attachments/assets/3a8d3d08-d5f4-4748-886c-6d053e3390f5" />
</p>

### 5. 動作テスト

1. [freee 勤怠管理](https://p.secure.freee.co.jp/) にログイン
2. 右上の拡張機能アイコンを押して拡張機能を開き、freee のアイコンをクリックしてステータスを確認する。ピン留めしておくと便利です。

<p align="center">
 <img width="1920" height="1080" alt="493409804-c21a9c03-beb7-4a34-9035-7c189249ab84" src="https://github.com/user-attachments/assets/33e92996-7bf2-4cfd-b007-15dc29783afa" />
</p>

3. freee の **「修正」** ボタンをクリック

<p align="center">
  <img width="1920" height="1080" alt="493411205-74520281-61d3-4834-9bba-8154b665dc89" src="https://github.com/user-attachments/assets/fb548d75-6459-448b-b09a-437cbe8e557c" />
</p>

4. デスクトップ通知が届けば成功です

<p align="center">
  <img width="376" height="113" alt="スクリーンショット 2025-09-24 23 41 12" src="https://github.com/user-attachments/assets/d92bb237-0e86-4276-9481-50da1464730c" />
</p>

5. 機能しない場合は再読み込みをして、再度 **「修正」** ボタンをクリックしてください

## 💻 使い方

**通知のセットアップは、freee 勤怠ページの「修正」ボタン、または「休憩開始」「休憩終了」ボタンクリック時に行われます。正確な時間を確認するには「修正」ボタンをクリックしてください。** これにより、完了予定時刻が再計算され、通知が設定されます。

通知のタイミングは、Chrome 右上の拡張機能アイコンから自由に設定できます。

### ✅ ステータス表示

拡張機能のポップアップでは以下の情報を確認できます：

- **出勤前**：出勤ボタンが表示されている状態
- **勤務中**：現在の状況と完了予定時刻
- **退勤済み**：実際の勤務時間
- **超過勤務中**：超過時間の表示

<p align="center">
  <img width="339" height="370" alt="スクリーンショット 2025-09-24 23 39 55" src="https://github.com/user-attachments/assets/eb736298-88cc-4ade-9d1c-e386aab79428" />
</p>

> **注意**：ページ再読み込み後や再度 freee のページを開く場合は、計算がズレる場合があります。正確な時間と現在のステータスは「修正」ボタンで確認してください。

#### 🎉 完了時の通知

- 上記に加えて、8 時間経過した時点で **「8 時間勤務完了！」** 通知が届きます

#### ⏰ 超過勤務の通知

- **「超過勤務の通知を有効にする」** にチェックを入れると、8 時間経過後、設定した間隔で超過勤務をお知らせする通知が届きます
- 通知間隔はカスタムできます。

## 🛠️ よくある質問

<details>
<summary><strong>Q. 通知が来ない</strong></summary>

- ブラウザと macOS の通知権限を確認してください
- freee のページで一度 **「修正」** ボタンをクリックしたか確認してください
</details>

<details>
<summary><strong>Q. 休憩を複数回取る場合は？</strong></summary>

- 自動で全ての休憩時間を合計して計算します
</details>

<details>
<summary><strong>Q. 残業している場合は？</strong></summary>

- 8 時間完了時点で一度通知します
- ポップアップから超過勤務通知を有効にしている場合は、さらに設定した間隔で定期的に通知が届きます
</details>

<details>
<summary><strong>Q. 翌日はどうする？</strong></summary>

- 日付が変わると、前日の設定は自動でリセットされます。再度、「修正」ボタンを押してください。
</details>

<details>
<summary><strong>Q. ブラウザを再読み込みしたら設定が消える？</strong></summary>

- データ復元機能により、同日内であれば再読み込み後も設定が復元されます
- ただし正確な時間確認には **「修正」** ボタンをクリックしてください
</details>

<details>
<summary><strong>Q. 退勤記録済みなのに勤務中と表示される？</strong></summary>

- 自動的に退勤済みを検出して表示を更新します
- おかしい場合は **「修正」** ボタンで最新状態に更新してください
</details>

---

## ⚠️ 注意事項

> **重要**：この拡張機能は freee 公式ではありません

> 正確な通知時間は **「修正」** ボタンを押すと更新されます

> 日を跨ぐとリセットされます。夜勤などには対応していません。
## お願い

不具合や改善があれば遠慮なく教えてください。
