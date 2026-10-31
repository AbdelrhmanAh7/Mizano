import { format } from 'date-fns';

/**
 * Whether a document is past its due date on the user's calendar. Due dates are calendar dates
 * stored at UTC midnight, so comparing instants called a bill "overdue" all day on its due date
 * (and from 02:00 in Cairo the day before it was due). Compare yyyy-MM-dd strings instead: the
 * due date's own calendar date against today's local date (review-lessons §4).
 */
export function isPastDue(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  // The API sends the due date as an ISO string whose first 10 characters are the calendar date.
  return dueDate.slice(0, 10) < format(now, 'yyyy-MM-dd');
}
