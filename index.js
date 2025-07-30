require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { createLead } = require('./createPipedriveLead');
const imapConfig = {
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASS,
  host: process.env.IMAP_HOST,
  port: parseInt(process.env.IMAP_PORT),
  tls: true
};

function startEmailListener() {
  const imap = new Imap(imapConfig);
  let readyToFetch = false;

  imap.once('ready', () => {
    imap.openBox('INBOX', false, () => {
      console.log('Connected. Waiting for new mail...');
      readyToFetch = true; // Now safe to fetch only new arrivals
    });

    imap.on('mail', () => {
      if (!readyToFetch) return;

      imap.search(['UNSEEN'], (err, results) => {
        if (err || !results || results.length === 0) return;

        const f = imap.fetch(results, { bodies: '' });
        f.on('message', msg => {
          msg.on('body', stream => {
            simpleParser(stream, async (err, parsed) => {
              if (err) return console.error('Parser error:', err);

         let sender = parsed.from.value[0];
let name = sender.name || '';
let email = sender.address;

// Check if this is a forwarded message
const body = parsed.text || parsed.html || '';
const forwardedMatch = body.match(/From:\s*(.*)\s*<([\w.-]+@[\w.-]+)>/i);

if (forwardedMatch) {
  name = forwardedMatch[1].trim();
  email = forwardedMatch[2].trim();
  console.log('📩 Forwarded email detected!');
}


              console.log('📬 New Email');
              console.log('From:', name, `<${email}>`);
              console.log('Subject:', parsed.subject);
              console.log('Body Preview:', body.slice(0, 300));
              await createLead(name, email, body);
            });
          });

          msg.once('attributes', attrs => {
            imap.addFlags(attrs.uid, ['\\Seen'], () => {});
          });
        });
      });
    });
  });

  imap.once('error', console.error);
  imap.once('end', () => {
    console.log('Connection ended. Reconnecting...');
    setTimeout(startEmailListener, 5000);
  });

  imap.connect();
}


startEmailListener();
