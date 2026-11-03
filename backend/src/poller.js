import { runPollOnce } from './runPollOnce.js';
runPollOnce().then((result) => {
  console.log('[FishSense poll]', JSON.stringify(result, null, 2));
  if (result.results.every((r) => r.error || r.skipped)) process.exitCode = 1;
}).catch((error) => {
  console.error('[FishSense poll] failed', error);
  process.exitCode = 1;
});
