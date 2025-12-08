require('dotenv').config();
const axios = require('axios');

const api = axios.create({
  baseURL: `https://${process.env.PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1`,
  params: { api_token: process.env.PIPEDRIVE_API_KEY }
});

async function createLead({ subject, body, forwarderEmail, originalSender, senderName }) {
  try {
    let personId;
    let userId = null;

    // Step 1: Find or create person
    const searchRes = await api.get('/persons/search', {
      params: { term: originalSender, fields: 'email' }
    });
    const items = searchRes.data.data?.items || [];

    if (items.length) {
      personId = items[0].item.id;
      console.log('✅ Found existing person:', personId);
    } else {
      const createPerson = await api.post('/persons', {
        name: senderName,
        email: originalSender
      });
      personId = createPerson.data.data.id;
      console.log('🆕 Created person:', personId);
    }

    // Step 2: Get deals (search globally, do not restrict by sender)
    // We'll request a larger page to increase chance of finding a matching "Ticket: <subject>" title.
    const existingDealsRes = await api.get('/deals', { params: { start: 0, limit: 500 } });
    const existingDeals = existingDealsRes.data.data || [];

    // Step 3: Check for exact subject match against deal titles like: "Ticket: Subject (Optional info)"
    const subjectTrimmed = (subject || '').trim().toLowerCase();

    // Helper to extract the ticket subject portion from a deal title that begins with "Ticket:"
    const extractTicketSubject = title => {
      if (!title) return null;
      const m = title.match(/^\s*Ticket:\s*(.+?)(?:\s*\(|$)/i);
      if (m && m[1]) return m[1].trim().toLowerCase();
      return null;
    };

    // Find a deal whose ticket subject part exactly matches the incoming email subject.
    const exactSubjectMatch = existingDeals.find(deal => {
      const ticketSubj = extractTicketSubject(deal.title);
      return ticketSubj && ticketSubj === subjectTrimmed;
    });

    if (exactSubjectMatch) {
      // If we have an exact Ticket: <subject> match, add a note to that deal instead of creating a new one.
      const dealIdToUpdate = exactSubjectMatch.id;
      console.log(`♻️ Found existing deal (ID: ${dealIdToUpdate}) with exact subject match. Adding note.`);

      const htmlBody = (body || '').replace(/\n/g, '<br>');
      const content = `<b>📩 Subject:</b> ${subject || '(No Subject)'}<br><br>${htmlBody}`;
      const MAX = 90000;
      if (content.length <= MAX) {
        await api.post('/notes', { content, deal_id: dealIdToUpdate, person_id: personId });
      } else {
        const parts = [];
        for (let i = 0; i < content.length; i += MAX) {
          parts.push(content.slice(i, i + MAX));
        }
        for (const chunk of parts) {
          await api.post('/notes', { content: chunk, deal_id: dealIdToUpdate, person_id: personId });
        }
      }

      return { personId, dealId: dealIdToUpdate };
    }

    // Step 4: Match forwarder email to user
    const usersRes = await api.get('/users');
    const users = usersRes.data.data || [];
    const matchedUser = users.find(user => user.email.toLowerCase() === forwarderEmail.toLowerCase());

    if (matchedUser) {
      userId = matchedUser.id;
      console.log('👤 Matched forwarder to user ID:', userId);
    } else {
      console.log('⚠️ No matching user for forwarder email:', forwarderEmail);
    }

    // Step 5: Create deal (subject included in title)
    const dealRes = await api.post('/deals', {
      title: `Ticket: ${subject || 'No Subject'} (${senderName})`,
      person_id: personId,
      user_id: userId || undefined,
      '3a821f8793ad2a7aec4483f021077a3dccee8f43': forwarderEmail
      // '9eab9d7a74f5ba66d3ed9ba4995e5db04589c538': forwarderEmail 
    });

    const dealId = dealRes.data.data.id;
    console.log('💼 Created deal:', dealId);

    // Step 6: Add note
      const htmlBody = (body || '').replace(/\n/g, '<br>');
    const content = `<b>📩 Subject:</b> ${subject || '(No Subject)'}<br><br>${htmlBody}`;
    const MAX = 90000;
    if (content.length <= MAX) {
      await api.post('/notes', { content, deal_id: dealId, person_id: personId });
    } else {
      const parts = [];
      for (let i = 0; i < content.length; i += MAX) {
        parts.push(content.slice(i, i + MAX));
      }
      for (const chunk of parts) {
        await api.post('/notes', { content: chunk, deal_id: dealId, person_id: personId });
      }
    }

    return { personId, dealId };
  } catch (err) {
    console.error('❌ Pipedrive API error:', err.response?.data || err.message);
    return null;
  }
}



module.exports = { createLead };

