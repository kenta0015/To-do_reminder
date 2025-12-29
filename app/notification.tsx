// FILE: app/notification.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActionSheetIOS,
  Modal,
  TextInput,
  Platform,
  Alert,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { loadTasks, Task } from "@/lib/storage";

declare global {
  // eslint-disable-next-line no-var
  var __todoReminderPendingNotificationAction:
    | {
        kind: "change_time";
        taskId: string;
        timeHHmm: string;
        requestedAt: number;
      }
    | undefined;
}

const SNOOZE_NOTIF_ID_MAP_KEY = "@task_snooze_notif_id_v1";
const SKIP_TODAY_MAP_KEY = "@task_skip_today_v1";

function pickFirstString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function getTodayKeyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeTaskId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function getTaskTitle(task: Task | null): string {
  if (!task) return "Task";
  const anyTask = task as unknown as Record<string, unknown>;
  const candidates = [anyTask.title, anyTask.text, anyTask.name, anyTask.body];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "Task";
}

function parseHHmm(input: string): { h: number; m: number } | null {
  const s = input.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  return { h, m };
}

async function readJsonObject(key: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeJsonObject(key: string, obj: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(obj));
}

export default function NotificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const taskId = useMemo(() => {
    const raw = pickFirstString((params as { taskId?: unknown }).taskId);
    return normalizeTaskId(raw);
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [changeModalVisible, setChangeModalVisible] = useState(false);
  const [timeInput, setTimeInput] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setNotFound(false);
      setTask(null);

      if (!taskId) {
        if (!cancelled) {
          setLoading(false);
          setNotFound(true);
        }
        return;
      }

      try {
        const tasks = await loadTasks();
        const found = tasks.find((t: Task) => {
          const anyT = t as unknown as { id?: unknown };
          const id = typeof anyT?.id === "string" ? anyT.id : String(anyT?.id ?? "");
          return id === taskId;
        });

        if (cancelled) return;

        if (found) {
          setTask(found);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const goHomeHighlight = useCallback(
    (opts?: { actionKey?: string }) => {
      if (!taskId) {
        router.replace("/");
        return;
      }

      router.replace({
        pathname: "/",
        params: {
          highlightTaskId: taskId,
          ...(opts?.actionKey ? { actionKey: opts.actionKey } : {}),
        },
      });
    },
    [router, taskId]
  );

  const cancelExistingSnoozeIfAny = useCallback(async () => {
    if (!taskId) return;
    const map = await readJsonObject(SNOOZE_NOTIF_ID_MAP_KEY);
    const existingId = map[taskId];
    if (existingId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(existingId);
      } catch {
        // Ignore cancellation failures; the map will be updated anyway.
      }
      delete map[taskId];
      await writeJsonObject(SNOOZE_NOTIF_ID_MAP_KEY, map);
    }
  }, [taskId]);

  const snooze10Min = useCallback(async () => {
    if (!taskId) return;

    await cancelExistingSnoozeIfAny();

    const title = "Reminder";
    const body = getTaskTitle(task);

    const snoozeId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { taskId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10 * 60,
      },
    });

    const map = await readJsonObject(SNOOZE_NOTIF_ID_MAP_KEY);
    map[taskId] = snoozeId;
    await writeJsonObject(SNOOZE_NOTIF_ID_MAP_KEY, map);
  }, [cancelExistingSnoozeIfAny, task, taskId]);

  const skipToday = useCallback(async () => {
    if (!taskId) return;

    await cancelExistingSnoozeIfAny();

    const todayKey = getTodayKeyLocal();
    const map = await readJsonObject(SKIP_TODAY_MAP_KEY);
    map[taskId] = todayKey;
    await writeJsonObject(SKIP_TODAY_MAP_KEY, map);
  }, [cancelExistingSnoozeIfAny, taskId]);

  const openChangeTime = useCallback(() => {
    setTimeError(null);
    setTimeInput("");
    setChangeModalVisible(true);
  }, []);

  const confirmChangeTime = useCallback(() => {
    if (!taskId) {
      setTimeError("Missing taskId.");
      return;
    }

    const parsed = parseHHmm(timeInput);
    if (!parsed) {
      setTimeError("Please enter time as HH:mm (e.g., 18:40).");
      return;
    }

    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parsed.h,
      parsed.m,
      0,
      0
    );

    if (target.getTime() <= now.getTime()) {
      setTimeError("That time is in the past. Please enter a future time.");
      return;
    }

    const requestedAt = Date.now();

    globalThis.__todoReminderPendingNotificationAction = {
      kind: "change_time",
      taskId,
      timeHHmm: `${String(parsed.h).padStart(2, "0")}:${String(parsed.m).padStart(2, "0")}`,
      requestedAt,
    };

    setChangeModalVisible(false);
    Keyboard.dismiss();

    // The actual "new task + auto-done + undo" logic will be applied on Home screen next.
    goHomeHighlight({ actionKey: String(requestedAt) });
  }, [goHomeHighlight, taskId, timeInput]);

  const showNotNowSheet = useCallback(() => {
    const options = ["10 min", "Change time", "Skip today", "Cancel"];
    const cancelButtonIndex = 3;

    const onPick = async (idx: number) => {
      try {
        if (idx === 0) {
          const actionKey = String(Date.now());
          await snooze10Min();
          goHomeHighlight({ actionKey });
          return;
        }
        if (idx === 1) {
          openChangeTime();
          return;
        }
        if (idx === 2) {
          const actionKey = String(Date.now());
          await skipToday();
          goHomeHighlight({ actionKey });
          return;
        }
      } catch {
        goHomeHighlight({ actionKey: String(Date.now()) });
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          title: "Not now",
        },
        (buttonIndex) => {
          void onPick(buttonIndex);
        }
      );
      return;
    }

    Alert.alert("Not now", "Choose an option", [
      { text: options[0], onPress: () => void onPick(0) },
      { text: options[1], onPress: () => void onPick(1) },
      { text: options[2], onPress: () => void onPick(2) },
      { text: options[3], style: "cancel" },
    ]);
  }, [goHomeHighlight, openChangeTime, skipToday, snooze10Min]);

  const titleText = useMemo(() => getTaskTitle(task), [task]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <Text style={styles.header}>Reminder</Text>

        <View style={styles.card}>
          {loading ? (
            <>
              <Text style={styles.label}>Loading</Text>
              <Text style={styles.value}>...</Text>
            </>
          ) : notFound ? (
            <>
              <Text style={styles.label}>Task</Text>
              <Text style={styles.value}>(Task not found)</Text>
              <Text style={styles.smallNote}>
                This task may have been deleted. Tap &quot;Got it&quot; to return.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Task</Text>
              <Text style={styles.value}>{titleText}</Text>
              <Text style={styles.smallNote}>Task ID: {taskId}</Text>
            </>
          )}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => goHomeHighlight()}>
            <Text style={[styles.buttonText, styles.primaryText]}>Got it</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={showNotNowSheet}>
            <Text style={[styles.buttonText, styles.secondaryText]}>Not now</Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={changeModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChangeModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Change time (today)</Text>

              <Text style={styles.modalLabel}>Time (HH:mm)</Text>
              <TextInput
                value={timeInput}
                onChangeText={(t) => {
                  setTimeInput(t);
                  setTimeError(null);
                }}
                placeholder="18:40"
                placeholderTextColor="#7C7F8F"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.input}
              />

              {!!timeError && <Text style={styles.errorText}>{timeError}</Text>}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalSecondary]}
                  onPress={() => {
                    setChangeModalVisible(false);
                    Keyboard.dismiss();
                  }}
                >
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimary]}
                  onPress={confirmChangeTime}
                >
                  <Text style={styles.modalPrimaryText}>OK</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalHint}>
                If the time is in the past, you must re-enter a future time.
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0B0B0E",
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  card: {
    borderRadius: 14,
    backgroundColor: "#16161C",
    padding: 14,
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: "#A9ABB7",
    fontWeight: "600",
  },
  value: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "700",
    lineHeight: 24,
  },
  smallNote: {
    marginTop: 6,
    fontSize: 12,
    color: "#A9ABB7",
    lineHeight: 16,
  },
  buttonRow: {
    marginTop: "auto",
    paddingBottom: 12,
    gap: 10,
  },
  button: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: "#FFFFFF",
  },
  secondary: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2A2B36",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  primaryText: {
    color: "#0B0B0E",
  },
  secondaryText: {
    color: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#16161C",
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalLabel: {
    fontSize: 12,
    color: "#A9ABB7",
    fontWeight: "700",
  },
  input: {
    height: 46,
    borderRadius: 12,
    backgroundColor: "#0B0B0E",
    borderWidth: 1,
    borderColor: "#2A2B36",
    paddingHorizontal: 12,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 12,
    color: "#FF6B6B",
    fontWeight: "700",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  modalButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimary: {
    backgroundColor: "#FFFFFF",
  },
  modalSecondary: {
    backgroundColor: "#0B0B0E",
    borderWidth: 1,
    borderColor: "#2A2B36",
  },
  modalPrimaryText: {
    color: "#0B0B0E",
    fontSize: 16,
    fontWeight: "800",
  },
  modalSecondaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  modalHint: {
    marginTop: 2,
    fontSize: 12,
    color: "#A9ABB7",
    lineHeight: 16,
  },
});
