// src/theme/ui.ts

/**
 * Walzia_Platform Theme Tokens v1.1 (DARK PREMIUM)
 *
 * Principles:
 * - Dark-first, premium, modern
 * - Accent is violet/pink (AI-driven feel), used intentionally
 * - Cards/surfaces are deep navy with soft borders
 * - Home “Today Focus” + “Suggestions” cards use *lighter vibrant* tints (not loud neon)
 *
 * Backward compatibility:
 * - Keep existing keys (bg, cardBg, btnBg, textDim, spacing.cardPad, etc.)
 * - Add new keys (homeCards, glow, accents) for richer UI
 */

export const UI = {
  // -------------------------
  // Colors (Dark premium baseline)
  // -------------------------
  colors: {
    // New (preferred)
    canvas: "#0E1424", // app canvas background (deep navy, not pitch black)
    surface: "#121B2E", // primary card surface
    surface2: "#0F1728", // secondary surface (sections, subtle panels)

    // Neutral ramp tuned for dark UI
    neutral: {
      900: "#0B1220",
      850: "#0E1424",
      800: "#121B2E",
      700: "#18243A",
      600: "#22314D",
      500: "#3A4A6A",
      400: "#647091",
      300: "#8C97B7",
      200: "#B8C2DD",
      100: "#EAF0FF",
    },

    /**
     * Accent family
     * NOTE: We keep the key name `.teal` for compatibility,
     * but it now represents the *primary accent* (violet).
     */
    primary: {
      teal: "#A78BFA", // PRIMARY accent (violet)
      tealMuted: "#C4B5FD", // softer violet

      // Extra accents (optional)
      violet: "#A78BFA",
      pink: "#F472B6",
      cyan: "#67E8F9",
    },

    // Ring tokens (score ring + glow)
    ring: {
      active: "#A78BFA", // ring stroke
      track: "#22314D", // ring track on dark
      glow: "rgba(167, 139, 250, 0.45)", // outer glow halo
    },

    // Inner highlight (subtle “polish”)
    innerHighlight: "rgba(255,255,255,0.06)",

    // --- Backward-compatible aliases (existing screens/components rely on these) ---
    bg: "#0E1424", // app background

    // Cards
    cardBg: "#121B2E",
    cardBorder: "#22314D",

    // Text (light on dark)
    text: "#EAF0FF",
    textDim: "#B8C2DD",
    textMuted: "#8C97B7",

    // Lines/borders
    outline: "#22314D",
    outlineStrong: "#2B3E63",

    // Buttons
    // - Primary CTA should use UI.colors.primary.teal (violet)
    // - Secondary/ghost uses these neutrals
    btnBg: "#18243A", // secondary button bg (“light grey” feel on dark)
    btnBorder: "#2B3E63",
    btnText: "#EAF0FF",

    // Errors (quiet but clear)
    errorBg: "rgba(255, 82, 82, 0.12)",
    errorBorder: "rgba(255, 82, 82, 0.35)",

    // Charts (dark-safe)
    chartBg: "#121B2E",
    chartBorder: "#22314D",
    chartBar: "#2B3E63",

    // Deltas
    deltaUp: "rgba(103, 232, 249, 0.75)", // cyan up
    deltaDown: "rgba(255, 82, 82, 0.70)", // muted red down

    successBg: "rgba(103, 232, 249, 0.12)",
    successBorder: "rgba(103, 232, 249, 0.30)",

    tipBg: "#121B2E",
    status: {
      danger: "#FF5252",
    },

    // Pills / chips (dark-safe)
    pill: {
      neutralBg: "#18243A",
      neutralBorder: "#2B3E63",
      neutralText: "#EAF0FF",

      goodBg: "rgba(103, 232, 249, 0.14)",
      goodBorder: "rgba(103, 232, 249, 0.35)",

      okBg: "rgba(167, 139, 250, 0.14)",
      okBorder: "rgba(167, 139, 250, 0.35)",

      badBg: "rgba(255, 82, 82, 0.12)",
      badBorder: "rgba(255, 82, 82, 0.30)",
    },

    // Home-specific vibrant-but-light cards (what you asked for)
    // Use these ONLY on Home for Today Focus + Suggestions.
    homeCards: {
      // Today Focus: AI-focused violet tint (light shade, still premium)
      focusBg: "rgba(167, 139, 250, 0.16)",
      focusBorder: "rgba(167, 139, 250, 0.35)",
      focusChipBg: "rgba(167, 139, 250, 0.18)",
      focusChipBorder: "rgba(167, 139, 250, 0.40)",

      // Suggestions: pink tint (light shade)
      suggestBg: "rgba(244, 114, 182, 0.14)",
      suggestBorder: "rgba(244, 114, 182, 0.34)",

      // Optional: mixed gradient feel without gradients (safe token approach)
      // Use as subtle top strip or icon badge background if you want.
      badgeBg: "rgba(103, 232, 249, 0.12)",
      badgeBorder: "rgba(103, 232, 249, 0.28)",
    },

    // AI Confidence pill tokens (if you want a standard look everywhere)
    ai: {
      pillBg: "rgba(103, 232, 249, 0.14)", // cyan tint reads “AI/tech”
      pillBorder: "rgba(103, 232, 249, 0.35)",
      pillText: "#EAF0FF",
    },

    // Shadows / overlays
    shadow: "#000000",

    modalBackdrop: "rgba(0,0,0,0.55)",
    modalCard: "#121B2E",
    modalBorder: "#22314D",
  },

  // -------------------------
  // Spacing (8pt system)
  // -------------------------
  spacing: {
    page: 20,

    cardPad: 14,
    cardPadLg: 20,
    sectionGap: 12,

    gap: 10,
    gapSm: 8,
    gapXs: 6,

    btnY: 12,
    btnX: 14,

    pillY: 6,
    pillX: 10,

    cardPadding: 10,
    textGapSm: 4,
    sectionGapSm: 6,
    tipPadding: 10,

    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },

  // -------------------------
  // Radius
  // -------------------------
  radius: {
    card: 16,
    hero: 20,
    inner: 12,
    btn: 16,
    pill: 999,

    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },

  border: {
    thin: 1,
  },

  // -------------------------
  // Typography
  // -------------------------
  type: {
    h1: 28,
    cardTitle: 18,
    rowTitle: 16,
    kpiValue: 18,
    small: 10,
    scoreBig: 36,
    caption: 12,
    lineHeightMd: 18,

    title: 20,
    heroNumber: 48,
    cardTitleSm: 13,
    label: 12,

    md: 15,
    lg: 17,
    xl: 20,

    button: 14,
    section: 13,
  },

  limits: { scoringReasonsMax: 6 },
  opacity: { reason: 0.95 },

  scoring: {
    goodMin: 80,
    okMin: 65,
  },

  trend: {
    barMinH: 6,
    barMaxH: 40,
    barW: 14,
    barColW: 20,
  },

  motion: {
    fast: 160,
    deltaTranslateY: 4,
    ringMs: 600,
  },

  sizes: {
    textAreaMinH: 110,
    cameraH: 300,
    buttonH: 56,
    chipH: 28,
    ringSize: 180,
    ringStroke: 12,
  },

  shadow: {
    card: { y: 6, blur: 16, opacity: 0.22 },
  },

  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;