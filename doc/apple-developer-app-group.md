# Apple Developer：App Group 登録手順

ウィジェット用の App Group を Apple Developer で登録し、メインアプリ（と将来的なウィジェット拡張）に紐付ける手順です。

**使う識別子（コピー用）**

| 用途 | 値 |
|------|-----|
| App Group Identifier | `group.com.kenta0015.todo-reminder` |
| メインアプリ Bundle ID | `com.kenta0015.bolt-expo-nativewind` |
| ウィジェット拡張 Bundle ID（後で必要なら） | `com.kenta0015.bolt-expo-nativewind.TodoWidget` |

---

## Step 1: App Group を新規登録

1. [Apple Developer](https://developer.apple.com/account) にログインする。
2. **Certificates, Identifiers & Profiles** を開く。
3. 左メニューで **Identifiers** を選ぶ。
4. 左上の **+** ボタンを押す。
5. **App Groups** を選んで **Continue**。
6. 以下を入力して **Continue** → **Register**。
   - **Description**: `Todo Reminder App Group`（任意の説明で可）
   - **Identifier**: **`group.com.kenta0015.todo-reminder`**（一字一句この通り）

- [ ] App Group が一覧に表示されていることを確認した

---

## Step 2: メインアプリの App ID に App Groups を付ける

1. **Identifiers** の一覧で **App IDs** を選ぶ。
2. メインアプリの App ID **`com.kenta0015.bolt-expo-nativewind`** を探してクリック。  
   （無い場合はこの Bundle ID で新規 App ID を登録してから以下を実施）
3. **App Groups** にチェックを入れる（**Edit** や **Configure** が出たらクリック）。
4. 一覧から **`group.com.kenta0015.todo-reminder`** にチェックを入れて **Save**。
5. 画面を **Save** して変更を確定する。

- [ ] メインアプリの App ID に `group.com.kenta0015.todo-reminder` が紐付いた

---

## Step 3: Provisioning Profile の更新（EAS Build を使う場合）

- **EAS Build を使っている場合**  
  App ID に App Groups を付けて保存すれば、次回ビルド時に EAS が新しい Provisioning Profile を取得するため、**特別な操作は不要**です。
- **手動でプロファイルを管理している場合**  
  - **Profiles** から、メインアプリ用の Profile を選ぶ。  
  - **Edit** → **Generate** などで、更新された Profile を再生成・ダウンロードして Xcode に反映する。

- [ ] EAS 利用のためスキップした / または手動で Profile を更新した

---

## 補足: ウィジェット拡張の App ID（Phase 1 以降）

expo-widgets の Config Plugin を入れて `expo prebuild` や EAS Build を実行すると、ウィジェット拡張用のターゲットが生成されます。  
その際、**ウィジェット拡張用の App ID**（例: `com.kenta0015.bolt-expo-nativewind.TodoWidget`）が EAS によって自動作成される場合があります。

- その App ID が Developer にできたら、同様に **App Groups** を有効化し、**`group.com.kenta0015.todo-reminder`** を選択して保存する。
- Phase 1 でウィジェットを追加したあと、Developer の Identifiers を確認し、必要なら Step 2 と同様の設定をウィジェット用 App ID にも行う。

---

ここまで終えたら、プロジェクト側の **Phase 1（expo-widgets の導入と Config Plugin 設定）** に進めます。
