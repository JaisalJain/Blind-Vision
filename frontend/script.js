// =====================================================================
// CONFIGURATION: prompts and backend settings (edit these)
// =====================================================================

// The backend URL is set on the site (start screen field) or with ?api=<url>.
// These paths are appended to it automatically.
const IMAGE_ENDPOINT = "/describe-image/";
const VIDEO_ENDPOINT = "/describe-video/";
const BACKEND_URL_STORAGE_KEY = "blindvision-backend-url";

// Frames are scaled down so the longest side is at most this many pixels.
const MAX_FRAME_SIDE = 768;

// How many earlier follow-up questions and answers to include as context.
const MAX_FOLLOW_UP_HISTORY = 3;

const BASE_PROMPT = `You are the eyes of a blind person pointing their phone camera at what is in front of them. Your answer will be read aloud.
- First mention anything that matters for safety: steps, obstacles, vehicles, doors, people close by. Skip this if there is nothing.
- Then describe the scene in 2-3 short, plain sentences.
- Say where things are relative to the user: ahead, left, right, near, far.
- If there is readable text (signs, labels, screens), read it exactly.
- If the image is blurry, dark, or the subject is cut off, say so and tell them how to move the camera.
- Only describe what you can actually see. If unsure, say so.
- Do not say "the image shows". No lists or markdown.`;

const PHOTO_PROMPT = BASE_PROMPT;

const VIDEO_PROMPT =
  BASE_PROMPT +
  "\nThese are frames from a few seconds of video, in time order. Describe what is happening and what moved or changed.";

const FOLLOW_UP_INSTRUCTION =
  "Answer the user's question directly in one or two sentences.";

// =====================================================================

// --- DOM ELEMENTS ---
const choiceScreen = document.getElementById("choiceScreen");
const appScreen = document.getElementById("appScreen");
const selectPhotoButton = document.getElementById("selectPhotoButton");
const selectVideoButton = document.getElementById("selectVideoButton");
const backButton = document.getElementById("backButton");
const appTitle = document.getElementById("appTitle");
const videoFeed = document.getElementById("videoFeed");
const capturedImageElement = document.getElementById("capturedImage");
const recordingIndicator = document.getElementById("recordingIndicator");
const mainActionButton = document.getElementById("mainActionButton");
const chatContainer = document.getElementById("chat-container");
const followUpSection = document.getElementById("followUpSection");
const followUpInput = document.getElementById("followUpInput");
const micButton = document.getElementById("micButton");
const askFollowUpButton = document.getElementById("askFollowUpButton");
const canvas = document.getElementById("canvas");
const stopAudioButton = document.getElementById("stopAudioButton");
const backendUrlInput = document.getElementById("backendUrlInput");
const saveBackendUrlButton = document.getElementById("saveBackendUrlButton");
const backendUrlStatus = document.getElementById("backendUrlStatus");

// --- STATE ---
let mediaStream = null;
let lastCapturedImageBlob = null;
let lastCapturedFrames = [];
let currentMode = null;
let isImageCaptured = false;
let speechRecognition;
let currentUtterance = null;
let backendUrl = "";
let lastDescription = ""; // first description of the current capture
let followUpHistory = []; // [{ question, answer }] for the current capture
let captureId = 0; // changes on every new capture, so late replies are ignored

// SPEECH RECOGNITION SETUP
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.lang = "en-US";
  speechRecognition.interimResults = false;
}

// BACKEND URL SETTING

// Accepts a bare host, a full URL, or the whole ngrok line from the notebook
// (e.g. NgrokTunnel: "https://xxxx.ngrok-free.app" -> "http://localhost:8000").
// Returns the base URL without a trailing slash, or "" if it is not valid.
function normalizeBackendUrl(raw) {
  let text = (raw || "").trim();
  if (!text) return "";
  const found = text.match(/https?:\/\/[^\s"'<>]+/i);
  text = found ? found[0] : "https://" + text.replace(/^\/+/, "");
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    // Host must look like a real host name (e.g. xxxx.ngrok-free.app).
    const hostOk =
      /^[a-z0-9.-]+$/i.test(url.hostname) &&
      (url.hostname.includes(".") || url.hostname === "localhost");
    if (!hostOk) return "";
    // Drop a pasted endpoint path, keep only the base.
    const path = url.pathname
      .replace(/\/(describe-image|describe-video)\/?$/i, "")
      .replace(/\/+$/, "");
    return url.origin + path;
  } catch {
    return "";
  }
}

function loadSavedBackendUrl() {
  try {
    return localStorage.getItem(BACKEND_URL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveBackendUrl(url) {
  try {
    if (url) localStorage.setItem(BACKEND_URL_STORAGE_KEY, url);
    else localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
  } catch {
    // Storage blocked (e.g. private mode): the URL still works for this visit.
  }
}

function showBackendUrlStatus() {
  backendUrlInput.value = backendUrl;
  if (backendUrl) {
    backendUrlStatus.textContent = `Using ${backendUrl}`;
    backendUrlStatus.classList.remove("missing");
  } else {
    backendUrlStatus.textContent =
      "Not set. Run the Colab notebook and paste its ngrok URL here.";
    backendUrlStatus.classList.add("missing");
  }
}

function handleSaveBackendUrl() {
  const raw = backendUrlInput.value.trim();
  const url = normalizeBackendUrl(raw);
  if (raw && !url) {
    backendUrlStatus.textContent =
      "That does not look like a URL. Paste the https://… link from the notebook.";
    backendUrlStatus.classList.add("missing");
    speakText("That does not look like a valid URL.");
    return;
  }
  backendUrl = url;
  saveBackendUrl(url);
  showBackendUrlStatus();
  speakText(url ? "Backend URL saved." : "Backend URL cleared.");
}

function initBackendUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get("api");
  const queryUrl = normalizeBackendUrl(fromQuery);
  if (queryUrl) {
    backendUrl = queryUrl;
    saveBackendUrl(queryUrl);
  } else {
    backendUrl = normalizeBackendUrl(loadSavedBackendUrl());
  }
  showBackendUrlStatus();
}

// APP NAVIGATION
function showApp(mode) {
  currentMode = mode;
  choiceScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  appTitle.textContent = mode === "photo" ? "Describe Photo" : "Describe Video";
  resetAppScreen();
  initializeCamera();
}

function showChoiceScreen() {
  appScreen.classList.add("hidden");
  choiceScreen.classList.remove("hidden");
  stopCamera();
  currentMode = null;
}

async function initializeCamera() {
  stopCamera();
  mainActionButton.disabled = true;
  updateMainButtonContent("loading");
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    videoFeed.srcObject = mediaStream;
    videoFeed.onloadedmetadata = () => {
      mainActionButton.disabled = false;
      updateMainButtonContent("initial");

      if (currentMode === "video") {
        addMessage("status", `Ready to record.`);
      }
    };
  } catch (error) {
    console.error("Error accessing media devices.", error);
    addMessage(
      "status",
      "Error: Could not access camera. Please grant permission and refresh."
    );
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  stopSpeaking();
}

// UI & CHAT MANAGEMENT
function resetAppScreen() {
  videoFeed.classList.remove("hidden");
  capturedImageElement.classList.add("hidden");
  followUpSection.classList.add("hidden");
  recordingIndicator.classList.add("hidden");
  followUpInput.value = "";
  chatContainer.innerHTML = "";
  lastCapturedImageBlob = null;
  lastCapturedFrames = [];
  lastDescription = "";
  followUpHistory = [];
  captureId++;
  isImageCaptured = false;
  updateMainButtonContent("initial");
}

function updateMainButtonContent(state) {
  const icon = document.createElement("i");
  const span = document.createElement("span");
  mainActionButton.innerHTML = "";
  mainActionButton.classList.remove("recording");

  switch (state) {
    case "loading":
      icon.className = "fas fa-spinner fa-spin";
      span.textContent = " Starting...";
      break;
    case "capture":
      icon.className = "fas fa-camera";
      span.textContent = " New Capture";
      break;
    case "recording":
      icon.className = "fas fa-stop";
      span.textContent = " Stop";
      mainActionButton.classList.add("recording");
      break;
    case "initial":
    default:
      if (currentMode === "photo") {
        icon.className = "fa-regular fa-image";
        span.textContent = " Describe Image";
      } else {
        icon.className = "fas fa-video";
        span.textContent = " Record 5s Video";
      }
      break;
  }
  mainActionButton.appendChild(icon);
  mainActionButton.appendChild(span);
}

function addMessage(type, content, isUser = false) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("chat-message", type);
  if (isUser) messageDiv.classList.add("user");

  if (type === "loading") {
    messageDiv.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><span>${content}</span></div>`;
  } else {
    messageDiv.textContent = content;
  }

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return messageDiv;
}

function setInputsDisabled(disabled) {
  mainActionButton.disabled = disabled;
  askFollowUpButton.disabled = disabled;
  micButton.disabled = disabled;
  followUpInput.disabled = disabled;
  backButton.disabled = disabled;
}

// CORE LOGIC (PHOTO/VIDEO)

function handleMainActionClick() {
  if (currentMode === "photo") {
    if (isImageCaptured) {
      // "New Capture" was clicked
      resetAppScreen();
      // Re-initialize camera to make sure the button state is correct
      initializeCamera();
    } else {
      // "Describe Image" was clicked
      handleDescribeClick();
    }
  } else {
    // Video mode
    handleRecordClick();
  }
}

async function handleDescribeClick() {
  if (!mediaStream) return;
  if (!ensureBackendUrl()) return;
  setInputsDisabled(true);

  const { dataUrl, blob } = captureFrame();
  lastCapturedImageBlob = blob;
  isImageCaptured = true;
  lastDescription = "";
  followUpHistory = [];
  const thisCapture = ++captureId;

  capturedImageElement.src = dataUrl;
  videoFeed.classList.add("hidden");
  capturedImageElement.classList.remove("hidden");

  updateMainButtonContent("capture");
  setInputsDisabled(false); // Re-enable buttons immediately for "New Capture"

  const loadingMsg = addMessage("loading", "Analyzing image...");
  speakText("Analyzing image...");
  const description = await sendDataToBackend(blob, PHOTO_PROMPT, loadingMsg);
  if (description && thisCapture === captureId) lastDescription = description;
}

function handleRecordClick() {
  if (!mediaStream) return;
  if (!ensureBackendUrl()) return;
  setInputsDisabled(true);
  recordingIndicator.classList.remove("hidden");
  updateMainButtonContent("recording");
  lastDescription = "";
  followUpHistory = [];
  const thisCapture = ++captureId;

  const frames = [];
  const captureInterval = 500;
  const recordingDuration = 5000;

  const loadingMsg = addMessage(
    "loading",
    `Recording for ${recordingDuration / 1000}s...`
  );
  speakText("Recording");

  const intervalId = setInterval(() => {
    if (!mediaStream) {
      // Stop if camera is stopped
      clearInterval(intervalId);
      return;
    }
    const { blob } = captureFrame();
    frames.push(blob);
  }, captureInterval);

  setTimeout(async () => {
    clearInterval(intervalId);
    lastCapturedFrames = frames;
    recordingIndicator.classList.add("hidden");
    updateMainButtonContent("initial");

    if (frames.length === 0) {
      addMessage("status", "Recording failed. Please try again.");
      setInputsDisabled(false);
      return;
    }

    loadingMsg.querySelector("span").textContent = "Analyzing video...";
    speakText("Analyzing video...");
    const description = await sendDataToBackend(
      frames,
      VIDEO_PROMPT,
      loadingMsg
    );
    if (description && thisCapture === captureId) lastDescription = description;
  }, recordingDuration);
}

// Builds the follow-up prompt: base rules, the first description, the last
// few questions and answers for this capture, then the new question.
function buildFollowUpPrompt(question) {
  const parts = [BASE_PROMPT];
  if (lastDescription) {
    parts.push(`Your earlier description: ${lastDescription}`);
  }
  const recent = followUpHistory.slice(-MAX_FOLLOW_UP_HISTORY);
  if (recent.length > 0) {
    parts.push(
      "Earlier questions and answers:\n" +
        recent.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join("\n")
    );
  }
  parts.push(`User's question: ${question}`);
  parts.push(FOLLOW_UP_INSTRUCTION);
  return parts.join("\n\n");
}

async function handleFollowUpClick() {
  const question = followUpInput.value.trim();
  if (!question) return;
  if (!ensureBackendUrl()) return;

  addMessage("ai", question, true);
  followUpInput.value = "";
  setInputsDisabled(true);

  const loadingMsg = addMessage("loading", "Thinking...");
  speakText("Thinking");
  const thisCapture = captureId;
  const data =
    currentMode === "photo" ? lastCapturedImageBlob : lastCapturedFrames;
  const answer = await sendDataToBackend(
    data,
    buildFollowUpPrompt(question),
    loadingMsg
  );
  if (answer && thisCapture === captureId) {
    followUpHistory.push({ question, answer });
    if (followUpHistory.length > MAX_FOLLOW_UP_HISTORY) followUpHistory.shift();
  }
}

// Shows and speaks a message if no backend URL is set. Returns true if set.
function ensureBackendUrl() {
  if (backendUrl) return true;
  const message =
    "No backend URL set. Go back to the start screen and paste the ngrok URL from the Colab notebook.";
  addMessage("status", message);
  speakText(message);
  return false;
}

// Sends the capture to the backend. Returns the cleaned description, or null.
async function sendDataToBackend(data, promptText, loadingMessageElement) {
  if (!backendUrl) {
    loadingMessageElement.remove();
    ensureBackendUrl();
    setInputsDisabled(false);
    return null;
  }

  const formData = new FormData();
  const apiUrl =
    backendUrl + (currentMode === "photo" ? IMAGE_ENDPOINT : VIDEO_ENDPOINT);

  if (currentMode === "photo") {
    if (!data) {
      loadingMessageElement.remove();
      addMessage("status", "Error: No image captured.");
      setInputsDisabled(false);
      return null;
    }
    formData.append("image", data, "capture.jpg");
  } else {
    if (!data || data.length === 0) {
      loadingMessageElement.remove();
      addMessage("status", "Error: No frames recorded.");
      setInputsDisabled(false);
      return null;
    }
    data.forEach((frame, index) => {
      formData.append("frames", frame, `frame_${index}.jpg`);
    });
  }
  formData.append("text", promptText);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData,
      // Skips ngrok's free-tier browser warning page.
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    let result = null;
    try {
      result = await response.json();
    } catch {
      // Not JSON (e.g. an ngrok error page)
    }
    if (!response.ok) {
      throw new Error(result?.error || `HTTP error! status: ${response.status}`);
    }
    if (!result) throw new Error("The backend sent an unreadable response.");
    if (result.error) throw new Error(result.error);

    const description = stripMarkdown(result.description || "");
    loadingMessageElement.remove();
    addMessage("ai", description);
    speakText(description);
    followUpSection.classList.remove("hidden");
    return description;
  } catch (error) {
    loadingMessageElement.remove();
    // Network failure wording differs per browser (Chrome, Firefox, Safari).
    if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
      const message =
        "Could not reach the backend. Check that the Colab notebook is running and the backend URL is correct.";
      addMessage("status", `Error: ${message}`);
      speakText(message);
    } else {
      addMessage("status", `Error: ${error.message}`);
      speakText("Sorry, something went wrong. Please try again.");
    }
    return null;
  } finally {
    setInputsDisabled(false);
  }
}

// HELPER FUNCTIONS

// Captures the current video frame, scaled so the longest side is at most
// MAX_FRAME_SIDE pixels.
function captureFrame() {
  const context = canvas.getContext("2d");
  const width = videoFeed.videoWidth;
  const height = videoFeed.videoHeight;
  const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  context.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg");
  const blob = dataURLtoBlob(dataUrl);
  return { dataUrl, blob };
}

// Removes markdown so the reply reads cleanly on screen and aloud.
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/^\s*[-*+•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\b_([^_\n]+)_\b/g, "$1")
    .replace(/[*#]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function speakText(text, onEndCallback = () => {}) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // Stop any ongoing speech
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = "en-US";
  currentUtterance.onend = () => {
    stopAudioButton.classList.add("hidden");
    currentUtterance = null;
    onEndCallback();
  };
  window.speechSynthesis.speak(currentUtterance);
  stopAudioButton.classList.remove("hidden"); // Show stop button when speaking
}

function dataURLtoBlob(dataurl) {
  let arr = dataurl.split(","),
    mime = arr[0].match(/:(.*?);/)[1];
  let bstr = atob(arr[1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// EVENT LISTENERS
selectPhotoButton.addEventListener("click", () => showApp("photo"));
selectVideoButton.addEventListener("click", () => showApp("video"));
backButton.addEventListener("click", showChoiceScreen);

saveBackendUrlButton.addEventListener("click", handleSaveBackendUrl);
backendUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSaveBackendUrl();
});

mainActionButton.addEventListener("click", handleMainActionClick);

askFollowUpButton.addEventListener("click", handleFollowUpClick);
followUpInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleFollowUpClick();
});

if (micButton) {
  micButton.addEventListener("click", async () => {
    if (!speechRecognition) return;

    const hasPermission = await ensureMicrophoneAccess();

    if (hasPermission) {
      micButton.classList.add("fa-beat");
      speechRecognition.onresult = (event) => {
        followUpInput.value =
          event.results[event.results.length - 1][0].transcript.trim();
        handleFollowUpClick();
      };
      speechRecognition.onend = () => {
        micButton.classList.remove("fa-beat");
      };
      speechRecognition.start(); // The browser's speech recognition takes over here.
    }
  });
}
if (stopAudioButton) {
  stopAudioButton.addEventListener("click", () => {
    stopSpeaking();
    stopAudioButton.classList.add("hidden");
  });
}

async function ensureMicrophoneAccess() {
  if ("microphone" in navigator.permissions) {
    const permission = await navigator.permissions.query({
      name: "microphone",
    });
    if (permission.state === "granted") {
      return true;
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error("Microphone permission was denied.", error);
    addMessage(
      "status",
      "Microphone access was denied. You may need to enable it in your browser's site settings."
    );
    return false;
  }
}

initBackendUrl();
