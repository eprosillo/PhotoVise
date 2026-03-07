
import { Session } from '../types';

/**
 * Service to integrate with Google Calendar API.
 * Requirements: Google Cloud Project with Calendar API enabled and OAuth 2.0 configured.
 */
export async function createCalendarEventForSession(session: Session): Promise<void> {
  // Placeholders for environment-provided configurations
  const CALENDAR_ID = 'primary'; 
  // In a real implementation, you would use a valid OAuth2 access token
  const ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || localStorage.getItem('google_access_token');

  if (!ACCESS_TOKEN) {
    console.warn("Photovise Calendar: No valid access token found. Session indexed locally only.");
    return;
  }

  const event = {
    summary: `📸 ${session.name}`,
    location: session.location,
    description: `GENRE: ${session.genre.join(', ')}\n\nNOTES: ${session.notes || 'No notes provided.'}\n\nManaged by Photovise.`,
    start: {
      date: session.date, // All-day event start
    },
    end: {
      date: session.date, // All-day event end
    },
  };

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Calendar API error: ${errorData.error?.message || response.statusText}`);
    }

    console.log("Photovise: Google Calendar event created successfully.");
  } catch (error) {
    console.error("Photovise: Failed to sync with Google Calendar:", error);
    throw error;
  }
}
