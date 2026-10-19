# Experiment: on-device Gemma 3n in the browser (WebGPU)

**Status:** not viable on mid-range phones. Blind Vision keeps using the Colab GPU backend.

> **Warning:** `model-test.html` crashed and rebooted the test phone. It is kept here for reference only and is not deployed with the website.

## Goal

Run Gemma 3n E2B fully inside the phone's Chrome browser using WebGPU, so Blind Vision would work with no server at all: open the site, pick the model file once, and get descriptions offline.

## Setup

- **Page:** [`model-test.html`](model-test.html), a standalone test page. It lets you pick the model file, copies it into the browser's private storage (OPFS), loads it, captures one photo from the rear camera, and shows the description with load and generation times. Errors and device checks are shown on the page itself.
- **Model:** `gemma-3n-E2B-it-int4-Web.litertlm` (3.04 GB) from [google/gemma-3n-E2B-it-litert-lm](https://huggingface.co/google/gemma-3n-E2B-it-litert-lm) (requires accepting the Gemma license on Hugging Face).
- **Runtime:** MediaPipe LLM Inference (`@mediapipe/tasks-genai` 0.10.29) on WebGPU. LiteRT-LM's web API was not used because it only supported text input at the time.
- **Device:** OnePlus 10R, 8 GB RAM, Mali GPU, Chrome 155 on Android.

## Results

| Step | Result |
| --- | --- |
| Copy model into browser storage | 41.7 s |
| Load model | 36.2 s |
| GPU buffer limit | MediaPipe warned that the GPU's `maxStorageBufferBindingSize` is 256 MB, while LLM tasks need about 500 MB (524,550,144 bytes) |
| First image | WebGPU device lost (`A valid external Instance reference no longer exists`), then the phone crashed and rebooted |

## Conclusion

In-browser Gemma 3n is not viable on this class of phone. The blocker is the WebGPU buffer limit (256 MB on this GPU, about 500 MB needed), not total RAM. A native Android app using LiteRT-LM, which is not limited by the browser's WebGPU limits, is the more realistic route to on-device inference.

## Note on the model file format

The `-Web.litertlm` file does not start with the ASCII bytes `LITERTLM` like the general `.litertlm` container format. It has `TFL3` at bytes 4-7 (a TFLite flatbuffer), which MediaPipe accepts. The first version of the test page expected `LITERTLM` and wrongly rejected the file; the check was then changed to a warning.

## Running the page

WebGPU and OPFS need a secure context, so serve the page over HTTPS or from `localhost`, for example `python3 -m http.server` in this folder and open `http://localhost:8000/model-test.html`. Optional URL parameters `?images=1&tokens=1024` lower the image and token limits.
