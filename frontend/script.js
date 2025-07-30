// --- CONFIGURATION ---
const PHOTO_API_URL = "https://your-ngrok-link/describe-image/";
const VIDEO_API_URL = "https://your-ngrok-link/describe-video/";

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

// --- STATE ---
let mediaStream = null;
let lastCapturedImageBlob = null;
let lastCapturedFrames = [];
let currentMode = null;
let isImageCaptured = false;
let speechRecognition;
let currentUtterance = null;

// SPEECH RECOGNITION SETUP
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.lang = "en-US";
  speechRecognition.interimResults = false;
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
  window.speechSynthesis.cancel();
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

function handleDescribeClick() {
  if (!mediaStream) return;
  setInputsDisabled(true);

  const { dataUrl, blob } = captureFrame();
  lastCapturedImageBlob = blob;
  isImageCaptured = true;

  capturedImageElement.src = dataUrl;
  videoFeed.classList.add("hidden");
  capturedImageElement.classList.remove("hidden");

  updateMainButtonContent("capture");
  setInputsDisabled(false); // Re-enable buttons immediately for "New Capture"

  const loadingMsg = addMessage("loading", "Analyzing image...");
  speakText("Analyzing image...");
  sendDataToBackend(
    blob,
    "Describe this image in a single, concise sentence.",
    loadingMsg
  );
}

function handleRecordClick() {
  if (!mediaStream) return;
  setInputsDisabled(true);
  recordingIndicator.classList.remove("hidden");
  updateMainButtonContent("recording");

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

  setTimeout(() => {
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
    sendDataToBackend(
      frames,
      "Sequential frames from a short video, describes the scene and any actions or changes taking place.",
      loadingMsg
    );
  }, recordingDuration);
}

function handleFollowUpClick() {
  const question = followUpInput.value.trim();
  if (!question) return;

  addMessage("ai", question, true);
  followUpInput.value = "";
  setInputsDisabled(true);

  const loadingMsg = addMessage("loading", "Thinking...");
  speakText("Thinking");
  const data =
    currentMode === "photo" ? lastCapturedImageBlob : lastCapturedFrames;
  sendDataToBackend(data, question, loadingMsg);
}

async function sendDataToBackend(data, promptText, loadingMessageElement) {
  const formData = new FormData();
  const apiUrl = currentMode === "photo" ? PHOTO_API_URL : VIDEO_API_URL;

  if (currentMode === "photo") {
    if (!data) {
      loadingMessageElement.remove();
      addMessage("status", "Error: No image captured.");
      setInputsDisabled(false);
      return;
    }
    formData.append("image", data, "capture.jpg");
  } else {
    if (!data || data.length === 0) {
      loadingMessageElement.remove();
      addMessage("status", "Error: No frames recorded.");
      setInputsDisabled(false);
      return;
    }
    data.forEach((frame, index) => {
      formData.append("frames", frame, `frame_${index}.jpg`);
    });
  }
  formData.append("text", promptText);

  try {
    const response = await fetch(apiUrl, { method: "POST", body: formData });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    loadingMessageElement.remove();
    const aiMsg = addMessage("ai", result.description);
    speakText(result.description);
    followUpSection.classList.remove("hidden");
  } catch (error) {
    loadingMessageElement.remove();
    const errorMessage = `Error: ${error.message}`;
    addMessage("status", errorMessage);
    if (errorMessage.includes("Failed to fetch")) {
      speakText(
        "Error: Failed to fetch. Please check your internet connection"
      );
    }
  } finally {
    setInputsDisabled(false);
  }
}

// HELPER FUNCTIONS
function captureFrame() {
  const context = canvas.getContext("2d");
  canvas.width = videoFeed.videoWidth;
  canvas.height = videoFeed.videoHeight;

  context.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg");
  const blob = dataURLtoBlob(dataUrl);
  return { dataUrl, blob };
}

function speakText(text, onEndCallback = () => {}) {
  window.speechSynthesis.cancel(); // Stop any ongoing speech
  if ("speechSynthesis" in window) {
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
    window.speechSynthesis.cancel();
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
