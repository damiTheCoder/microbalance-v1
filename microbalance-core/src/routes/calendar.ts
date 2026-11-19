/** Google Calendar endpoints used by the assistant and the Integrations page. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LedgerError } from '../engine/errors.js';
import { createCalendarEvent, listUpcomingEvents } from '../lib/calendar.js';

const createEventBody = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  attendees: z.array(z.string().min(1)).optional(),
  createMeet: z.boolean().optional(),
});

/** Create events and list the upcoming ones for the signed-in company. */
export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/calendar/create', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const input = createEventBody.parse(request.body);
    return { data: await createCalendarEvent(companyId, input) };
  });

  app.get('/api/calendar/upcoming', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    return { data: await listUpcomingEvents(companyId, 10) };
  });
}
