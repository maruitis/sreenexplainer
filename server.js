// ============================================================
//  Explain My Screen AI — server.js
//  Uses OpenRouter API to analyse screenshots with AI vision.
//
//  To run:   node server.js
//  Server:   http://localhost:3000
// ============================================================


// ------------------------------------------------------------
// 1. Load the packages we need
// ------------------------------------------------------------

require('dotenv').config();            // reads the API key from the .env file

const express = require('express');    // the web server framework
const multer  = require('multer');     // handles image uploads
const path    = require('path');       // helps point to folders
const cors    = require('cors');       // lets the browser talk to this server


// ------------------------------------------------------------
// 2. Create the server
// ------------------------------------------------------------

const app  = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL     = 'https://openrouter.ai/api/v1/chat/completions';
const AI_MODEL           = 'openai/gpt-4o-mini';   // cheap, fast, great at vision


// ------------------------------------------------------------
// 3. Middleware — runs on every request
// ------------------------------------------------------------

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public_html')));


// ------------------------------------------------------------
// 4. Multer — handles image file uploads
// ------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }   // 20 MB max
});


// ------------------------------------------------------------
// 5. Helper — extract image from the request
//
//    Image can arrive two ways:
//    A) As a base64 string in JSON body  { "image": "data:image/png;base64,..." }
//    B) As a file upload (multipart)
// ------------------------------------------------------------

function getImage(req) {

  // Way A: base64 in JSON
  if (req.body && req.body.image) {
    const str     = req.body.image;
    const matches = str.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Image format is not valid');
    return {
      mimeType:   matches[1],   // e.g. "image/png"
      base64Data: matches[2]    // the actual image data
    };
  }

  // Way B: file upload
  if (req.file) {
    return {
      mimeType:   req.file.mimetype,
      base64Data: req.file.buffer.toString('base64')
    };
  }

  throw new Error('No image found in the request');
}


// ------------------------------------------------------------
// 6. Helper — call the OpenRouter AI API
//
//    OpenRouter works like OpenAI — we send a message with
//    text + image, and it sends back an AI reply.
// ------------------------------------------------------------

async function callAI(mimeType, base64Data) {

  // The prompt tells the AI exactly what to do
  const prompt = `You are a kind, patient helper for senior citizens who find technology confusing.

Look at this screenshot and do three things:

1. NAME THE APP — Identify exactly what app, website or program is shown.
   - Give the real, specific name people use every day.
   - Good examples: "WhatsApp", "Gmail", "Facebook", "iPhone Settings",
     "Google Chrome", "Microsoft Word", "YouTube", "Amazon", "Netflix",
     "Windows 11 Settings", "File Explorer", "Google Maps", "Outlook"
   - If you can see a logo, address bar, or title bar — use that.
   - Also give a short type label: what kind of app it is.
   - Good type examples: "Messaging App", "Email", "Social Media",
     "Web Browser", "Online Shop", "Video Streaming", "Phone Settings",
     "Word Processor", "Spreadsheet", "Maps", "Banking App", "News"
   - If you truly cannot tell, say "Unknown App"

2. EXPLAIN THE SCREEN — Describe what the person can see, and locate each important element.
   - Use VERY simple words. No tech jargon.
   - Write bullet points starting with the • symbol.
   - Keep each bullet point to one short sentence.
   - Be warm, friendly and reassuring.
   - Imagine explaining this to your grandmother.
   - For each important button, box, or area you mention, also fill in the "elements" array
     with its approximate position (see below).

3. CHECK FOR SCAMS — Look carefully for anything suspicious, including:
   - Requests for passwords, bank details, or personal information
   - Fake virus or security warnings designed to cause fear
   - "You have won a prize!" or lottery messages
   - Pressure to act immediately or call a phone number urgently
   - Misspelled or strange-looking website addresses
   - Requests to install software or click suspicious links
   - Anything that feels wrong or unusual

Return ONLY valid JSON. No extra text. No markdown. Just the JSON object:

{
  "app": "WhatsApp",
  "appType": "Messaging App",
  "explanation": "• First thing on screen\n• Second thing on screen\n• What they can do here\n• Any important buttons",
  "elements": [
    { "label": "Send button",   "x": 88, "y": 91, "width": 8,  "height": 5 },
    { "label": "Message box",  "x": 5,  "y": 91, "width": 80, "height": 5 },
    { "label": "Chat list",    "x": 0,  "y": 10, "width": 100,"height": 75 }
  ],
  "scam": "safe",
  "scamReason": "Everything looks normal. This appears to be a genuine website."
}

Rules for the elements array:
- Include the 3 to 6 most important visible buttons, boxes, menus, or areas
- x and y are the TOP-LEFT corner of the element, as a PERCENTAGE of the full image width and height
  (so x=0 is the left edge, x=100 is the right edge, y=0 is the top, y=100 is the bottom)
- width and height are also PERCENTAGES of the full image dimensions
- Make sure x + width ≤ 100 and y + height ≤ 100
- Use short plain-English labels (e.g. "Search bar", "Back button", "Profile photo", "Menu")
- If you cannot identify any elements, return an empty array []

Rules for the explanation field:
- Must use bullet points starting with •
- Use only simple words a 70-year-old would understand
- One short sentence per bullet point

Rules for the scam field — use EXACTLY one of these three words:
- "safe"       — nothing suspicious at all
- "suspicious" — something looks a bit odd but may not be a scam
- "scam"       — clear signs this is trying to trick or harm the person

Rules for the scamReason field:
- Always fill this in, even when safe
- Use very simple, plain English — no technical words
- One or two short sentences maximum
- Examples:
  - safe:       "This looks like the real Google website. Everything seems normal."
  - suspicious: "This website is asking for your password in an unusual way. Be careful."
  - scam:       "This is a fake warning trying to scare you. Do not call the phone number shown."`;


  // Build the request body for OpenRouter
  const requestBody = {
    model: AI_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            // Send the image
            type:      'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`
            }
          },
          {
            // Send the instructions
            type: 'text',
            text: prompt
          }
        ]
      }
    ],
    max_tokens: 1024
  };


  // Send the request to OpenRouter
  const response = await fetch(OPENROUTER_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'http://localhost:3000',   // required by OpenRouter
      'X-Title':       'Explain My Screen AI'     // your app name
    },
    body: JSON.stringify(requestBody)
  });


  // Check if OpenRouter returned an error
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
  }

  // Read the response
  const data = await response.json();

  // Extract the AI's reply text
  const replyText = data.choices[0].message.content.trim();

  return replyText;
}


// ------------------------------------------------------------
// 7. POST /api/analyze  — THE MAIN ENDPOINT
//
//    Browser sends image → we send to AI → we send result back
// ------------------------------------------------------------

app.post('/api/analyze', upload.single('image'), async function (req, res) {

  console.log('\n📥  Image received!');

  try {

    // Step 1: Get the image from the request
    const { mimeType, base64Data } = getImage(req);
    console.log('   Image type:', mimeType);

    // Step 2: Send to OpenRouter AI
    console.log('🤖  Sending to AI (' + AI_MODEL + ')...');
    const aiReply = await callAI(mimeType, base64Data);
    console.log('   AI replied.');

    // Step 3: Parse the JSON from the AI reply
    let result;
    try {
      result = JSON.parse(aiReply);
    } catch {
      // Sometimes AI wraps JSON in code blocks — strip them out
      const match = aiReply.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error('AI did not return valid JSON');
      }
    }

    // Step 4: Make sure all fields exist
    if (!result.app)         result.app         = 'Unknown App';
    if (!result.appType)     result.appType     = '';
    if (!result.explanation) result.explanation = 'No explanation available.';
    if (!result.elements)    result.elements    = [];
    if (!result.scam)        result.scam        = 'safe';
    if (!result.scamReason)  result.scamReason  = '';

    // Step 5: Send the result back to the browser
    console.log('✅  Done! App:', result.app, '(' + (result.appType || 'unknown type') + ') | Scam:', result.scam);
    res.json(result);

  } catch (err) {
    console.error('❌  Error:', err.message);
    res.status(500).json({ error: err.message });
  }

});


// ------------------------------------------------------------
// 8. POST /api/rephrase  — make the explanation even simpler
//
//    Receives the current explanation text and asks the AI
//    to reword it in the plainest possible English.
// ------------------------------------------------------------

app.post('/api/rephrase', async function (req, res) {

  console.log('\n✨  Rephrase request received');

  const currentDescription = req.body.currentDescription || '';

  if (!currentDescription) {
    return res.status(400).json({ error: 'No text provided to simplify.' });
  }

  try {
    const prompt = `Please rewrite the following explanation in the simplest words possible.
Imagine you are explaining this to someone who has never used a computer before.
Use very short sentences. Be warm, friendly and reassuring.
Do NOT use any technical words.
Return ONLY the simplified text — no headings, no bullet points, no JSON.

Text to simplify:
${currentDescription}`;

    const response = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:3000',
        'X-Title':       'Explain My Screen AI'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
    }

    const data      = await response.json();
    const simplified = data.choices[0].message.content.trim();

    console.log('✅  Rephrase done.');
    res.json({ simplified });

  } catch (err) {
    console.error('❌  Rephrase error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ------------------------------------------------------------
// 9. POST /api/scam-check  — dedicated scam analysis
//
//    Same image is sent again, but this time the AI focuses
//    only on scam / fraud detection and returns a structured report.
// ------------------------------------------------------------

app.post('/api/scam-check', upload.single('image'), async function (req, res) {

  console.log('\n🚨  Scam-check request received');

  try {
    const { mimeType, base64Data } = getImage(req);

    const scamPrompt = `You are a cybersecurity expert helping senior citizens stay safe online.

Look carefully at this screenshot and check for any signs of a scam, fraud, or phishing attack.

Look for:
- Requests for passwords, bank details, or personal information
- Fake virus or security warnings designed to cause fear or panic
- "You have won a prize!" or lottery messages
- Pressure to act immediately or call a phone number urgently
- Misspelled or strange-looking website addresses
- Requests to install software or click suspicious links
- Unusual pop-up windows or alerts
- Anything that feels wrong, rushed, or too good to be true

Return ONLY valid JSON. No extra text. No markdown:

{
  "status": "safe",
  "reason": "One or two simple sentences explaining why this is safe or dangerous.",
  "alerts": [],
  "whatToDo": "One short sentence telling the person what to do right now."
}

For the status field use EXACTLY one of these three words:
- "safe"       — nothing suspicious at all
- "suspicious" — something looks a bit odd but may not be a definite scam
- "scam"       — clear signs this is trying to trick or harm the person

For the reason field:
- Use very simple, plain English — no technical words at all
- Keep it to one or two short sentences
- Be warm and calm — do not cause unnecessary panic

For the alerts array — add one entry per warning found:
{ "title": "Short plain-English title", "description": "Simple explanation of the danger" }
If everything is safe, leave alerts as an empty array [].

For whatToDo:
- If safe: reassure them they can continue normally
- If suspicious: tell them to be careful and not share personal details
- If scam: tell them to close the page immediately and not click anything`;

    const requestBody = {
      model: AI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Data}` }
            },
            {
              type: 'text',
              text: scamPrompt
            }
          ]
        }
      ],
      max_tokens: 512
    };

    const response = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:3000',
        'X-Title':       'Explain My Screen AI'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
    }

    const data      = await response.json();
    const replyText = data.choices[0].message.content.trim();

    let result;
    try {
      result = JSON.parse(replyText);
    } catch {
      const match = replyText.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        result = {
          status:    'safe',
          reason:    'Could not analyse the image. Please try again.',
          alerts:    [],
          whatToDo:  'Try uploading the image again.'
        };
      }
    }

    // Normalise status to exactly "safe", "suspicious", or "scam"
    const raw = (result.status || result.riskLevel || 'safe').toLowerCase();
    if      (raw === 'scam' || raw === 'critical' || raw === 'high')   result.status = 'scam';
    else if (raw === 'suspicious' || raw === 'medium' || raw === 'low') result.status = 'suspicious';
    else                                                                result.status = 'safe';

    // Make sure all fields exist
    if (!result.reason)   result.reason   = result.recommendation || 'Analysis complete.';
    if (!result.alerts)   result.alerts   = [];
    if (!result.whatToDo) result.whatToDo = 'You can continue using this page normally.';

    console.log('✅  Scam check done. Status:', result.status);
    res.json(result);

  } catch (err) {
    console.error('❌  Scam-check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ------------------------------------------------------------
// 10. POST /api/simplify  — shorten and simplify explanation text
//
//    Input:  { "text": "...explanation to simplify..." }
//    Output: { "simplified": "...plain English version..." }
// ------------------------------------------------------------

app.post('/api/simplify', async function (req, res) {

  console.log('\n🔤  Simplify request received');

  const text = (req.body.text || '').trim();

  if (!text) {
    return res.status(400).json({ error: 'No text provided. Send { "text": "..." }' });
  }

  try {

    const prompt = `You are helping a senior citizen (70+ years old) understand technology.

Rewrite the text below so that:
- It is SHORTER than the original
- Every word is simple — no technical terms at all
- Sentences are very short (under 12 words each)
- The tone is warm, calm and reassuring
- If the original mentions buttons, describe them by what they look like, not their technical name
  (e.g. say "the big blue button" instead of "the primary CTA")

Return ONLY the simplified text. No headings. No bullet points. No JSON. Just plain sentences.

Text to simplify:
${text}`;

    const response = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:3000',
        'X-Title':       'Explain My Screen AI'
      },
      body: JSON.stringify({
        model:      AI_MODEL,
        messages:   [{ role: 'user', content: prompt }],
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
    }

    const data       = await response.json();
    const simplified = data.choices[0].message.content.trim();

    console.log('✅  Simplify done.');
    res.json({ simplified });

  } catch (err) {
    console.error('❌  Simplify error:', err.message);
    res.status(500).json({ error: err.message });
  }

});


// ------------------------------------------------------------
// 11. Fallback — serve index.html for any other page
// ------------------------------------------------------------

app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public_html', 'index.html'));
});


// ------------------------------------------------------------
// 9. Start the server
// ------------------------------------------------------------

app.listen(PORT, function () {
  console.log('');
  console.log('✅  Server running at http://localhost:' + PORT);
  console.log('🤖  AI Model: ' + AI_MODEL);
  console.log('🔑  API key: ' + (OPENROUTER_API_KEY ? '✓ loaded' : '✗ MISSING — add it to .env'));
  console.log('');
});
