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
      console.log('📥 IMAP Connected. Listening for new emails...');
      readyToFetch = true;
    });

    imap.on('mail', () => {
      if (!readyToFetch) return;

      imap.search(['UNSEEN'], (err, results) => {
        if (err || !results || results.length === 0) return;

        const f = imap.fetch(results, { bodies: '' });
        f.on('message', msg => {
          msg.on('body', stream => {
            simpleParser(stream, async (err, parsed) => {
              if (err) return console.error('❌ Parser error:', err);

              const forwarder = parsed.from.value[0].address;
              const subject = parsed.subject || '';
              const body = parsed.text || parsed.html || '';

              // ✅ Detect forwarded message
              const isForwarded = subject.toLowerCase().startsWith('fw:') || /forwarded message/i.test(body);
              if (!isForwarded) {
                console.log('⏭️ Not a forwarded email. Skipping.');
                return;
              }

              // ✅ Try to extract original sender from body
              const forwardedMatch = body.match(/From:\s*(.*?)\s*<([\w.-]+@[\w.-]+)>/i);
              const originalName = forwardedMatch ? forwardedMatch[1].trim() : null;
              const originalEmail = forwardedMatch ? forwardedMatch[2].trim() : null;

              if (!originalEmail) {
                console.log('⚠️ Could not detect original sender. Skipping.');
                return;
              }

              console.log('📬 Forwarded Email Detected');
              console.log('Forwarder:', forwarder);
              console.log('Original:', originalName, `<${originalEmail}>`);
              console.log('Subject:', subject);
              console.log('Body Preview:', body.slice(0, 300));

              // ✅ Call createLead with both emails
              await createLead({
                subject,
                body,
                forwarderEmail: forwarder,
                originalSender: originalEmail,
                senderName:originalName
              });
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
    console.log('🔁 Connection ended. Reconnecting...');
    setTimeout(startEmailListener, 5000);
  });

  imap.connect();
}

startEmailListener();

