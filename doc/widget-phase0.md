# Phase 0: ドキュメント・App Group 確認

Quick Todo Reminder の iOS ウィジェット実装に向けた Phase 0 の確認結果と手順です。

---

## 1. Expo Widgets ドキュメント確認

### 参照ドキュメント

- **Expo Widgets (SDK Reference)**  
  https://docs.expo.dev/versions/v55.0.0/sdk/widgets/  
  ※ 公式の「Reference」では v55 に記載。expo-widgets は SDK 54 以降でも利用可能な情報あり（要実機確認）。

### 要点

| 項目 | 内容 |
|------|------|
| ライブラリ | `expo-widgets`（alpha、Expo Go 非対応 → **development build 必須**） |
| インストール | `npx expo install expo-widgets` |
| 設定 | **Config Plugin** で `app.json` に記述（CNG 前提） |
| データ共有 | **App Group** が必須。メインアプリとウィジェット拡張で共通の `groupIdentifier` を使用する。 |

### Config Plugin で指定する主な項目

- **`groupIdentifier`**  
  - メインアプリとウィジェット間のデータ共有用。  
  - 未指定時は `group.<メインアプリの bundle identifier>` になる。  
  - 本プロジェクトでは明示的に `group.com.kenta0015.todo-reminder` を指定する想定。

- **`bundleIdentifier`**  
  - ウィジェット拡張の Bundle ID。  
  - 未指定時は `<メインアプリ bundle identifier>.ExpoWidgetsTarget`。  
  - 例: `com.kenta0015.bolt-expo-nativewind.TodoWidget` のように任意で指定可能。

- **`widgets`**  
  - 配列で各ウィジェットを定義。  
  - 各要素: `name`（Swift 識別子）, `displayName`, `description`, `supportedFamilies`（`systemSmall` / `systemMedium` / `systemLarge` など）。

### ウィジェット更新 API（概要）

- `updateWidgetSnapshot(name, widget, props)` … 単一スナップショットで即時表示。
- `updateWidgetTimeline(name, dates, widget, props)` … 日時ごとのタイムラインで更新。
- UI は `@expo/ui/swift-ui` のコンポーネント（`Text`, `VStack`, `HStack` 等）で記述。

### 注意（SDK 54）

- ドキュメントは v55 にありますが、expo-widgets は SDK 54 でも動く可能性あり。  
- 導入後、実機の development build で表示・更新が問題ないか確認すること。

---

## 2. App Group 確認・設定手順

### 本プロジェクトで使う識別子（方針）

| 用途 | 値 |
|------|-----|
| メインアプリ Bundle ID | `com.kenta0015.bolt-expo-nativewind`（`app.json` の `ios.bundleIdentifier`） |
| App Group ID | `group.com.kenta0015.todo-reminder` |
| ウィジェット拡張 Bundle ID（例） | `com.kenta0015.bolt-expo-nativewind.TodoWidget` |
| スキーム | `todo-reminder-ken` |

### Apple Developer 側で行うこと

1. **App Group の登録**
   - [Identifiers → App Groups](https://developer.apple.com/account/resources/identifiers/list/applicationGroup) で新規作成。
   - Description: 任意（例: "Todo Reminder App Group"）。
   - Identifier: **`group.com.kenta0015.todo-reminder`**（iOS は `group.` プレフィックス）。

2. **App ID に App Groups を紐付け**
   - メインアプリの App ID（`com.kenta0015.bolt-expo-nativewind`）に **App Groups** を有効化し、上記 App Group を選択。
   - ウィジェット拡張用の App ID（例: `com.kenta0015.bolt-expo-nativewind.TodoWidget`）を登録する場合も、同じ App Group を有効化する。

3. **Provisioning Profile**
   - メインアプリ・ウィジェット拡張の両方のプロファイルに、上記 App Group が含まれるようにする。  
   - EAS Build を使う場合は、対応する App ID に App Groups が付いていれば、EAS がプロファイルを更新する前提でよい（カスタム profile を使う場合は要確認）。

### Xcode / ネイティブ側（参考）

- メインアプリの **Entitlements** に `com.apple.security.application-groups` を追加し、配列で `group.com.kenta0015.todo-reminder` を記載。
- 現状、`ios/boltexponativewind/boltexponativewind.entitlements` は空の `<dict/>` のため、**expo-widgets の Config Plugin 導入時に App Group が自動追加される想定**。  
  （Plugin が対応していない場合は、手動で entitlements に追加する必要あり。）

---

## 3. 方針と次のアクション

### 方針

- **まずは Small ウィジェット（`systemSmall`）のみ**実装する。
- データは既存の `lib/storage.ts`（AsyncStorage）をメインアプリで参照し、ウィジェット用には **App Group の UserDefaults（または expo-widgets 推奨の共有方法）** に必要なタスク情報だけを書き出す形を想定。
- テストは **development build** で実機確認（Expo Go ではウィジェット不可）。

### 次のアクション（Phase 1 以降）

1. **Apple Developer**  
   - App Group `group.com.kenta0015.todo-reminder` の作成と、メインアプリ（および必要ならウィジェット用）App ID への紐付け。

2. **プロジェクト**  
   - `npx expo install expo-widgets` と Config Plugin の追加（`app.json` に `groupIdentifier` と 1 つだけの widget 定義）。  
   - その後、`expo prebuild` または EAS Build でネイティブを再生成し、エンタイトルメントに App Group が入っているか確認。

3. **データ共有**  
   - メインアプリでタスク更新時に、App Group の共有ストレージへウィジェット用の簡易データを書き出す処理を追加。

---

*Phase 0 確認日: 2025-02-07*
