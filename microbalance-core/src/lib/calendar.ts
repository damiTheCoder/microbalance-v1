/** Google Calendar events for the company's connected Google account. */
import { google } from 'googleapis';
import { LedgerError } from '../engine/errors.js';
import { gmailConnection, gmailOAuthClient } from './gmail.js';

/** One event to create; times are ISO 8601 strings with an offset or zone. */
export interface CalendarEventInput {
  summary: string;
  description?: string | undefined;
  startTime: string;
  endTime: string;
  attendees?: string[] | undefined;
  createMeet?: boolean | undefined;
}

/** What the AI and the UI receive after creating an event. */
export interface CalendarEventResult {
  eventId: string;
  eventLink: string;
  meetLink: string | null;
}

/** One upcoming event as listed for the assistant. */
export interface UpcomingEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  eventLink: string;
  meetLink: string | null;
  attendees: string[];
}

/** An authorized Calendar client for one company, or null when Google is not connected. */
async function calendarFor(companyId: string): Promise<ReturnType<typeof google.calendar> | null> {
  const connection = await gmailConnection(companyId);
  if (connection === null) return null;
  const client = gmailOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  return google.calendar({ version: 'v3', auth: client });
}

/** Map Google's scope/credential failures to an actionable message. */
function calendarFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient.*scope|insufficient permission|invalid_grant|invalid_scope/i.test(message)) {
    throw new LedgerError(
      'VALIDATION',
      'Google Calendar access is missing. Reconnect your Google account in Integrations to grant calendar access.',
    );
  }
  throw new LedgerError('STATE', `Google Calendar rejected the request: ${message}`);
}

/**
 * Create one event on the connected account's primary calendar.
 *
 * @param companyId - tenant owning the Google connection.
 * @param input - event fields, attendee addresses, and the Meet-link choice.
 * @returns the event id, its Calendar link, and the Meet link when created.
 */
export async function createCalendarEvent(
  companyId: string,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const calendar = await calendarFor(companyId);
  if (calendar === null) {
    throw new LedgerError('VALIDATION', 'Connect your Google account in Integrations before scheduling events.');
  }

  const attendees = (input.attendees ?? [])
    .map(address => address.trim())
    .filter(address => address !== '');

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      conferenceDataVersion: input.createMeet === true ? 1 : 0,
      requestBody: {
        summary: input.summary,
        ...(input.description === undefined ? {} : { description: input.description }),
        start: { dateTime: input.startTime },
        end: { dateTime: input.endTime },
        ...(attendees.length === 0 ? {} : { attendees: attendees.map(email => ({ email })) }),
        ...(input.createMeet === true
          ? {
              conferenceData: {
                createRequest: {
                  requestId: `mb-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              },
            }
          : {}),
      },
    });

    return {
      eventId: response.data.id ?? '',
      eventLink: response.data.htmlLink ?? '',
      meetLink: response.data.hangoutLink ?? null,
    };
  } catch (error: unknown) {
    return calendarFailure(error);
  }
}

/**
 * List the next events on the connected account's primary calendar.
 *
 * @param companyId - tenant owning the Google connection.
 * @param maxResults - how many events to return (default 10).
 * @returns upcoming events in start order.
 */
export async function listUpcomingEvents(
  companyId: string,
  maxResults = 10,
): Promise<UpcomingEvent[]> {
  const calendar = await calendarFor(companyId);
  if (calendar === null) {
    throw new LedgerError('VALIDATION', 'Connect your Google account in Integrations before reading the calendar.');
  }

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items ?? []).map(event => ({
      id: event.id ?? '',
      summary: event.summary ?? '(untitled event)',
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      eventLink: event.htmlLink ?? '',
      meetLink: event.hangoutLink ?? null,
      attendees: (event.attendees ?? [])
        .map(person => person.email ?? '')
        .filter(address => address !== ''),
    }));
  } catch (error: unknown) {
    return calendarFailure(error);
  }
}
