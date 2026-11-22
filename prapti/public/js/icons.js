// Inline SVG illustrations. Each function returns an SVG string built only
// from constants in this file, so no user input ever reaches innerHTML here.

const NAVY = "#1e3a5f";
const TINT = "#e8eff8";
const ACCENT = "#2f7fd1";

export function studentIcon() {
  return `<svg class="illustration" viewBox="0 0 160 160" role="img" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${NAVY}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M28 132 C30 104 52 92 80 92 C108 92 130 104 132 132" fill="${ACCENT}" fill-opacity=".18"/>
    <circle cx="80" cy="56" r="26" fill="${TINT}"/>
    <path d="M56 50 C60 30 100 28 104 50 C94 42 70 40 56 50 Z" fill="${NAVY}"/>
    <path d="M58 118 L80 128 L102 118" />
    <path d="M52 140 L80 150 L108 140 L108 128 L52 128 Z" fill="${TINT}"/>
    <path d="M80 150 L80 136"/>
    <path d="M124 60 L140 60 L140 92" />
  </g>
  <circle cx="72" cy="58" r="3" fill="${NAVY}"/>
  <circle cx="88" cy="58" r="3" fill="${NAVY}"/>
  <path d="M74 68 Q80 72 86 68" fill="none" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

export function schemeIcon() {
  return `<svg class="illustration" viewBox="0 0 160 160" role="img" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${NAVY}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M36 30 L108 26 L124 132 L52 136 Z" fill="#fff"/>
    <path d="M48 54 L98 51"/>
    <path d="M52 70 L106 67"/>
    <path d="M56 86 L100 84"/>
    <path d="M60 102 L84 101"/>
  </g>
  <circle cx="104" cy="112" r="20" fill="${ACCENT}" stroke="${NAVY}" stroke-width="4"/>
  <path d="M96 124 L92 142 L104 136 L116 142 L112 124" fill="${TINT}" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round"/>
</svg>`;
}

export function appIconSvg(size = 32) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="${NAVY}"/>
  <path d="M256 190 C210 165 150 160 110 170 L110 340 C150 330 210 335 256 360 Z" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
  <path d="M256 190 C302 165 362 160 402 170 L402 340 C362 330 302 335 256 360 Z" fill="${TINT}" stroke="${TINT}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M256 190 L256 360" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round"/>
  <path d="M256 190 L256 132" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <path d="M256 152 C232 152 212 137 210 114 C234 112 254 126 256 152 Z" fill="${ACCENT}"/>
  <path d="M256 134 C270 112 292 106 312 110 C308 130 286 140 256 134 Z" fill="${TINT}"/>
</svg>`;
}
