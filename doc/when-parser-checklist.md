# Strict When Parser — Dev Checklist

Purpose: Quick regression checklist for the strict when-input parser.
If any item below changes behavior, treat it as a breaking change.

## Where this applies

- Home “Add task” when-input (Strict parser only)

## MUST ACCEPT (OK)

- `2026/01/05 14:00` (legacy exact format)
- `tomorrow 9am`
- `tomorrow 9 am`
- `tomorrow 21:00`
- `Next Friday 6:30am`
- `next friday 6:30 am`
- `in 5 hours`
- `in 30 minutes`
- `23:59` (today at 23:59)

## MUST REJECT (Error message must match exactly)

### Time missing

- Input: `tomorrow`
- Error: `Please include a time (e.g., 'tomorrow 9am' or 'tomorrow 21:00').`

### AM/PM required

- Input: `tomorrow 9`
- Input: `tomorrow 12`
- Input: `tomorrow 9:30`
- Input: `next friday 9`
- Error: `Please specify AM or PM (e.g., 'tomorrow 9am' or 'tomorrow 9pm').`

### Day missing

- Input: `9am`
- Input: `at 9am`
- Error: `Please include a day and a time (e.g., 'today 9am' or 'tomorrow 9am').`

### Cannot understand

- Input: `asdf`
- Error: `Couldn't understand. Examples: 'tomorrow 9am', 'in 5 hours', '2026/01/05 14:00', 'tomorrow 21:00'.`

### Ambiguous

- Input: (any case that returns 2+ chrono results)
- Error: `That looks ambiguous. Please be more specific (add a day/time like 'tomorrow 9am').`

### Past time

- Input: any parsed time strictly earlier than “now (rounded to minute)”
- Error: `Time must be now or later`

## Quick manual test flow (Home)

1. Add each MUST ACCEPT input → task is created (correct date/time)
2. Add each MUST REJECT input → error shows and matches exactly
3. Confirm no “tomorrow 9” silently schedules at a default time (should always error)
