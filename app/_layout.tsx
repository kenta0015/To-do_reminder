// FILE: app/_layout.tsx

import { useEffect, useRef, useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionCallback } from "expo-quick-actions/hooks";
import { useFrameworkReady } from "@/hooks/useFrameworkReady";

declare global {
  // eslint-disable-next-line no-var
  var __todoReminderNotificationTap:
    | { taskId: string; tappedAt: number }
    | undefined;
}

function extractTaskId(
  response: Notifications.NotificationResponse | null
): string | null {
  if (!response) return null;

  const data = response.notification.request.content.data as unknown;
  if (!data || typeof data !== "object") return null;

  const taskId = (data as { taskId?: unknown }).taskId;
  if (typeof taskId !== "string") return null;

  const trimmed = taskId.trim();
  if (!trimmed) return null;

  return trimmed;
}

export default function RootLayout() {
  useFrameworkReady();

  const router = useRouter();
  const lastHandledKeyRef = useRef<string | null>(null);

  const handleNotificationTap = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      const taskId = extractTaskId(response);
      if (!taskId || !response) return;

      const key = `${response.notification.request.identifier}:${taskId}`;
      if (lastHandledKeyRef.current === key) return;
      lastHandledKeyRef.current = key;

      globalThis.__todoReminderNotificationTap = {
        taskId,
        tappedAt: Date.now(),
      };

      router.replace({
        pathname: "/notification",
        params: { taskId },
      });
    },
    [router]
  );

  useEffect(() => {
    let mounted = true;

    void Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (!mounted) return;
      handleNotificationTap(resp);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      handleNotificationTap(resp);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [handleNotificationTap]);

  // Quick Actions (app icon long-press): register 4 items
  useEffect(() => {
    void QuickActions.setItems([
      {
        id: "add",
        title: "Add reminder",
        icon: "add",
        params: { type: "focusAdd" },
      },
      {
        id: "add2m",
        title: "Add in 2 minutes",
        subtitle: "Quick demo reminder",
        icon: "alarm",
        params: { type: "quickAdd", when: "in 2 minutes", title: "Quick reminder" },
      },
      {
        id: "important",
        title: "Open Important",
        icon: "task",
        params: { type: "openImportant" },
      },
      {
        id: "stats",
        title: "Open Statistics",
        icon: "taskCompleted",
        params: { type: "openStats" },
      },
    ]);
  }, []);

  useQuickActionCallback(
    useCallback(
      (action: { params?: Record<string, string | number | boolean | null | undefined> | null }) => {
        const type = action.params?.type as string | undefined;
        if (!type) return;

        if (type === "openStats") {
          router.replace("/(tabs)/stats");
          return;
        }

        if (type === "focusAdd") {
          router.replace({ pathname: "/(tabs)", params: { focusAdd: "1" } });
          return;
        }

        if (type === "quickAdd") {
          const when = String(action.params?.when ?? "in 2 minutes");
          const title = String(action.params?.title ?? "Quick reminder");
          router.replace({ pathname: "/(tabs)", params: { quickAdd: when, quickAddTitle: title } });
          return;
        }

        if (type === "openImportant") {
          router.replace({ pathname: "/(tabs)", params: { openImportant: "1" } });
        }
      },
      [router]
    )
  );

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="notification" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
