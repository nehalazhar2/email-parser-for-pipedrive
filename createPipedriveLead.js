require('dotenv').config();
const axios = require('axios');

const api = axios.create({
  baseURL: `https://${process.env.PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1`,
  params: { api_token: process.env.PIPEDRIVE_API_KEY }
});

async function createLead({ subject, body, forwarderEmail, originalSender,senderName }) {
  try {
    let personId;
    let userId = null;

    // 1. Find existing person for original sender (contact)
    const searchRes = await api.get('/persons/search', {
      params: { term: originalSender, fields: 'email' }
    });
    const items = searchRes.data.data?.items || [];

    if (items.length) {
      personId = items[0].item.id;
      console.log('✅ Found existing person:', personId);
    } else {
      // Create new person with original sender email
      const createPerson = await api.post('/persons', {
        name: senderName,
        email: originalSender
      });
      personId = createPerson.data.data.id;
      console.log('🆕 Created person:', personId);
    }

    // 2. Try to find matching user for the forwarder email
    const usersRes = await api.get('/users');
    const users = usersRes.data.data || [];
    const matchedUser = users.find(user => user.email.toLowerCase() === forwarderEmail.toLowerCase());

    if (matchedUser) {
      userId = matchedUser.id;
      console.log('👤 Matched forwarder to user ID:', userId);
    } else {
      console.log('⚠️ No matching user for forwarder email:', forwarderEmail);
    }

    // 3. Create new deal
    const dealRes = await api.post('/deals', {
      title: `Ticket via email :${senderName}`,
      person_id: personId,
      user_id: userId || undefined, // optional, only include if found
      '3a821f8793ad2a7aec4483f021077a3dccee8f43': forwarderEmail 
    });

    const dealId = dealRes.data.data.id;
    console.log('💼 Created deal:', dealId);

    // 4. Add note with subject and body
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

