// Retry only temporary HTTP gateway/service failures after a Pages deployment.
// Persistent 5xx, ordinary 4xx, and browser exceptions still fail the caller.
'use strict';

const TRANSIENT_STATUS = new Set([502, 503, 504]);

async function fetchWithTransientRetry(fetcher, {
  label = 'published page',
  attempts = 4,
  delayMs = 1500,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  warn = message => console.warn(message)
} = {}) {
  if (typeof fetcher !== 'function') throw new TypeError('fetcher must be a function');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6) {
    throw new RangeError('attempts must be 1–6');
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetcher();
    const status = response?.status?.();
    if (!TRANSIENT_STATUS.has(status) || attempt === attempts) return response;
    warn(`${label}: HTTP ${status} (${attempt}/${attempts}); retrying without suppressing persistent errors`);
    await sleep(delayMs * attempt);
  }
}

module.exports = {fetchWithTransientRetry};
