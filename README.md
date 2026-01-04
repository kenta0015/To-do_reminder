# No More Procrastination Reminders

A tiny, low-friction **iOS-only** todo + reminder app designed for people who _don’t want to manage tasks_—just capture them fast, get reminded, and check them off.

---

## What this app is

- **Two-step capture:** write the task → set _when_ you want to be reminded
- **Local reminders:** schedules **local notifications** on your device
- **Inbox-first Home:** shows what matters _now_ (plus overdue items) without turning into a “task management project”
- **Gentle cleanup:** unfinished tasks eventually disappear from Home after a grace window

---

## Platform / storage

- **Platform:** iOS (iPhone) only
- **Storage:** on-device (AsyncStorage)
- **Notifications:** local notifications (expo-notifications)
- **Timezone:** uses your device’s local timezone

No accounts. No sync. No server.

---

## Quick start (user flow)

1. On **Home**, type what you need to do.
2. Enter **when** you want to be reminded.
3. The task is saved and (if permission is granted) a local notification is scheduled.

If notification permission is **not granted**, the task is still saved, but no reminder will fire.

---

## Entering “when” (time input)

The app uses a **strict** date/time parser. It accepts common formats and rejects ambiguous ones.

Examples of inputs that commonly work:

- `2026/06/23 10:00`
- `today 21:00`
- `tomorrow 9am`

If the input is invalid, you’ll see an inline error and the task won’t be created until it’s fixed.

---

## Home screen behavior

Home is built around **unfinished tasks**, grouped into sections:

- **Late** (overdue)
- **Today**
- **Tomorrow**
- **This Week** (Sun–Sat)
- **Completed Today** (shown at the bottom for a bit of “done” satisfaction)

### Carryover (overdue tasks)

If a task’s reminder time has passed and you didn’t complete it, it shows under **Late**.

### “Quiet disappearance” window

Unfinished tasks are not shown forever:

- A task remains visible on Home (including Late) until it becomes **expired**
- A task is considered expired when it has been overdue for **more than 7 days**
- Expired tasks **disappear from Home** (data stays on-device)

---

## Notifications

When a reminder fires, the notification opens a screen with two main actions:

### ✅ Got it

- Returns you to Home
- Highlights the related task briefly
- Does **not** auto-complete the task (completion happens from Home)

### 😴 Not now

Opens actions:

- **Snooze 10 min**  
  Updates the task’s reminder time to **now + 10 minutes**, then reschedules the notification.

- **Change time**  
  Lets you enter a new **time (HH:mm) for today**.  
  The app **creates a new task** for the updated time and **automatically marks the original task as completed** (with Undo support).

- **Skip**  
  Updates the task’s reminder time to **+1 day**, then reschedules.

After these actions, the app returns you to Home and highlights the affected task.

---

## ⭐ Important (starred) tasks

You can mark tasks as **Important (⭐)**.

- Important tasks are accessible via a **modal list**
- You can **reorder** important tasks inside that modal
- You can **complete** tasks from the Important list

---

## What this app does NOT do (current state)

- No search
- No categories/tags
- No recurring reminders (other than Snooze)
- No daily re-notify loop for Late tasks
- No cloud sync / multi-device support

---

## Development

This is an Expo Router + TypeScript project.

### Install

```bash
npm install
```

### Run (iOS)

```bash
npx expo start
```

Notifications may behave differently depending on how you run the app (simulator vs device). Always test reminder behavior on a real iPhone if notifications matter for your workflow.
