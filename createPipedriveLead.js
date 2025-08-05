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

    // Step 2: Get all deals for this person
    const existingDealsRes = await api.get('/deals', {
      params: { person_id: personId }
    });

    const existingDeals = existingDealsRes.data.data || [];

    // Step 3: Check if subject already exists
    const subjectTrimmed = (subject || '').trim().toLowerCase();
    const duplicateDeal = existingDeals.find(deal =>
      (deal.title || '').trim().toLowerCase().includes(subjectTrimmed)
    );

    if (duplicateDeal) {
      console.log(`🚫 Skipping: Deal with subject "${subject}" already exists.`);
      return null;
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
      // '3a821f8793ad2a7aec4483f021077a3dccee8f43': forwarderEmail
      '9eab9d7a74f5ba66d3ed9ba4995e5db04589c538': forwarderEmail 
    });

    const dealId = dealRes.data.data.id;
    console.log('💼 Created deal:', dealId);

    // Step 6: Add note
    const content = `📩 Subject: ${subject || '(No Subject)'}\n\n${body || ''}`;
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

