const MAX_READ_NOTIFICATION_IDS = 1000;

export interface NotificationReadState {
  userEmail: string;
  readNotificationIds: string[];
  updatedAt: string;
}

export function notificationReadStateUserKey(userEmail: string): string {
  return userEmail.trim().toLowerCase();
}

export function createNotificationReadState(
  userEmail: string,
  readNotificationIds: Iterable<string>,
  updatedAt = new Date().toISOString(),
): NotificationReadState {
  const ids = Array.from(new Set(Array.from(readNotificationIds).filter((id) => typeof id === 'string' && id.trim().length > 0)));
  return {
    userEmail: notificationReadStateUserKey(userEmail),
    readNotificationIds: ids.slice(-MAX_READ_NOTIFICATION_IDS),
    updatedAt,
  };
}

export function parseNotificationReadState(value: unknown, userEmail: string): NotificationReadState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<NotificationReadState>;
  if (notificationReadStateUserKey(candidate.userEmail ?? '') !== notificationReadStateUserKey(userEmail)) return null;
  if (!Array.isArray(candidate.readNotificationIds) || typeof candidate.updatedAt !== 'string') return null;
  if (Number.isNaN(Date.parse(candidate.updatedAt))) return null;
  return createNotificationReadState(userEmail, candidate.readNotificationIds, candidate.updatedAt);
}

export function newestNotificationReadState(
  first: NotificationReadState | null,
  second: NotificationReadState | null,
): NotificationReadState | null {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second.updatedAt) > Date.parse(first.updatedAt) ? second : first;
}
