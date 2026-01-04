# No More Procrastination Reminders (iOS)

**iOS-first, offline todo + reminders** built for people who don’t want “task management” — they want **fast capture, reliable reminders, and zero maintenance**.  
Designed around **strict time input**, **local notification scheduling**, and an **Inbox-first Home** that prioritizes what’s actionable now.  
No accounts, no backend, no sync — **on-device persistence + timezone-aware behavior** with graceful degradation when permissions aren’t granted.

---

## Outcomes & value (what this delivers)

- **Low-friction capture:** a **2-step flow** (task → when) optimized for speed and minimal cognitive load
- **Reliable reminders:** schedules **local notifications** (no network dependency)
- **Inbox-first prioritization:** auto-groups unfinished tasks into **5 actionable sections** (Late / Today / Tomorrow / This Week / Completed Today)
- **Automatic cleanup:** reduces backlog creep with a **7-day overdue expiry window** (tasks disappear from Home after prolonged inactivity; data remains stored)

---

## Core product behavior

### 1) Fast capture + strict validation

- Create a task in **two steps**: enter the task, then enter **when** to be reminded.
- Uses a **strict date/time parser** to prevent accidental scheduling from ambiguous input.
- Invalid input is **blocked at the source**: inline validation prevents creating a task until the time is valid.

**Common accepted formats**

- `2026/06/23 10:00`
- `today 21:00`
- `tomorrow 9am`

If the input is invalid, the app shows an inline error and the task is not created until fixed.

---

### 2) Home screen that surfaces “what matters now”

Home is built around **unfinished tasks** and presents them in clear, time-based sections:

- **Late** (overdue)
- **Today**
- **Tomorrow**
- **This Week** (Sun–Sat)
- **Completed Today** (shown temporarily for visible progress)

**Carryover behavior (Late)**  
Overdue tasks automatically roll into **Late** if you didn’t complete them.

**Quiet disappearance (anti-backlog)**  
To prevent “infinite overdue lists”:

- Tasks remain visible on Home (including Late) until they become **expired**
- A task is **expired after >7 days overdue**
- Expired tasks **disappear from Home** (data remains on-device)

---

## Notifications (event-driven UX)

When a reminder fires, the notification opens a dedicated screen with two primary actions:

### ✅ Got it

- Returns to Home
- Briefly highlights the related task for quick context
- Does **not** auto-complete (completion stays explicit on Home)

### 😴 Not now

Provides controlled deferral actions:

- **Snooze 10 min**  
  Updates the task’s reminder time to **now + 10 minutes**, then reschedules.

- **Change time**  
  Enter a new **time (HH:mm) for today**.  
  The app **creates a new task** for the updated time and **automatically marks the original as completed** (with Undo support).

- **Skip**  
  Updates the task’s reminder time to **+1 day**, then reschedules.

After any action, the app returns to Home and highlights the affected task.

---

## ⭐ Important tasks (prioritized workflow)

- Mark tasks as **Important (⭐)**
- View Important tasks in a **modal list**
- **Reorder** Important tasks
- **Complete** tasks directly from the Important list

---

## Technical stack (developer-facing)

- **Platform:** iOS (iPhone) only
- **Architecture:** offline-first, on-device persistence
- **Storage:** AsyncStorage (local)
- **Notifications:** expo-notifications (local scheduling)
- **Routing / UI:** Expo Router
- **Language:** TypeScript
- **Timezone:** device local timezone

**No accounts. No sync. No server.**  
This intentionally removes backend complexity and focuses on **deterministic local state + reliable notification scheduling**.

---

## Engineering highlights (transferable skills)

- **Strict input parsing + validation gates** to prevent bad state entering the system
- **State transitions** that support deferrals (Snooze/Skip/Change-time) and post-action highlighting
- **Offline-first UX** with graceful degradation (tasks still persist when notification permission is denied)
- **Time-bucketed prioritization** (Late/Today/Tomorrow/Week) designed for clarity and actionability
- **Backlog control policy** via a defined expiry window (7-day overdue threshold)

---

## Current non-goals (intentional scope)

- No search
- No tags/categories
- No recurring reminders (beyond Snooze)
- No daily re-notify loop for Late tasks
- No cloud sync / multi-device support

---

## Quick start (dev)

### Install

```bash
npm install
```

Run (iOS)

```
npx expo start

```

Note: Notification behavior varies by environment (simulator vs real device).
If reminders matter for your evaluation, test on a real iPhone to validate scheduling and delivery.
