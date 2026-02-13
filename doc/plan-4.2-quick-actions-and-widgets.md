# 4.2 対策プラン：クイックアクション → expo-widgets

**目的**: Minimum Functionality (4.2) を避けるため、ネイティブ要素を段階的に追加する。  
**方針**: まずクイックアクションで「app-like」を足し、そのあと expo-widgets を検討する。共有シート（Share Extension）は行わない。

---

## 全体の流れ

| フェーズ | 内容 | 前提 |
|----------|------|------|
| **Phase 1** | アプリアイコン長押しクイックアクション | Expo 54 のまま、development build |
| **Phase 2** | ロック画面／ホーム画面ウィジェット（expo-widgets） | SDK 54 で試す or 55 アップ後、alpha 利用 |

並行して推奨（4.2 の「空っぽ／初見で価値が見えない」対策）:
- 初回デモタスク投入
- when 入力のワンタップ例（チップ）
- 通知 OFF 時バナー＋機能はそのまま使える
- 審査ノート（テスト手順付き）

---

## Phase 1: クイックアクション（最優先）

### 1.1 概要

- **ライブラリ**: `expo-quick-actions`（Expo 54 対応は v6.x）
- **動作**: iOS でアプリアイコンを長押しすると、最大 4 つのショートカットが表示される
- **注意**: Expo Go では動かず、**development build 必須**

### 1.2 追加するアクション案（4 件）

| # | タイトル（英語） | 役割 | タップ時の挙動 |
|---|------------------|------|----------------|
| 1 | Add reminder | 新規追加の導線 | Home を開く＋タイトル入力にフォーカス |
| 2 | Add in 2 minutes | デモ・審査で「すぐ通知」を見せる | Home を開き、タイトルは「Quick reminder」、when は「in 2 minutes」を自動セットして追加まで実行（または下書き状態で入力欄を埋める） |
| 3 | Open Important | Important 一覧へ | Home を開き、Important モーダルを開く（クエリ or グローバルフラグ） |
| 4 | Open Statistics | 統計タブへ | Statistics タブへ遷移 |

※ 「Snooze next 10m」は「次の1件」の特定がアプリ起動前には難しいため、Phase 1 では省略してもよい。

### 1.3 実装ステップ

1. **インストール**
   ```bash
   npx expo install expo-quick-actions
   ```
   - Expo 54 なら v6.0.x が入る想定。互換性表を確認すること。

2. **アクション登録**
   - 起動時に一度だけ `QuickActions.setItems([...])` を呼ぶ。
   - 配置場所の候補:
     - `app/_layout.tsx` の `useEffect` 内
     - または `hooks/useFrameworkReady.ts` に近い「アプリ準備完了時」のフック
   - 各アイテムに `params` を付与し、ハンドラで `params` を見て分岐する。

3. **ハンドラの接続**
   - `expo-quick-actions/hooks` の `useQuickActionCallback` をルート（`_layout.tsx`）で使用。
   - コールバック内で:
     - `Add reminder` → `router.replace('/(tabs)')` などで Home を開き、必要なら「フォーカスをタイトルに」を伝える（例: `params: { focusAdd: '1' }`）。
     - `Add in 2 minutes` → Home を開き、`params: { quickAdd: 'in 2 minutes', title: 'Quick reminder' }` のような形で渡し、Home 側でクエリを見て自動でタスク追加するか、入力欄を事前に埋めてユーザーが Add するだけにする。
     - `Open Important` → Home を開き、`params: { openImportant: '1' }`。Home で `useLocalSearchParams` を見てモーダルを開く。
     - `Open Statistics` → `router.replace('/(tabs)/stats')`。

4. **Home 側の対応**
   - `HomeScreenContainer`（または `index.tsx` 経由で渡す場所）で、初回マウント時 or `useEffect` で `params.quickAdd` / `params.openImportant` / `params.focusAdd` を参照し、該当する処理を一度だけ実行する（実行後にクエリを消すか、フラグで二重実行を防ぐ）。

5. **ビルド・確認**
   - `npx expo run:ios` などで development build を作成し、実機でアイコン長押し → 各アクションで意図どおり遷移・追加できるか確認する。

### 1.4 成果物・変更ファイル想定

- `package.json`: `expo-quick-actions` 追加
- `app/_layout.tsx`: `QuickActions.setItems`、`useQuickActionCallback` の登録とルーティング分岐
- `components/home/HomeScreenContainer.tsx`（または Home の親）: クエリパラメータに応じた「Quick add」「Open Important」「フォーカス」の処理

---

## Phase 2: expo-widgets（その後に検討）

**詳細は別ドキュメント**: `doc/plan-phase2-widgets.md` に、公式パッケージの現状・代替案（@bittingz/expo-widgets）・データ形式・実装チェックリストをまとめています。

### 2.1 前提の確認

- **現状**: 公式 `expo-widgets`（npm）は **2026年2月時点でも 0.0.0 プレースホルダ**のため利用不可。代替として **@bittingz/expo-widgets**（Expo 51+）で Swift ウィジェットを実装する方針を推奨。
- **既存ドキュメント**: `doc/widget-phase0.md`、`doc/apple-developer-app-group.md` に App Group や識別子がまとまっている。

### 2.2 進め方（Phase 1 完了後）

1. **SDK バージョン**
   - `expo-widgets` の npm と Expo の changelog を確認し、54 で動くか 55 必須かを判断する。
   - 55 必須なら、まず `npx expo install expo@^55` などでアップグレードし、他プラグイン・ネイティブの互換を確認してからウィジェットに着手する。

2. **expo-widgets の導入**
   - `npx expo install expo-widgets`
   - `app.json` に Config Plugin を追加（`groupIdentifier`、ウィジェット定義）。`doc/widget-phase0.md` のとおり。
   - Apple Developer 側で App Group が済んでいるか再確認（`doc/apple-developer-app-group.md`）。

3. **ウィジェットの内容**
   - ロック画面（小）: 「Next: HH:mm」または「Next in Xm」
   - ホーム画面（中）: 次のリマインダー、Today 残り、Important 上位 1 件程度
   - データ: メインアプリの AsyncStorage から、タスク更新時に App Group の UserDefaults（または expo-widgets 推奨の共有方法）へ必要な情報だけ書き出す。

4. **Live Activities**
   - 「次の通知までカウントダウン」は expo-widgets でサポートされていれば Phase 2 の後半で検討。端末・SDK の制約を確認する。

### 2.3 成果物・変更ファイル想定（Phase 2 時）

- `app.json`: expo-widgets の Config Plugin
- ウィジェット用のエントリ／レイアウト（expo-widgets の書き方に従う）
- メインアプリ: タスク保存時に共有ストレージへ書き出す処理（例: `lib/storage.ts` の `saveTasks` から呼ぶユーティリティ）

---

## 審査ノート（App Review）に書くこと

Phase 1 を入れたあと、次のような内容を「Notes for reviewer」や返信に含めるとよい。

- **Quick Actions**
  - "Long-press the app icon on the home screen to see shortcuts: Add reminder, Add in 2 minutes, Open Important, Open Statistics. 'Add in 2 minutes' creates a sample reminder that fires soon so you can test notification actions (Got it / Not now → Snooze, Change time, Skip)."
- **テスト手順**
  1. アプリアイコン長押し → "Add in 2 minutes" をタップ
  2. 通知を許可
  3. 約 2 分後に通知が鳴る → タップして通知画面を開く
  4. "Not now" → Snooze 10 min / Change time / Skip today を確認
  5. Home に戻り、Late / Today / ハイライトが更新されていることを確認

（デモタスク投入や when の例ボタンを入れる場合は、その旨も簡潔に追記する。）

---

## チェックリスト（Phase 1 実装時）

- [ ] `expo-quick-actions` をインストール
- [ ] `app/_layout.tsx` で `setItems` と `useQuickActionCallback` を実装
- [ ] Home 側で `quickAdd` / `openImportant` / `focusAdd` を処理
- [ ] 「Add in 2 minutes」で実際にタスクが追加され、約 2 分後に通知が鳴ることを実機で確認
- [ ] development build でアイコン長押しメニューに 4 項目が出ることを確認
- [ ] README または future-plan に「クイックアクション」を記載（任意）

Phase 2 に進むときは、このファイルと `doc/widget-phase0.md` をあわせて参照する。
