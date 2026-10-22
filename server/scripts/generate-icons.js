const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const OUT = path.join(__dirname, '..', '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

function draw(size, opts = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const pad = opts.maskable ? 0 : Math.round(size * 0.12);

  // background
  const r = opts.maskable ? 0 : Math.round(size * 0.22);
  ctx.fillStyle = '#0f766e';
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(pad, pad, size - 2 * pad, size - 2 * pad, r) : ctx.rect(pad, pad, size - 2 * pad, size - 2 * pad);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, size, size);
  }

  // subtle top-right accent
  ctx.fillStyle = '#14b8a6';
  ctx.beginPath();
  ctx.arc(size - pad * 0.9, pad * 0.9, size * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // "A" mark
  const cx = size / 2;
  const cy = size / 2 + size * 0.02;
  const w = size * (opts.maskable ? 0.5 : 0.44);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - w * 0.62);
  ctx.lineTo(cx + w * 0.52, cy + w * 0.55);
  ctx.lineTo(cx + w * 0.20, cy + w * 0.18);
  ctx.lineTo(cx - w * 0.20, cy + w * 0.18);
  ctx.lineTo(cx - w * 0.52, cy + w * 0.55);
  ctx.closePath();
  ctx.fill();

  // crossbar
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(cx - w * 0.20, cy - w * 0.02, w * 0.40, size * 0.055);

  return canvas.toBuffer('image/png');
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), draw(192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), draw(512));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), draw(512, { maskable: true }));
console.log('icons written to', OUT);
