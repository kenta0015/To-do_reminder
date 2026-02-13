# Phase 2: ウィジェット検討・実装プラン

**前提**: 公式 `expo-widgets`（npm）は **2026年2月時点でも 0.0.0 プレースホルダ**のため、実体のある代替で進める。

---

## 1. 選択肢の整理

| 手段 | 状態 | Expo 54 | 備考 |
|------|------|---------|------|
| **expo-widgets**（公式） | 0.0.0 プレースホルダ | − | Config Plugin も実体なし。利用不可。 |
| **@bittingz/expo-widgets** | v3.0.2、Expo 51+ 対応 | ✅ | サードパーティ。Swift でウィジェット UI を記述。Plugin で App Group / ターゲット追加。データ共有は UserPreferences（suiteName）で可能。 |
| **@bacons/apple-targets** | 実験的、Expo SDK 53+ | ✅ | Evan Bacon 氏の Config Plugin。`npx create-target widget` でウィジェット用ターゲットを生成。Xcode で Swift 開発。 |

**推奨**: **@bittingz/expo-widgets**  
- ウィジェット特化でドキュメント・例が多く、App Group とデータ共有の流れが明確。  
- 既存の `doc/apple-developer-app-group.md` の App Group（`group.com.kenta0015.todo-reminder`）と組み合わせやすい。

---

## 2. @bittingz/expo-widgets で進める場合の流れ

### 2.1 インストールと Config Plugin

```bash
npx expo install @bittingz/expo-widgets
```

`app.json`（または `app.config.js`）の `plugins` に追加する例:

```json
[
  "@bittingz/expo-widgets",
  {
    "ios": {
      "src": "./widgets/ios",
      "devTeamId": "YOUR_APPLE_TEAM_ID",
      "mode": "production",
      "entitlements": {
        "com.apple.security.application-groups": ["group.com.kenta0015.todo-reminder"]
      }
    }
  }
]
```

- `devTeamId`: Apple Developer の Team ID（必須）。  
- `src`: ウィジェット用 Swift とリソースを置くフォルダ（後述）。  
- App Group は既存の `group.com.kenta0015.todo-reminder` をそのまま利用。

### 2.2 ウィジェット用フォルダ構成（iOS）

プロジェクト直下に例えば次のように配置する:

```
widgets/
  ios/
    Module.swift          # プラグインが参照するエントリ
    TodoWidgetBundle.swift  # WidgetBundle（複数ウィジェットをまとめる）
    TodoWidget.swift      # 小さいウィジェット（systemSmall）の View
    Assets.xcassets/      # 必要ならアイコン等
```

- **Module.swift**: パッケージのドキュメント・example に合わせて、ウィジェット拡張のエントリとなるよう記述。  
- **TodoWidgetBundle**: `@main` で `WidgetBundle` を返し、その中で `TodoWidget()` を登録。  
- **TodoWidget**: `Widget` に準拠。`TimelineProvider` で「次のリマインダー時刻」「今日の残り件数」などを表示。  
- データは **UserDefaults(suiteName: "group.com.kenta0015.todo-reminder")** で読み出す（次の 2.3 でメインアプリから書き込む）。

### 2.3 ウィジェット用データ形式（App Group UserDefaults）

メインアプリ（React Native）から書き出し、ウィジェット（Swift）から読む共通フォーマットを決める。

| キー | 型 | 意味 |
|------|-----|------|
| `widget_next_remind_at` | String (ISO8601) | 次に鳴るリマインダーの日時。無い場合は空 or キーなし。 |
| `widget_next_title` | String | そのリマインダーのタイトル（省略可）。 |
| `widget_today_count` | Int | 今日の未完了タスク数。 |
| `widget_updated_at` | String (ISO8601) | 最後に更新した時刻（キャッシュ無効化用）。 |

- ウィジェットは `UserDefaults(suiteName: "group.com.kenta0015.todo-reminder")` で上記を読む。  
- メインアプリは **タスクが変わったタイミング**（保存・完了・削除・通知スヌーズ等）で上記を計算し、同じ suite の UserDefaults に書き込む。  
- **注意**: React Native から直接 UserDefaults を触る API は Expo 標準にはないため、**ネイティブモジュール（Expo Module）** を 1 本用意するか、既存の「タスク保存フロー」の最後で `expo-modules-core` の `NativeModules` 経由でネイティブに「ウィジェット用データを書き込む」メソッドを呼ぶ形が現実的。  
  - つまり: `lib/storage.ts` の `saveTasks` の呼び出し元の「どこか 1 か所」で、保存後に「次のリマインダー + 今日の件数」を計算し、ネイティブの `WidgetDataBridge.updateWidgetData(...)` のような関数を呼ぶ。

### 2.4 メインアプリ側の「書き出し」実装方針

1. **ネイティブモジュール（例: `expo-widget-data`）**  
   - iOS: `RCT_EXPORT_METHOD(updateWidgetData:(NSDictionary *)dict)` で `[[NSUserDefaults alloc] initWithSuiteName:@"group.com.kenta0015.todo-reminder"]` にキー・値を書き込む。  
   - 引数は `widget_next_remind_at`, `widget_next_title`, `widget_today_count`, `widget_updated_at` など。  
2. **JS 側**  
   - タスク一覧を保存したあと（`saveTasks` のあと、または HomeScreenContainer のタスク更新のたび）、  
     - 未完了タスクから `getRemindAtFromTask` で次に鳴る 1 件を求め、  
     - 今日の未完了件数を計算し、  
     - `NativeModules.WidgetDataBridge.updateWidgetData({ nextRemindAt, nextTitle, todayCount })` を呼ぶ。  
3. **ウィジェットの更新**  
   - データを書き込んだあと、iOS の `WidgetCenter.shared.reloadTimelines(ofKind: "TodoWidgetKind")` をネイティブ側で呼ぶと、ウィジェットが再描画される。  
   - @bittingz/expo-widgets の推奨する「更新のトリガー」があればそれに合わせる。

### 2.5 Apple Developer 側

- **App Group**  
  - 既に `doc/apple-developer-app-group.md` のとおり `group.com.kenta0015.todo-reminder` をメインアプリの App ID に紐付けてあること。  
- **ウィジェット拡張の App ID**  
  - @bittingz のプラグインでウィジェット用ターゲットが生成されたあと、EAS / Xcode でその Bundle ID が決まる。  
  - その Bundle ID 用の App ID を Developer で作成し、同じ App Group を有効化する（`doc/apple-developer-app-group.md` の「ウィジェット拡張の App ID」の手順）。

---

## 3. 実装チェックリスト（@bittingz で進める場合）

- [ ] `npx expo install @bittingz/expo-widgets`
- [ ] `app.json` に plugin を追加（`devTeamId`, `src`, `entitlements` で App Group）
- [ ] `widgets/ios/` に Module.swift, WidgetBundle, TodoWidget（systemSmall）を用意
- [ ] ウィジェット側で `UserDefaults(suiteName: "group.com.kenta0015.todo-reminder")` から上記キーを読んで表示
- [ ] ネイティブモジュール（または既存 Expo モジュール）で「Widget 用 UserDefaults 書き込み + reloadTimelines」を実装
- [ ] メインアプリでタスク保存・更新のたびにそのネイティブメソッドを呼ぶ
- [ ] `npx expo prebuild --platform ios --clean` でネイティブを再生成
- [ ] Apple Developer でウィジェット用 App ID に App Group を紐付け
- [ ] 実機で development build → ホーム画面にウィジェットを追加して表示・更新を確認

---

## 4. 公式 expo-widgets が使えるようになった場合

- 公式パッケージのドキュメント（例: docs.expo.dev の SDK 55 の widgets）に従い、  
  - Config Plugin の書き方、  
  - データ共有（App Group / 推奨 API）、  
  - 更新 API（`updateWidgetSnapshot` / `updateWidgetTimeline`）  
  を確認する。  
- データ形式（次に鳴るリマインダー・今日の件数）は上記 2.3 と揃えておけば、差し替えしやすい。

---

*Phase 2 検討メモ: 2026-02-13*
