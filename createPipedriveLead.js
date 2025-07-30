
require('dotenv').config();
const axios = require('axios');


const api = axios.create({
  baseURL: `https://${process.env.PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1`,
  params: { api_token: process.env.PIPEDRIVE_API_KEY }
});

async function createLead(name, email, note) {
  try {
    
    const searchRes = await api.get('/persons/search', {
      params: { term: email, fields: 'email' }
    });
    const items = searchRes.data.data?.items || [];
    let personId;

    if (items.length) {
      personId = items[0].item.id;
      console.log('✅ Found existing person:', personId);
    } else {
      // 2. Create new person
      const createPerson = await api.post('/persons', {
        name,
        email: email
      });
      personId = createPerson.data.data.id;
      console.log('🆕 Created person:', personId);
    }

    // 3. Create new deal
    const dealRes = await api.post('/deals', {
      title: `Lead via email: ${name}`,
      person_id: personId
    });
    const dealId = dealRes.data.data.id;
    console.log('💼 Created deal:', dealId);

    // 4. Add note if provided
if (note) {
  const MAX = 90000;
  if (note.length <= MAX) {
    await api.post('/notes', { content: note, deal_id: dealId, person_id: personId });
  } else {
    const parts = [];
    for (let i = 0; i < note.length; i += MAX) {
      parts.push(note.slice(i, i + MAX));
    }
    for (const chunk of parts) {
      await api.post('/notes', { content: chunk, deal_id: dealId, person_id: personId });
    }
  }
}


    return { personId, dealId };
  } catch (err) {
    console.error('❌ Pipedrive API error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { createLead };
