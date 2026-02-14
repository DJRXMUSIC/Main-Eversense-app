/**
 * Dynamic PWA icon generator.
 * Called from the PWA to create colored app icons on the fly.
 * Usage: Generates a canvas-based icon and updates the manifest link.
 */

const ICON_COLORS = {
  default: '#00843D',
  blue: '#3b82f6',
  orange: '#f97316',
  red: '#dc2626',
  purple: '#8b5cf6',
  teal: '#14b8a6',
};

function generateIcon(size, color) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Background
  const r = size * 0.15;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();

  // "S" letter
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.55}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size / 2, size / 2 + size * 0.02);

  // Small lightning bolt accent
  const bx = size * 0.72;
  const by = size * 0.25;
  const bs = size * 0.12;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - bs * 0.3, by + bs * 0.5);
  ctx.lineTo(bx + bs * 0.1, by + bs * 0.45);
  ctx.lineTo(bx - bs * 0.1, by + bs);
  ctx.lineTo(bx + bs * 0.3, by + bs * 0.5);
  ctx.lineTo(bx - bs * 0.1, by + bs * 0.55);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL('image/png');
}

// Update apple-touch-icon dynamically
function updateAppIcon(iconId) {
  const color = ICON_COLORS[iconId] || ICON_COLORS.default;

  // Update apple-touch-icon
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleIcon) {
    appleIcon.href = generateIcon(180, color);
  }

  // Update favicon
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) {
    favicon.href = generateIcon(32, color);
  }
}

// Export for use
window.__updateAppIcon = updateAppIcon;
window.__ICON_COLORS = ICON_COLORS;
