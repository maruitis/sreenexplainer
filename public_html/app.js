// ============================================================
//  Explain My Screen AI — app.js
//  Beginner-friendly JavaScript for the website.
//
//  What this file does:
//   1. Listens for an image upload
//   2. Shows a preview of the uploaded image
//   3. Sends the image to the server (/api/analyze)
//   4. Displays the AI explanation on the page
// ============================================================


// ------------------------------------------------------------
// STEP 1 — Grab the HTML elements we need to work with
// ------------------------------------------------------------

const fileInput      = document.getElementById("fileInput");
const uploadBtn      = document.getElementById("uploadBtn");
const previewSection = document.getElementById("previewSection");
const previewImg     = document.getElementById("previewImg");
const analyseBtn     = document.getElementById("analyseBtn");
const resultsSection = document.getElementById("resultsSection");
const explanationBox = document.getElementById("explanationBox");
const loadingMsg     = document.getElementById("loadingMsg");
const readAloudBtn   = document.getElementById("readAloudBtn");
const simplerBtn     = document.getElementById("simplerBtn");
const scamBtn        = document.getElementById("scamBtn");
const scamSection    = document.getElementById("scamSection");
const scamResult     = document.getElementById("scamResult");

// ── Screen capture & crop elements ──────────────────────────
const captureBtn     = document.getElementById("captureBtn");
const captureSection = document.getElementById("captureSection");
const cropCanvas     = document.getElementById("cropCanvas");
const cropStatus     = document.getElementById("cropStatus");
const cropConfirmBtn = document.getElementById("cropConfirmBtn");
const useFullBtn     = document.getElementById("useFullBtn");
const recaptureBtn   = document.getElementById("recaptureBtn");


// ------------------------------------------------------------
// STEP 2 — Store the image and AI results so we can reuse them
// ------------------------------------------------------------

let currentImage    = null;   // image sent to analysis (base64)
let lastExplanation = "";     // last AI explanation text
let isSpeaking      = false;  // is Read Aloud running?

// ── Screen capture & crop state ──────────────────────────────
let screenshotDataURL  = null;   // full captured screenshot (base64)
let screenshotImg      = null;   // Image object of the screenshot
let cropSelecting      = false;  // is user currently dragging?
let cropHasSelection   = false;  // has user drawn a box yet?
let cropSX = 0, cropSY = 0;     // selection start (canvas pixels)
let cropEX = 0, cropEY = 0;     // selection end   (canvas pixels)


// ============================================================
//  BACKEND — all AI calls go to our Render.com server.
//  The API key lives there, hidden. Seniors just click — done.
// ============================================================

const BACKEND = "https://explain-my-screen.onrender.com";



// ------------------------------------------------------------
// STEP 3 — When the big upload button is clicked, open the file picker
// ------------------------------------------------------------

uploadBtn.addEventListener("click", function () {
  fileInput.click(); // this opens the "choose file" window
});


// ------------------------------------------------------------
// STEP 4 — When the user picks a file, show a preview
// ------------------------------------------------------------

fileInput.addEventListener("change", function (event) {

  const file = event.target.files[0]; // get the first file they chose

  // Make sure they actually picked something
  if (!file) return;

  // Make sure it's an image (not a PDF or Word doc, etc.)
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file (JPG, PNG, etc.)");
    return;
  }

  // FileReader reads the file and converts it to a base64 string
  // (base64 is just a way to turn a file into plain text so we can send it)
  const reader = new FileReader();

  reader.onload = function (e) {
    currentImage = e.target.result; // save the image as base64 text

    // Show the image preview on the page
    previewImg.src = currentImage;
    revealSection(previewSection);

    // Hide old results if user is uploading a new image
    resultsSection.style.display = "none";
    scamSection.style.display    = "none";
    lastExplanation = "";
    stopSpeaking();
    clearOverlay();   // wipe any highlight boxes from the previous image

    // Scroll down so the user can see the preview
    previewSection.scrollIntoView({ behavior: "smooth" });
  };

  reader.readAsDataURL(file); // this triggers reader.onload above
  event.target.value = "";    // reset so the same file can be picked again
});


// ------------------------------------------------------------
// STEP 5 — When "Analyse My Screen" is clicked, send image to server
// ------------------------------------------------------------

analyseBtn.addEventListener("click", async function () {

  // Make sure there is an image to send
  if (!currentImage) {
    showToast("Please upload an image first.");
    return;
  }

  // Show "please wait" and hide old results
  loadingMsg.style.display    = "flex";
  resultsSection.style.display = "none";
  scamSection.style.display   = "none";
  stopSpeaking();

  try {

    // ----- Send image to our backend server -----
    const response = await fetch(BACKEND + "/api/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ image: currentImage })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(function () { return {}; });
      throw new Error(errorData.error || "Server error — please try again.");
    }

    const data = await response.json();

    // ----- Display the results on the page -----
    displayResults(data);

  } catch (error) {
    // Something went wrong — show the error to the user
    showToast("Could not analyse image: " + error.message);
    console.error("Analyse error:", error);

  } finally {
    // Always hide the loading message when done (success OR error)
    loadingMsg.style.display = "none";
  }

});


// ------------------------------------------------------------
// STEP 6 — Display the AI results on the page
// ------------------------------------------------------------

function displayResults(data) {

  // Clear out anything that was there before
  explanationBox.innerHTML = "";
  lastExplanation = "";

  // ---- App name banner ----
  // Always shown — gives the user instant recognition of what they're looking at.
  const appName = data.app || data.websiteName || "Unknown App";
  const appType = data.appType || data.websiteType || "";

  const banner = document.createElement("div");
  banner.className = "site-banner";
  banner.innerHTML = `
    <span class="site-banner-emoji">${getSiteEmoji(appName, appType)}</span>
    <div>
      <div class="site-banner-label">App detected</div>
      <div class="site-banner-name">${appName}</div>
      ${appType ? `<div class="site-banner-type">${appType}</div>` : ""}
    </div>
  `;
  explanationBox.appendChild(banner);

  // Also read the app name as the opening line of the Read Aloud script
  lastExplanation = `This is ${appName}${appType ? ", a " + appType : ""}. `;

  // ---- Build cards from bullet points in explanation ----
  // The AI returns explanation as "• First thing\n• Second thing\n..."
  const rawExplanation = data.explanation || data.summary || "";

  // Split on newlines, strip leading bullet symbols, remove empty lines
  const bullets = rawExplanation
    .split("\n")
    .map(function (line) { return line.replace(/^[\u2022\-\*]\s*/, "").trim(); })
    .filter(function (line) { return line.length > 0; });

  if (bullets.length > 0) {

    bullets.forEach(function (text, index) {

      const card = document.createElement("div");
      card.className = "elem-card";

      card.innerHTML = `
        <div class="elem-num">${index + 1}</div>
        <div class="elem-body">
          <div class="elem-desc">${text}</div>
        </div>
        <button class="elem-read-btn" title="Read this aloud">🔊</button>
      `;

      // Small 🔊 button reads just this one bullet point aloud
      const readBtn = card.querySelector(".elem-read-btn");
      readBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        speak(text);
      });

      explanationBox.appendChild(card);

      // Build up the full script for the big "Read Aloud" button
      lastExplanation += text + ". ";
    });

  } else if (data.elements && data.elements.length > 0) {

    // Fallback: handle old-style elements array format
    data.elements.forEach(function (element, index) {
      const card = document.createElement("div");
      card.className = "elem-card";
      card.innerHTML = `
        <div class="elem-num">${index + 1}</div>
        <div class="elem-body">
          <div class="elem-name">${element.name}</div>
          <div class="elem-desc">${element.description}</div>
          ${element.action ? `<div class="elem-action">👆 ${element.action}</div>` : ""}
        </div>
        <button class="elem-read-btn" title="Read this aloud">🔊</button>
      `;
      const readBtn = card.querySelector(".elem-read-btn");
      readBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        speak(element.name + ". " + element.description);
      });
      explanationBox.appendChild(card);
      lastExplanation += `${element.name}. ${element.description}. `;
    });

  } else {

    // Last resort: just show the raw text
    const p = document.createElement("p");
    p.className = "result-text";
    p.textContent = rawExplanation;
    explanationBox.appendChild(p);
    lastExplanation = rawExplanation;
  }

  // ---- Canvas highlight overlay ----
  // Draw coloured boxes over the image for each UI element found.
  // The image may still be loading its layout, so wait one frame first.
  if (data.elements && data.elements.length > 0) {
    requestAnimationFrame(function () {
      drawOverlay(data.elements);
    });
  }

  // ---- Inline scam status badge ----
  // Show a green / yellow / red badge right away so the user
  // gets instant safety feedback without pressing "Check for Scam".
  if (data.scam) {
    explanationBox.appendChild(buildScamBadge(data.scam, data.scamReason));
  }

  // Show feature buttons (Read Aloud / Explain Simpler / Check for Scam)
  revealSection(document.getElementById("featureButtons"), "grid");

  // Show the results section
  revealSection(resultsSection);

  // Scroll down to the results
  resultsSection.scrollIntoView({ behavior: "smooth" });
}


// ------------------------------------------------------------
// STEP 7 — Read Aloud button
//
//  First click: reads the full explanation aloud.
//  Second click: stops reading immediately.
//  When speech finishes naturally: button resets by itself.
// ------------------------------------------------------------

readAloudBtn.addEventListener("click", function () {

  // Nothing to read yet
  if (!lastExplanation) {
    showToast("Please analyse an image first.");
    return;
  }

  // If already reading, stop it
  if (isSpeaking) {
    stopSpeaking();
    return;
  }

  // Check the browser supports speech
  if (!window.speechSynthesis) {
    showToast("Sorry, your browser does not support Read Aloud.");
    return;
  }

  // Switch button to "stop" mode
  isSpeaking = true;
  readAloudBtn.textContent = "⏹  Stop Reading";
  readAloudBtn.classList.add("reading");

  // Read the explanation — reset button when it finishes on its own
  speak(lastExplanation, function () {
    stopSpeaking();
  });

});


// ------------------------------------------------------------
// STEP 8 — Explain Simpler button
//
//  Sends the current explanation to /api/simplify.
//  The server rewrites it in shorter, plainer words.
//  The result replaces whatever is shown in the results box.
// ------------------------------------------------------------

simplerBtn.addEventListener("click", async function () {

  // Make sure there is something to simplify
  if (!lastExplanation) {
    showToast("Please analyse an image first.");
    return;
  }

  // Show a "working" state on the button
  simplerBtn.textContent = "⏳  Simplifying…";
  simplerBtn.disabled    = true;
  stopSpeaking();
  clearOverlay();   // bug fix: remove old highlight boxes when explanation changes

  try {

    // ----- Send text to backend to simplify -----
    const response = await fetch(BACKEND + "/api/simplify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text: lastExplanation })
    });

    if (!response.ok) throw new Error("Server error — please try again.");

    const data = await response.json();
    const simplified = data.simplified;

    // ----- Replace the explanation box with the simpler text -----
    explanationBox.innerHTML = "";

    const p = document.createElement("p");
    p.className   = "result-text";
    p.textContent = simplified;
    explanationBox.appendChild(p);

    // Update lastExplanation so Read Aloud reads the new version
    lastExplanation = simplified;

    // Make sure the results section is visible and scroll to it
    revealSection(resultsSection);
    resultsSection.scrollIntoView({ behavior: "smooth" });

    // Read the simplified version aloud automatically
    speak(simplified);

  } catch (error) {
    showToast("Could not simplify — please try again.");
    console.error("Simplify error:", error);

  } finally {
    // Always restore the button, whether it worked or not
    simplerBtn.textContent = "✨  Explain Simpler";
    simplerBtn.disabled    = false;
  }

});


// ------------------------------------------------------------
// STEP 9 — Check for Scam button
// ------------------------------------------------------------

scamBtn.addEventListener("click", async function () {

  if (!currentImage) {
    showToast("Please upload an image first.");
    return;
  }

  // Show the scam section with a loading state
  revealSection(scamSection);
  scamResult.innerHTML      = `
    <div class="loading show">
      <div class="spinner"></div>
      <p>Checking for scams… hang on!</p>
    </div>
  `;
  scamSection.scrollIntoView({ behavior: "smooth" });
  stopSpeaking();

  try {
    // ----- Send image to backend for scam analysis -----
    const response = await fetch(BACKEND + "/api/scam-check", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ image: currentImage })
    });

    if (!response.ok) throw new Error("Server error — please try again.");

    const data = await response.json();
    displayScamResult(data);

  } catch (error) {
    scamResult.innerHTML = `<p style="color:#ff6b6b; font-size:1.1rem;">
      Scam check failed — please try again.
    </p>`;
    console.error("Scam error:", error);
  }

});


// ------------------------------------------------------------
// STEP 10 — Display scam check results
//
//  Three possible statuses returned by the server:
//    "safe"       → green  ✅
//    "suspicious" → yellow ⚠️
//    "scam"       → red    🚨
// ------------------------------------------------------------

function displayScamResult(data) {

  const status = (data.status || "safe").toLowerCase();

  // Pick icon, heading, CSS class, and speech opener based on status
  const config = {
    safe: {
      cssClass : "scam-safe",
      icon     : "✅",
      heading  : "This Looks Safe!",
      speechStart: "Good news! "
    },
    suspicious: {
      cssClass : "scam-suspicious",
      icon     : "⚠️",
      heading  : "Be Careful — Something Looks Odd",
      speechStart: "Please be careful. "
    },
    scam: {
      cssClass : "scam-danger",
      icon     : "🚨",
      heading  : "WARNING — This May Be a Scam!",
      speechStart: "Warning! This may be a scam! "
    }
  }[status] || {
    cssClass : "scam-safe",
    icon     : "✅",
    heading  : "This Looks Safe!",
    speechStart: ""
  };

  // Build alert cards (only shown for suspicious / scam)
  const alertsHtml = (data.alerts || []).map(function (alert) {
    return `
      <div class="scam-alert-item">
        <h3>${alert.title || "Warning"}</h3>
        <p>${alert.description}</p>
      </div>
    `;
  }).join("");

  // Reason text — use the new "reason" field, fall back to old fields
  const reason = data.reason || data.recommendation || "";

  // What to do box
  const whatToDo = data.whatToDo || (
    status === "safe"       ? "You can continue using this page normally." :
    status === "suspicious" ? "Do not share any personal information until you are sure this is safe." :
                              "Close this page immediately. Do not click anything or call any number shown."
  );

  scamResult.innerHTML = `
    <div class="scam-block ${config.cssClass}">

      <div class="scam-header">
        <span class="big-icon">${config.icon}</span>
        <h2>${config.heading}</h2>
        <p>${reason}</p>
      </div>

      ${alertsHtml}

      <div class="what-to-do">
        <h3>What should you do right now?</h3>
        <p>${whatToDo}</p>
      </div>

    </div>
  `;

  // Read the result aloud
  const alertText = (data.alerts || []).map(function (a) { return a.description; }).join(". ");
  speak(config.speechStart + reason + (alertText ? ". " + alertText : "") + ". " + whatToDo);
}


// ------------------------------------------------------------
// HELPER — buildScamBadge(scam, scamReason)
//
//  Creates a small inline status badge shown inside the results
//  section immediately after analysis — before the user even
//  clicks "Check for Scam".
// ------------------------------------------------------------

function buildScamBadge(scam, scamReason) {

  const status = (scam || "safe").toLowerCase();

  const cfg = {
    safe:       { css: "badge-safe",       icon: "✅", label: "Safe"       },
    suspicious: { css: "badge-suspicious", icon: "⚠️", label: "Suspicious" },
    scam:       { css: "badge-scam",       icon: "🚨", label: "Possible Scam" }
  }[status] || { css: "badge-safe", icon: "✅", label: "Safe" };

  const badge = document.createElement("div");
  badge.className = "scam-badge " + cfg.css;
  badge.innerHTML = `
    <span class="scam-badge-icon">${cfg.icon}</span>
    <div class="scam-badge-text">
      <div class="scam-badge-label">${cfg.label}</div>
      ${scamReason || ""}
    </div>
  `;
  return badge;
}


// ------------------------------------------------------------
// HELPER — pickBestVoice
//
//  Looks through all voices the browser has installed and
//  returns the clearest, most natural-sounding English one.
//
//  Priority order (best to acceptable):
//    1. Known high-quality named voices (Google, Microsoft)
//    2. Any en-GB voice  (British English — very clear)
//    3. Any en-US voice
//    4. Any English voice at all
//    5. Whatever the browser defaults to (null)
// ------------------------------------------------------------

function pickBestVoice() {
  const voices = window.speechSynthesis.getVoices();

  // These named voices are well-known for being clear and natural
  const preferredNames = [
    "Google UK English Female",   // Chrome on Windows / Mac
    "Google UK English Male",
    "Google US English",
    "Microsoft Hazel",            // Windows — very clear British female
    "Microsoft Zira",             // Windows — US female
    "Microsoft David",            // Windows — US male
    "Samantha",                   // macOS / iOS — clear US female
    "Daniel",                     // macOS — clear British male
    "Karen",                      // macOS — Australian female (very clear)
  ];

  // 1. Try preferred named voices first
  for (const name of preferredNames) {
    const found = voices.find(function (v) { return v.name === name; });
    if (found) return found;
  }

  // 2. Any en-GB voice
  const enGB = voices.find(function (v) { return v.lang === "en-GB"; });
  if (enGB) return enGB;

  // 3. Any en-US voice
  const enUS = voices.find(function (v) { return v.lang === "en-US"; });
  if (enUS) return enUS;

  // 4. Any English voice
  const anyEn = voices.find(function (v) { return v.lang.startsWith("en"); });
  if (anyEn) return anyEn;

  // 5. Nothing found — browser will use its default
  return null;
}


// ------------------------------------------------------------
// HELPER — speak(text, onFinish)
//
//  Reads text out loud using the browser's built-in speech engine.
//
//  Settings tuned for elderly users:
//    rate  0.75 — noticeably slow, easy to follow
//    pitch 1.05 — very slightly brighter, easier to hear
//    volume 1.0 — full volume
// ------------------------------------------------------------

function speak(text, onFinish) {
  if (!window.speechSynthesis) return;  // browser does not support TTS

  // Stop anything currently playing before starting new speech
  window.speechSynthesis.cancel();

  const utterance    = new SpeechSynthesisUtterance(text);
  utterance.rate     = 0.75;   // slow — easy for seniors to follow
  utterance.pitch    = 1.05;   // very slightly brighter tone — easier to hear
  utterance.volume   = 1.0;    // full volume
  utterance.lang     = "en-US";

  // Use the clearest available voice
  const bestVoice = pickBestVoice();
  if (bestVoice) utterance.voice = bestVoice;

  // Run the callback when the speech ends naturally (if one was given)
  if (onFinish) utterance.onend = onFinish;

  window.speechSynthesis.speak(utterance);
}


// ------------------------------------------------------------
// HELPER — stopSpeaking
//
//  Cancels any ongoing speech and resets the Read Aloud button
//  back to its normal state.
// ------------------------------------------------------------

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  isSpeaking = false;
  if (readAloudBtn) {
    readAloudBtn.textContent = "🔊  Read Aloud";
    readAloudBtn.classList.remove("reading");
  }
}


// ------------------------------------------------------------
// HELPER — drawOverlay(elements)
//
//  Draws coloured highlight boxes on the canvas that sits over
//  the uploaded image, one box per UI element returned by the AI.
//
//  Coordinates from the AI are percentages (0–100) of the image
//  dimensions. We convert them to pixels based on the size the
//  image is actually displayed at on screen.
//
//  Colour palette cycles through 6 distinct colours so boxes are
//  easy to tell apart. Each box also gets a number badge in its
//  top-left corner that matches the numbered result cards.
// ------------------------------------------------------------

// Colours used for the highlight boxes (one per element, cycling)
const OVERLAY_COLOURS = [
  "#00ffff",   // cyan
  "#ff6b6b",   // coral red
  "#ffd600",   // yellow
  "#00e676",   // green
  "#ff9800",   // orange
  "#e040fb",   // purple
];

function drawOverlay(elements) {

  const canvas = document.getElementById("overlayCanvas");
  const img    = previewImg;
  const legend = document.getElementById("overlayLegend");

  if (!canvas || !img || !elements || elements.length === 0) return;

  // The image must be fully laid out before we can read its pixel size
  const imgW = img.offsetWidth;
  const imgH = img.offsetHeight;

  if (imgW === 0 || imgH === 0) return;   // image not rendered yet — skip

  // Size the canvas to match the displayed image exactly
  canvas.width  = imgW;
  canvas.height = imgH;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, imgW, imgH);

  // Clear and rebuild the legend strip below the image
  legend.innerHTML = "";
  legend.style.display = "flex";

  elements.forEach(function (el, i) {

    const colour = OVERLAY_COLOURS[i % OVERLAY_COLOURS.length];
    const num    = i + 1;

    // Convert AI percentages → actual screen pixels
    const x  = (el.x      / 100) * imgW;
    const y  = (el.y      / 100) * imgH;
    const bw = (el.width  / 100) * imgW;
    const bh = (el.height / 100) * imgH;

    // ── Filled rectangle (semi-transparent) ──────────────────
    ctx.fillStyle = colour + "28";          // ~16% opacity fill
    ctx.fillRect(x, y, bw, bh);

    // ── Border ───────────────────────────────────────────────
    ctx.strokeStyle = colour;
    ctx.lineWidth   = 2.5;
    ctx.strokeRect(x, y, bw, bh);

    // ── Number badge (circle in top-left corner of box) ──────
    const badgeR = 13;                      // badge circle radius
    const bx     = x + badgeR + 2;         // badge centre x
    const by     = y + badgeR + 2;         // badge centre y

    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();

    ctx.fillStyle  = "#000";
    ctx.font       = "bold 13px sans-serif";
    ctx.textAlign  = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(num), bx, by);

    // Reset alignment for next iteration
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";

    // ── Legend item below the image ───────────────────────────
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-dot" style="background:${colour}"></span>
      <span><strong>${num}.</strong> ${el.label}</span>
    `;
    legend.appendChild(item);
  });
}


// ------------------------------------------------------------
// HELPER — clearOverlay
//
//  Wipes the canvas and hides the legend.
//  Called when the user uploads a new image.
// ------------------------------------------------------------

function clearOverlay() {
  const canvas = document.getElementById("overlayCanvas");
  const legend = document.getElementById("overlayLegend");

  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  if (legend) {
    legend.innerHTML      = "";
    legend.style.display  = "none";
  }
}


// ------------------------------------------------------------
// HELPER — Show a small popup message at the bottom of the screen
// ------------------------------------------------------------

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent    = message;
  toast.style.display  = "block";
  setTimeout(function () {
    toast.style.display = "none";
  }, 3500);
}


// ------------------------------------------------------------
// HELPER — getSiteEmoji(appName, appType)
//
//  Returns an emoji that matches the specific app or, if the
//  app isn't recognised, falls back to the type category.
// ------------------------------------------------------------

function getSiteEmoji(appName, appType) {

  const name = (appName || "").toLowerCase();
  const type = (appType  || "").toLowerCase();

  // ── Specific well-known apps ──────────────────────────────
  if (name.includes("whatsapp"))              return "💬";
  if (name.includes("messenger"))            return "💬";
  if (name.includes("telegram"))             return "✈️";
  if (name.includes("signal"))               return "🔒";
  if (name.includes("imessage") ||
      name.includes("messages"))             return "💬";
  if (name.includes("gmail"))                return "📧";
  if (name.includes("outlook"))              return "📧";
  if (name.includes("yahoo mail"))           return "📧";
  if (name.includes("facebook"))             return "👥";
  if (name.includes("instagram"))            return "📸";
  if (name.includes("twitter") ||
      name.includes("x.com"))               return "🐦";
  if (name.includes("tiktok"))               return "🎵";
  if (name.includes("snapchat"))             return "👻";
  if (name.includes("linkedin"))             return "💼";
  if (name.includes("youtube"))              return "🎬";
  if (name.includes("netflix"))              return "🎬";
  if (name.includes("disney"))               return "🏰";
  if (name.includes("spotify"))              return "🎵";
  if (name.includes("apple music"))          return "🎵";
  if (name.includes("amazon"))               return "🛒";
  if (name.includes("ebay"))                 return "🛒";
  if (name.includes("google maps") ||
      name.includes("apple maps"))           return "🗺️";
  if (name.includes("google"))               return "🔎";
  if (name.includes("chrome"))               return "🌐";
  if (name.includes("safari"))               return "🌐";
  if (name.includes("firefox"))              return "🌐";
  if (name.includes("edge"))                 return "🌐";
  if (name.includes("word"))                 return "📝";
  if (name.includes("excel"))                return "📊";
  if (name.includes("powerpoint"))           return "📽️";
  if (name.includes("zoom"))                 return "📹";
  if (name.includes("teams"))                return "📹";
  if (name.includes("skype"))                return "📹";
  if (name.includes("facetime"))             return "📹";
  if (name.includes("paypal"))               return "💳";
  if (name.includes("bank") ||
      name.includes("barclays") ||
      name.includes("lloyds")  ||
      name.includes("natwest")  ||
      name.includes("halifax"))              return "🏦";
  if (name.includes("nhs"))                  return "🏥";
  if (name.includes("settings"))             return "⚙️";
  if (name.includes("file explorer") ||
      name.includes("finder"))               return "📁";
  if (name.includes("photos") ||
      name.includes("gallery"))              return "🖼️";
  if (name.includes("news"))                 return "📰";
  if (name.includes("bbc"))                  return "📰";

  // ── Fall back to app type category ───────────────────────
  if (type.includes("message") ||
      type.includes("chat"))                 return "💬";
  if (type.includes("email") ||
      type.includes("mail"))                 return "📧";
  if (type.includes("social"))               return "👥";
  if (type.includes("video") ||
      type.includes("streaming"))            return "🎬";
  if (type.includes("music"))                return "🎵";
  if (type.includes("shop") ||
      type.includes("store"))                return "🛒";
  if (type.includes("bank") ||
      type.includes("finance"))              return "🏦";
  if (type.includes("map") ||
      type.includes("travel"))               return "🗺️";
  if (type.includes("search") ||
      type.includes("browser"))              return "🔎";
  if (type.includes("setting"))              return "⚙️";
  if (type.includes("health") ||
      type.includes("medical"))              return "🏥";
  if (type.includes("news"))                 return "📰";
  if (type.includes("photo"))                return "📸";
  if (type.includes("document") ||
      type.includes("word processor"))       return "📝";
  if (type.includes("spreadsheet"))          return "📊";
  if (type.includes("video call"))           return "📹";

  // ── Default ───────────────────────────────────────────────
  return "🌐";
}


// ============================================================
//  SCREEN CAPTURE & SNIPPING TOOL
//
//  How it works:
//   1. User clicks "Capture My Screen Now"
//   2. Browser shows a native screen-picker dialog
//   3. We grab one video frame and store it as a PNG
//   4. The image is shown on a <canvas> where user can drag
//      a selection rectangle over any area
//   5. Clicking "Crop & Analyse" extracts just the selected
//      region and sends it to /api/analyze
// ============================================================


// ------------------------------------------------------------
// CAPTURE — click handler
// ------------------------------------------------------------

captureBtn.addEventListener("click", async function () {

  // Check the browser supports screen capture
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    showToast("Your browser does not support screen capture. Please upload a screenshot instead.");
    return;
  }

  captureBtn.textContent = "⏳  Starting…";
  captureBtn.disabled    = true;

  try {

    // ── Ask the browser to share a screen / window ────────────
    // This shows the browser's native screen-picker dialog.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    // ── Feed stream into a hidden <video> element ─────────────
    const video      = document.createElement("video");
    video.muted      = true;
    video.playsInline = true;
    video.srcObject  = stream;

    // Wait until video metadata is ready
    await new Promise(function (resolve, reject) {
      video.onloadedmetadata = resolve;
      video.onerror          = reject;
      setTimeout(function () { reject(new Error("Timeout")); }, 10000);
    });

    await video.play();

    // Wait two animation frames so the first real frame is painted
    await new Promise(function (r) { requestAnimationFrame(r); });
    await new Promise(function (r) { requestAnimationFrame(r); });

    // ── Draw the frame onto an offscreen canvas ────────────────
    const w = video.videoWidth  || 1280;
    const h = video.videoHeight || 720;

    const offscreen     = document.createElement("canvas");
    offscreen.width     = w;
    offscreen.height    = h;
    offscreen.getContext("2d").drawImage(video, 0, 0, w, h);

    // ── Stop screen sharing immediately ───────────────────────
    stream.getTracks().forEach(function (t) { t.stop(); });

    // ── Store and display the screenshot ──────────────────────
    screenshotDataURL = offscreen.toDataURL("image/png");
    loadScreenshotIntoCropCanvas(screenshotDataURL);

  } catch (err) {
    // NotAllowedError = user cancelled the dialog — not a real error
    if (err.name !== "NotAllowedError") {
      showToast("Could not capture screen — please upload a screenshot instead.");
      console.error("Capture error:", err);
    }
  } finally {
    captureBtn.textContent = "📷  Capture My Screen Now";
    captureBtn.disabled    = false;
  }

});


// ------------------------------------------------------------
// LOAD — show screenshot in the crop canvas
// ------------------------------------------------------------

function loadScreenshotIntoCropCanvas(dataURL) {

  const img = new Image();

  img.onload = function () {
    screenshotImg = img;

    // ── Scale canvas resolution down if image is very large ───
    // This keeps memory usage reasonable and drawing fast.
    const MAX_W = 1400;
    let   cw    = img.width;
    let   ch    = img.height;

    if (cw > MAX_W) {
      ch = Math.round(ch * MAX_W / cw);
      cw = MAX_W;
    }

    cropCanvas.width  = cw;
    cropCanvas.height = ch;

    // Set displayed height proportionally (CSS width is 100%)
    const displayW = cropCanvas.parentElement.clientWidth || 800;
    const displayH = Math.min(displayW * (ch / cw), 520);
    cropCanvas.style.height = Math.round(displayH) + "px";

    // Reset any previous selection
    cropSelecting    = false;
    cropHasSelection = false;
    cropSX = cropSY = cropEX = cropEY = 0;
    cropConfirmBtn.disabled = true;
    setCropStatus("👆 Click and drag on the image to select an area", false);

    // Draw the screenshot
    cropCanvas.getContext("2d").drawImage(img, 0, 0, cw, ch);

    // Hide upload preview & results; show crop section
    previewSection.style.display  = "none";
    resultsSection.style.display  = "none";
    scamSection.style.display     = "none";
    document.getElementById("featureButtons").style.display = "none";

    revealSection(captureSection);
    captureSection.scrollIntoView({ behavior: "smooth" });
  };

  img.onerror = function () {
    showToast("Could not load the screenshot. Please try again.");
  };

  img.src = dataURL;
}


// ------------------------------------------------------------
// CROP CANVAS — mouse / touch interaction
// ------------------------------------------------------------

// Convert a mouse/touch event to canvas pixel coordinates
function getCanvasPos(e) {
  const rect   = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width  / rect.width;
  const scaleY = cropCanvas.height / rect.height;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  return {
    x: Math.max(0, Math.min(cropCanvas.width,  Math.round((clientX - rect.left) * scaleX))),
    y: Math.max(0, Math.min(cropCanvas.height, Math.round((clientY - rect.top)  * scaleY)))
  };
}

// Redraw screenshot + selection overlay on the canvas
function redrawCropCanvas() {
  if (!screenshotImg) return;

  const ctx = cropCanvas.getContext("2d");
  const cw  = cropCanvas.width;
  const ch  = cropCanvas.height;

  // 1. Full screenshot
  ctx.drawImage(screenshotImg, 0, 0, cw, ch);

  if (!cropSelecting && !cropHasSelection) return;

  const x = Math.min(cropSX, cropEX);
  const y = Math.min(cropSY, cropEY);
  const w = Math.abs(cropEX - cropSX);
  const h = Math.abs(cropEY - cropSY);

  if (w < 4 || h < 4) return;

  // 2. Dark semi-transparent overlay over the whole canvas
  ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
  ctx.fillRect(0, 0, cw, ch);

  // 3. Cut a transparent hole so the screenshot shows through
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // 4. Redraw the selected region from the original image (restores pixels)
  ctx.drawImage(screenshotImg, x, y, w, h, x, y, w, h);

  // 5. Dashed selection border
  ctx.save();
  ctx.strokeStyle = "#facc15";   // bright yellow — very visible
  ctx.lineWidth   = 3;
  ctx.setLineDash([12, 6]);
  ctx.lineDashOffset = 0;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.setLineDash([]);
  ctx.restore();

  // 6. Four solid corner squares for drag-handle feel
  const hs = 10;   // handle half-size
  ctx.fillStyle = "#facc15";
  [
    [x,     y    ],   // top-left
    [x + w, y    ],   // top-right
    [x,     y + h],   // bottom-left
    [x + w, y + h]    // bottom-right
  ].forEach(function (pt) {
    ctx.fillRect(pt[0] - hs / 2, pt[1] - hs / 2, hs, hs);
  });

  // 7. Dimension pill above the selection
  const label    = w + " × " + h + " px";
  const pillW    = label.length * 8 + 16;
  const pillX    = Math.max(0, Math.min(x, cw - pillW));
  const pillY    = Math.max(0, y - 30);

  ctx.fillStyle   = "#facc15";
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(pillX, pillY, pillW, 24, 5)
    : ctx.rect(pillX, pillY, pillW, 24);
  ctx.fill();

  ctx.fillStyle   = "#000";
  ctx.font        = "bold 12px Inter, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(label, pillX + 8, pillY + 12);
  ctx.textBaseline = "alphabetic";
}

// Update the status text below the canvas
function setCropStatus(msg, isGood) {
  cropStatus.textContent = msg;
  cropStatus.className   = "crop-status" + (isGood ? " has-selection" : "");
}

// ── Mouse events ─────────────────────────────────────────────

cropCanvas.addEventListener("mousedown", function (e) {
  e.preventDefault();
  const pos  = getCanvasPos(e);
  cropSX     = pos.x;
  cropSY     = pos.y;
  cropEX     = pos.x;
  cropEY     = pos.y;
  cropSelecting    = true;
  cropHasSelection = false;
  cropConfirmBtn.disabled = true;
  setCropStatus("🖱️ Drag to draw your selection…", false);
});

cropCanvas.addEventListener("mousemove", function (e) {
  if (!cropSelecting) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  cropEX = pos.x;
  cropEY = pos.y;
  redrawCropCanvas();
});

cropCanvas.addEventListener("mouseup", function (e) {
  if (!cropSelecting) return;
  e.preventDefault();
  cropSelecting = false;

  const w = Math.abs(cropEX - cropSX);
  const h = Math.abs(cropEY - cropSY);

  if (w < 10 || h < 10) {
    // Selection too small — reset
    cropHasSelection = false;
    cropConfirmBtn.disabled = true;
    setCropStatus("⚠️ Selection too small — try dragging a bigger area", false);
    cropCanvas.getContext("2d").drawImage(screenshotImg, 0, 0, cropCanvas.width, cropCanvas.height);
    return;
  }

  cropHasSelection = true;
  cropConfirmBtn.disabled = false;
  setCropStatus("✅ Good selection! Click \"Crop & Analyse\" below", true);
  redrawCropCanvas();
});

cropCanvas.addEventListener("mouseleave", function (e) {
  if (cropSelecting) {
    cropSelecting = false;
    if (Math.abs(cropEX - cropSX) > 10 && Math.abs(cropEY - cropSY) > 10) {
      cropHasSelection = true;
      cropConfirmBtn.disabled = false;
      setCropStatus("✅ Good selection! Click \"Crop & Analyse\" below", true);
    }
    redrawCropCanvas();
  }
});

// ── Touch events (tablets) ───────────────────────────────────

cropCanvas.addEventListener("touchstart", function (e) {
  e.preventDefault();
  const pos = getCanvasPos(e);
  cropSX = pos.x; cropSY = pos.y;
  cropEX = pos.x; cropEY = pos.y;
  cropSelecting    = true;
  cropHasSelection = false;
  cropConfirmBtn.disabled = true;
}, { passive: false });

cropCanvas.addEventListener("touchmove", function (e) {
  if (!cropSelecting) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  cropEX = pos.x; cropEY = pos.y;
  redrawCropCanvas();
}, { passive: false });

cropCanvas.addEventListener("touchend", function (e) {
  if (!cropSelecting) return;
  e.preventDefault();
  cropSelecting = false;
  const w = Math.abs(cropEX - cropSX);
  const h = Math.abs(cropEY - cropSY);
  if (w > 10 && h > 10) {
    cropHasSelection = true;
    cropConfirmBtn.disabled = false;
    setCropStatus("✅ Good selection! Tap \"Crop & Analyse\" below", true);
    redrawCropCanvas();
  }
}, { passive: false });


// ------------------------------------------------------------
// CROP & ANALYSE — extract selected region → send to AI
// ------------------------------------------------------------

cropConfirmBtn.addEventListener("click", function () {
  if (!cropHasSelection || !screenshotImg) return;

  // Get selection coords (top-left, width, height) in canvas pixels
  const x = Math.min(cropSX, cropEX);
  const y = Math.min(cropSY, cropEY);
  const w = Math.abs(cropEX - cropSX);
  const h = Math.abs(cropEY - cropSY);

  // Draw the cropped region onto a new clean canvas
  const cropOut    = document.createElement("canvas");
  cropOut.width    = w;
  cropOut.height   = h;
  cropOut.getContext("2d").drawImage(
    screenshotImg,
    // Source: map canvas pixels back to original image pixels
    Math.round(x * screenshotImg.naturalWidth  / cropCanvas.width),
    Math.round(y * screenshotImg.naturalHeight / cropCanvas.height),
    Math.round(w * screenshotImg.naturalWidth  / cropCanvas.width),
    Math.round(h * screenshotImg.naturalHeight / cropCanvas.height),
    // Destination: full output canvas
    0, 0, w, h
  );

  const croppedDataURL = cropOut.toDataURL("image/png");
  handOffToAnalysis(croppedDataURL);
});


// ------------------------------------------------------------
// USE FULL SCREENSHOT — skip cropping
// ------------------------------------------------------------

useFullBtn.addEventListener("click", function () {
  if (!screenshotDataURL) return;
  handOffToAnalysis(screenshotDataURL);
});


// ------------------------------------------------------------
// CAPTURE AGAIN — go back to screen picker
// ------------------------------------------------------------

recaptureBtn.addEventListener("click", function () {
  captureSection.style.display = "none";
  captureBtn.click();   // re-trigger the capture flow
});


// ------------------------------------------------------------
// HAND OFF — set image, show preview, scroll to Analyse button
// ------------------------------------------------------------

function handOffToAnalysis(dataURL) {
  currentImage  = dataURL;
  lastExplanation = "";
  stopSpeaking();
  clearOverlay();

  // Update the preview image
  previewImg.src = dataURL;

  // Hide capture section, show preview
  captureSection.style.display = "none";
  revealSection(previewSection);
  previewSection.scrollIntoView({ behavior: "smooth" });
}


// ------------------------------------------------------------
// HELPER — revealSection(el, displayValue)
//
//  Shows a hidden section with a smooth fade-up animation.
//  displayValue defaults to "block" — pass "grid" for the
//  feature buttons row.
// ------------------------------------------------------------

function revealSection(el, displayValue) {
  if (!el) return;
  const d = displayValue || "block";
  el.style.display = d;

  // Remove then re-add the class to restart the animation
  // even if the element was already visible.
  el.classList.remove("reveal");
  void el.offsetWidth;           // force reflow — browser must see the remove
  el.classList.add("reveal");
}


// ------------------------------------------------------------
// HELPER — lerp(a, b, t)
//
//  Linear interpolation between two numbers.
//  t = 0 → returns a   |   t = 1 → returns b
// ------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}


// ------------------------------------------------------------
// ACCESSIBILITY — Font-size slider
//
//  Changes the root font size so every element that uses
//  rem / em units scales proportionally.
// ------------------------------------------------------------

(function () {
  const slider = document.getElementById("fontSlider");
  const label  = document.getElementById("fontSizeLabel");
  if (!slider || !label) return;

  slider.addEventListener("input", function () {
    const size = Number(this.value);
    // Apply to both body and :root so rem units scale too
    document.body.style.fontSize = size + "px";
    document.documentElement.style.fontSize = size + "px";
    label.textContent = size + "px";
  });
})();


// ------------------------------------------------------------
// ACCESSIBILITY — Contrast slider
//
//  Interpolates CSS custom properties between:
//    0   = default colours (comfortable dark theme)
//    100 = high-contrast (brighter text, stronger borders)
//
//  Adjusted properties:
//   --text-muted   #94a3b8 → #e2e8f0
//   --text-dim     #64748b → #cbd5e1
//   --border       0.09 opacity → 0.38
//   --surface      0.045 opacity → 0.13
//   --surface-h    0.075 opacity → 0.2
// ------------------------------------------------------------

(function () {
  const slider = document.getElementById("contrastSlider");
  const label  = document.getElementById("contrastLabel");
  if (!slider || !label) return;

  slider.addEventListener("input", function () {
    const t = Number(this.value) / 100;   // 0..1

    const root = document.documentElement;

    // ── Text colours ──────────────────────────────────────────
    // --text-muted: #94a3b8 (148,163,184) → #e2e8f0 (226,232,240)
    const mr = Math.round(lerp(148, 226, t));
    const mg = Math.round(lerp(163, 232, t));
    const mb = Math.round(lerp(184, 240, t));
    root.style.setProperty("--text-muted", `rgb(${mr},${mg},${mb})`);

    // --text-dim: #64748b (100,116,139) → #cbd5e1 (203,213,225)
    const dr = Math.round(lerp(100, 203, t));
    const dg = Math.round(lerp(116, 213, t));
    const db = Math.round(lerp(139, 225, t));
    root.style.setProperty("--text-dim", `rgb(${dr},${dg},${db})`);

    // ── Border & surface opacity ──────────────────────────────
    const bo = (lerp(0.09,  0.38, t)).toFixed(3);
    const so = (lerp(0.045, 0.13, t)).toFixed(3);
    const sh = (lerp(0.075, 0.20, t)).toFixed(3);
    root.style.setProperty("--border",   `rgba(255,255,255,${bo})`);
    root.style.setProperty("--surface",  `rgba(255,255,255,${so})`);
    root.style.setProperty("--surface-h",`rgba(255,255,255,${sh})`);

    // ── Label ─────────────────────────────────────────────────
    label.textContent =
      t === 0   ? "Normal" :
      t <= 0.35 ? "Medium" :
      t <= 0.7  ? "High"   : "Max";
  });
})();


// ------------------------------------------------------------
// HELPER — Preload voices so Read Aloud works immediately
//
//  Chrome loads its voice list asynchronously — if we call
//  getVoices() before the list is ready we get an empty array.
//  Listening to onvoiceschanged ensures pickBestVoice() always
//  has the full list available when the button is clicked.
// ------------------------------------------------------------

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();

  window.speechSynthesis.onvoiceschanged = function () {
    window.speechSynthesis.getVoices();
    const best = pickBestVoice();
    if (best) {
      console.log("🔊  Voice selected:", best.name, "(", best.lang, ")");
    }
  };
}



