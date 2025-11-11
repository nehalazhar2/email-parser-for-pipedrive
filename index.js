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

              // This is 'MyMailbox@legacie.co.uk' which does the auto-forwarding
              const forwarder = parsed.from.value[0].address; 

              const subject = parsed.subject || '';
              const body = parsed.text || parsed.html || '';

              // --- Modified Logic Start ---

              // ✅ Use matchAll to find *all* "From:" lines in a multi-forwarded email
              const fromMatches = [...body.matchAll(/From:\s*(.*?)\s*<([\w.-]+@[\w.-]+)>/gi)];

              if (fromMatches.length === 0) {
                console.log('⚠️ Could not detect original sender in body. Skipping.');
                return;
              }

              // ✅ The *last* match is the innermost (true) original sender for Pipedrive
              const lastMatch = fromMatches[fromMatches.length - 1];
              const originalName = lastMatch[1].trim();
              const originalEmail = lastMatch[2].trim();

              // --- New Edge Case Logic ---
              // Check *all* senders found in the body.
              // Skip if *any* sender (except our own auto-forwarding mailbox)
              // is from the blocked domain.

              const blockedDomain = '@legacie.co.uk';
              // 'forwarder' is our own auto-forwarding mailbox
              const myMailboxAddressLower = forwarder.toLowerCase();

              // Get all email addresses from all "From:" matches
              const allEmailsInBody = fromMatches.map(match => match[2].trim().toLowerCase());

              // Check if any email in the body...
              const hasBlockedSenderInChain = allEmailsInBody.some(email =>
                // ...ends with the blocked domain
                email.endsWith(blockedDomain) &&
                // ...and is NOT our own auto-forwarding mailbox
                email !== myMailboxAddressLower
              );

              if (hasBlockedSenderInChain) {
                console.log(`⏭️ Skipping email: A sender in the forwarding chain (other than ${forwarder}) is from the blocked domain ${blockedDomain}.`);
                return;
              }
              // --- Modified Logic End ---

              console.log('📬 Forwarded Email Detected');
              console.log('Forwarder (My Mailbox):', forwarder);
              console.log('Original (Innermost):', originalName, `<${originalEmail}>`);
              console.log('Subject:', subject);
              console.log('Body Preview:', body.slice(0, 300));

              // ✅ Call createLead with both emails
              await createLead({
                subject,
                body,
                forwarderEmail: forwarder,
                originalSender: originalEmail,
                senderName: originalName
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