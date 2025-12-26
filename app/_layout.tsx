// FILE: app/_layout.tsx

import { useEffect, useRef, useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
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
        pathname: "/",
        params: { highlightTaskId: taskId },
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

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
