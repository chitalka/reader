import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_PHOTO_LIMIT = 10 * 1024 * 1024;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadReleaseEnvironment() {
  const filename = resolve('.env.release.local');
  if (!existsSync(filename)) return;

  for (const rawLine of readFileSync(filename, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArguments(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (!argument.startsWith('--')) fail(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

loadReleaseEnvironment();
const options = parseArguments(process.argv.slice(2));
const channel = options.channel;
const captionFile = options.caption;
const imageFile = options.image;

if (!channel || !captionFile || !imageFile) {
  fail('Usage: node scripts/publish-telegram-release.mjs --channel @channel --caption notes.txt --image release.png [--dry-run]');
}

const captionPath = resolve(captionFile);
const imagePath = resolve(imageFile);
if (!existsSync(captionPath)) fail(`Caption file not found: ${captionFile}`);
if (!existsSync(imagePath)) fail(`Image file not found: ${imageFile}`);

const caption = readFileSync(captionPath, 'utf8').trim();
const image = readFileSync(imagePath);
if (!caption) fail('Caption must not be empty');
if (caption.length > TELEGRAM_CAPTION_LIMIT) {
  fail(`Caption is ${caption.length} characters; Telegram allows ${TELEGRAM_CAPTION_LIMIT}`);
}
if (image.length > TELEGRAM_PHOTO_LIMIT) {
  fail(`Image is ${image.length} bytes; Telegram sendPhoto allows ${TELEGRAM_PHOTO_LIMIT}`);
}

if (options.dryRun) {
  console.log(JSON.stringify({
    channel,
    captionCharacters: caption.length,
    imageBytes: image.length,
  }));
  process.exit(0);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) fail('TELEGRAM_BOT_TOKEN is missing from .env.release.local');

const form = new FormData();
form.set('chat_id', channel);
form.set('caption', caption);
form.set('photo', new Blob([image], { type: 'image/png' }), basename(imagePath));

const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
  method: 'POST',
  body: form,
});
const payload = await response.json();
if (!response.ok || !payload.ok) {
  fail(`Telegram publication failed: ${payload.description || response.statusText}`);
}

const channelName = channel.replace(/^@/u, '');
console.log(`https://t.me/${channelName}/${payload.result.message_id}`);
