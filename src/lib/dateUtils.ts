/**
 * Date and time formatting utilities for conversations and chat messages.
 */

/**
 * Formats a message timestamp for conversation previews (e.g. sidebar contact card):
 * - If the message was sent today: displays timing (e.g. "09:39 PM").
 * - If the day has ended and the next day is continuing: displays date only with month (e.g. "16 Oct").
 */
export function formatConversationTimestamp(dateInput: string | number | Date): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Checks if two dates fall on different calendar days.
 */
export function isDifferentCalendarDay(
  date1Input: string | number | Date,
  date2Input?: string | number | Date
): boolean {
  if (!date2Input) return true;
  const d1 = new Date(date1Input);
  const d2 = new Date(date2Input);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;

  return (
    d1.getDate() !== d2.getDate() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getFullYear() !== d2.getFullYear()
  );
}

/**
 * Formats a date divider label for the chat conversation stream:
 * - "Today" for current day
 * - "Yesterday" for yesterday
 * - "16 Oct" (date only with month) for earlier dates
 */
export function formatDateDivider(dateInput: string | number | Date): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  });
}
