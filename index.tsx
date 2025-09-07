/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

const GEMINI_API_KEY = process.env.API_KEY;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>(async (resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function generateContent(
  prompt: string,
  imageBytes: string,
  durationSeconds: number,
  aspectRatio: string,
) {
  const ai = new GoogleGenAI({vertexai: false, apiKey: GEMINI_API_KEY});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    // model: 'veo-3.0-generate-preview',
    prompt,
    config: {
      aspectRatio,
      durationSeconds,
      // fps: 24,
      // generateAudio: true,
      // resolution: "720p",
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png',
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    console.log('Waiting for completion');
    await delay(1000);
    operation = await ai.operations.getVideosOperation({operation});
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error('No videos generated');
  }

  videos.forEach(async (v, i) => {
    const url = decodeURIComponent(v.video.uri);
    const res = await fetch(url);
    const blob = await res.blob();
    const objectURL = URL.createObjectURL(blob);
    downloadFile(objectURL, `video${i}.mp4`);
    video.src = objectURL;
    console.log('Downloaded video', `video${i}.mp4`);
    video.style.display = 'block';
  });
}

const upload = document.querySelector('#file-input') as HTMLInputElement;
let base64data = '';
let prompt = '';
let duration = 5;
let aspectRatio = '1:1';

upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files[0];
  if (file) {
    base64data = await blobToBase64(file);
  }
});

const promptEl = document.querySelector('#prompt-input') as HTMLInputElement;
promptEl.addEventListener('change', async () => {
  prompt = promptEl.value;
});

const durationEl = document.querySelector('#duration-input') as HTMLInputElement;
durationEl.addEventListener('change', () => {
  duration = parseInt(durationEl.value, 10);
});

const aspectRatioEl = document.querySelector('#aspect-ratio-input') as HTMLSelectElement;
aspectRatioEl.addEventListener('change', () => {
  aspectRatio = aspectRatioEl.value;
});


const statusEl = document.querySelector('#status') as HTMLDivElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const openKeyEl = document.querySelector('#open-key') as HTMLButtonElement;

openKeyEl.addEventListener('click', async (e) => {
  await window.aistudio?.openSelectKey();
});

const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
generateButton.addEventListener('click', (e) => {
  generate();
});

async function generate() {
  statusEl.innerText = 'Generating...';
  video.style.display = 'none';

  generateButton.disabled = true;
  upload.disabled = true;
  promptEl.disabled = true;
  durationEl.disabled = true;
  aspectRatioEl.disabled = true;
  quotaErrorEl.style.display = 'none';

  try {
    await generateContent(prompt, base64data, duration, aspectRatio);
    statusEl.innerText = 'Done.';
  } catch (e: any) {
    console.error('Generation failed:', e);

    let errorMessage = 'An unexpected error occurred. Please try again.';
    let showQuotaErrorUI = false;

    try {
      // The API often wraps errors in a JSON string within the message property.
      const errorDetail = JSON.parse(e.message);
      const code = errorDetail?.error?.code;
      const message = errorDetail?.error?.message;

      switch (code) {
        case 400:
          errorMessage = `Bad Request: ${
            message || 'Please check your inputs and try again.'
          }`;
          break;
        case 401:
        case 403:
          errorMessage =
            'Authentication Error: Please add a valid API key to continue.';
          showQuotaErrorUI = true;
          break;
        case 429:
          // The specific message for quota errors is in the HTML.
          errorMessage = '';
          showQuotaErrorUI = true;
          break;
        case 500:
        case 503:
          errorMessage =
            'Server Error: The service is temporarily unavailable. Please try again later.';
          break;
        default:
          errorMessage = message || e.message;
          break;
      }
    } catch (parseError) {
      // If parsing fails, use the original error message.
      errorMessage = e.message;
    }

    statusEl.innerText = errorMessage;
    if (showQuotaErrorUI) {
      quotaErrorEl.style.display = 'block';
    }
  }

  generateButton.disabled = false;
  upload.disabled = false;
  promptEl.disabled = false;
  durationEl.disabled = false;
  aspectRatioEl.disabled = false;
}