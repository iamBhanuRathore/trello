export const BOARD_GRADIENTS = [
  { id: 'blue', name: 'Oceanic Blue', value: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' },
  {
    id: 'violet',
    name: 'Royal Purple',
    value: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
  },
  {
    id: 'emerald',
    name: 'Emerald Teal',
    value: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset Coral',
    value: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
  },
  { id: 'rose', name: 'Rose Berry', value: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)' },
  { id: 'cyan', name: 'Cyan Sky', value: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' },
  { id: 'amber', name: 'Golden Amber', value: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' },
  { id: 'indigo', name: 'Deep Indigo', value: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' },
  { id: 'slate', name: 'Modern Slate', value: 'linear-gradient(135deg, #475569 0%, #334155 100%)' },
];

/**
 * Resolves board gradient, automatically upgrading legacy dark/pitch-black gradients
 * into rich, vibrant, modern palettes that look amazing in both light and dark themes.
 */
export function resolveBoardGradient(bg?: string, index: number = 0): string {
  if (!bg) {
    return BOARD_GRADIENTS[index % BOARD_GRADIENTS.length].value;
  }
  // Backend allowlists this shape; double-guard legacy/dirty rows here so a
  // stored `url(...)`/`javascript:` value can never reach `style={background}`.
  if (/url\(|javascript:|expression|</i.test(bg)) {
    return BOARD_GRADIENTS[index % BOARD_GRADIENTS.length].value;
  }
  // Check if it's one of the legacy pitch-black gradients
  const isDarkLegacy =
    bg.includes('#0f172a') ||
    bg.includes('#1e1b4b') ||
    bg.includes('#0c2340') ||
    bg.includes('#064e3b') ||
    bg.includes('#2e1065') ||
    bg.includes('#18181b') ||
    bg.includes('#312e81') ||
    bg.includes('slate-900') ||
    bg.includes('indigo-950');

  if (isDarkLegacy) {
    return BOARD_GRADIENTS[index % BOARD_GRADIENTS.length].value;
  }
  return bg;
}
