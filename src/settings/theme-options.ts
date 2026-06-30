import type {
  CalloutIconName,
  CalloutKind,
  CalloutStyle,
  ThemePreset,
  ThemeTokenGroup,
  VaultThemeCalloutSettings,
  VaultThemeOptions,
} from "../lib/app-types";

export const defaultThemeOptions: VaultThemeOptions = {
  colorfulHeadings: false,
  headingUnderlines: false,
  headingAnchors: false,
  richCallouts: false,
};
export const calloutStyleOptions: Array<{ value: CalloutStyle; label: string }> = [
  { value: "plain", label: "Plain" },
  { value: "striped", label: "Striped" },
  { value: "card", label: "Card" },
  { value: "compact", label: "Compact" },
  { value: "obsidian", label: "Obsidian" },
];
export const calloutIconOptions: Array<{ value: CalloutIconName; label: string; glyph: string }> = [
  { value: "info", label: "Info", glyph: "i" },
  { value: "sparkles", label: "Sparkles", glyph: "*" },
  { value: "alert", label: "Alert", glyph: "!" },
  { value: "check", label: "Check", glyph: "+" },
  { value: "quote", label: "Quote", glyph: "\"" },
  { value: "none", label: "None", glyph: "" },
];
export const calloutKinds: Array<{ value: CalloutKind; label: string }> = [
  { value: "note", label: "Note" },
  { value: "info", label: "Info" },
  { value: "tip", label: "Tip" },
  { value: "warning", label: "Warning" },
];
export const defaultThemeCalloutSettings: VaultThemeCalloutSettings = {
  style: "plain",
  icons: {
    note: "info",
    info: "info",
    tip: "sparkles",
    warning: "alert",
  },
};
export const defaultThemeLevelOneTokens: Record<string, string> = {
  "--glyphary-font-ui": "Inter, ui-sans-serif, system-ui, sans-serif",
  "--glyphary-font-editor": "Inter, ui-sans-serif, system-ui, sans-serif",
  "--glyphary-font-mono": "SFMono-Regular, Consolas, Liberation Mono, monospace",
  "--glyphary-editor-font-size": "1.05rem",
  "--glyphary-editor-line-height": "1.7",
  "--glyphary-editor-max-width": "none",
  "--glyphary-editor-padding-y": "38px",
  "--glyphary-editor-padding-x": "min(6vw, 72px)",
  "--glyphary-block-gap": "0.85em",
  "--glyphary-heading-h1-size": "2rem",
  "--glyphary-heading-h2-size": "1.45rem",
  "--glyphary-code-font-size": "0.92em",
  "--glyphary-code-tab-size": "4",
  "--glyphary-callout-background": "transparent",
  "--glyphary-callout-border-width": "1px",
  "--glyphary-callout-icon-size": "1.45rem",
  "--glyphary-callout-note-color": "#2f6846",
  "--glyphary-callout-info-color": "#2f6846",
  "--glyphary-callout-padding": "0.85rem 1rem",
  "--glyphary-callout-radius": "8px",
  "--glyphary-callout-title-transform": "uppercase",
  "--glyphary-callout-tip-color": "#8fd18f",
  "--glyphary-callout-warning-color": "#f5d08c",
  "--glyphary-radius-sm": "6px",
  "--glyphary-radius-md": "8px",
  "--glyphary-radius-lg": "10px",
  "--glyphary-border-width": "1px",
  "--glyphary-column-gap": "16px",
  "--syntax-red": "#ee8f8f",
  "--syntax-purple": "#c7a6ff",
  "--syntax-orange": "#e6a75e",
};

// The theme builder deliberately exposes only stable Glyphary variables. Vault
// settings persist these tokens directly, while CSS maps them onto Obsidian-like
// names for future theme compatibility.
export const themeTokenGroups: ThemeTokenGroup[] = [
  {
    title: "Canvas",
    controls: [
      { label: "App background", token: "--glyphary-app-bg" },
      { label: "Surface", token: "--glyphary-surface" },
      { label: "Muted surface", token: "--glyphary-surface-muted" },
      { label: "Hover", token: "--glyphary-hover" },
      { label: "Selection", token: "--glyphary-selection" },
    ],
  },
  {
    title: "Text",
    controls: [
      { label: "Text", token: "--glyphary-text" },
      { label: "Soft text", token: "--glyphary-text-soft" },
      { label: "Editor text", token: "--glyphary-editor-text" },
      { label: "Heading", token: "--glyphary-heading" },
      { label: "Muted text", token: "--glyphary-muted" },
      { label: "Strong muted text", token: "--glyphary-muted-strong" },
      { label: "Mono text", token: "--glyphary-mono-text" },
    ],
  },
  {
    title: "Accent And Borders",
    controls: [
      { label: "Accent", token: "--glyphary-accent" },
      { label: "Accent text", token: "--glyphary-accent-text" },
      { label: "Focus", token: "--glyphary-focus" },
      { label: "Border", token: "--glyphary-border" },
      { label: "Soft border", token: "--glyphary-border-soft" },
      { label: "Strong border", token: "--glyphary-border-strong" },
      { label: "Table border", token: "--glyphary-table-border" },
    ],
  },
  {
    title: "Blocks",
    controls: [
      { label: "Code background", token: "--glyphary-code-bg" },
      { label: "Code text", token: "--glyphary-code-text" },
      { label: "Quote border", token: "--glyphary-quote-border" },
      { label: "Quote text", token: "--glyphary-quote-text" },
    ],
  },
  {
    title: "Callouts",
    controls: [
      { label: "Background", token: "--glyphary-callout-background" },
      { label: "Note color", token: "--glyphary-callout-note-color" },
      { label: "Info color", token: "--glyphary-callout-info-color" },
      { label: "Tip color", token: "--glyphary-callout-tip-color" },
      { label: "Warning color", token: "--glyphary-callout-warning-color" },
      {
        label: "Padding",
        token: "--glyphary-callout-padding",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-padding"],
      },
      {
        label: "Radius",
        token: "--glyphary-callout-radius",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-radius"],
      },
      {
        label: "Border width",
        token: "--glyphary-callout-border-width",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-border-width"],
      },
      {
        label: "Icon size",
        token: "--glyphary-callout-icon-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-icon-size"],
      },
      {
        label: "Title transform",
        token: "--glyphary-callout-title-transform",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-title-transform"],
      },
    ],
  },
  {
    title: "Syntax",
    controls: [
      { label: "Blue", token: "--syntax-blue" },
      { label: "Green", token: "--syntax-green" },
      { label: "Yellow", token: "--syntax-yellow" },
      { label: "Red", token: "--syntax-red" },
      { label: "Purple", token: "--syntax-purple" },
      { label: "Orange", token: "--syntax-orange" },
      { label: "Muted", token: "--syntax-muted" },
    ],
  },
  {
    title: "Typography",
    controls: [
      {
        label: "UI font stack",
        token: "--glyphary-font-ui",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-font-ui"],
      },
      {
        label: "Editor font stack",
        token: "--glyphary-font-editor",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-font-editor"],
      },
      {
        label: "Code font stack",
        token: "--glyphary-font-mono",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-font-mono"],
      },
      {
        label: "Editor font size",
        token: "--glyphary-editor-font-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-font-size"],
      },
      {
        label: "Editor line height",
        token: "--glyphary-editor-line-height",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-line-height"],
      },
      {
        label: "H1 size",
        token: "--glyphary-heading-h1-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-heading-h1-size"],
      },
      {
        label: "H2 size",
        token: "--glyphary-heading-h2-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-heading-h2-size"],
      },
      {
        label: "Code font size",
        token: "--glyphary-code-font-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-code-font-size"],
      },
    ],
  },
  {
    title: "Spacing And Shape",
    controls: [
      {
        label: "Editor max width",
        token: "--glyphary-editor-max-width",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-max-width"],
      },
      {
        label: "Editor vertical padding",
        token: "--glyphary-editor-padding-y",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-padding-y"],
      },
      {
        label: "Editor horizontal padding",
        token: "--glyphary-editor-padding-x",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-padding-x"],
      },
      {
        label: "Block gap",
        token: "--glyphary-block-gap",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-block-gap"],
      },
      {
        label: "Column gap",
        token: "--glyphary-column-gap",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-column-gap"],
      },
      {
        label: "Small radius",
        token: "--glyphary-radius-sm",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-radius-sm"],
      },
      {
        label: "Medium radius",
        token: "--glyphary-radius-md",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-radius-md"],
      },
      {
        label: "Large radius",
        token: "--glyphary-radius-lg",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-radius-lg"],
      },
      {
        label: "Border width",
        token: "--glyphary-border-width",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-border-width"],
      },
      {
        label: "Code tab size",
        token: "--glyphary-code-tab-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-code-tab-size"],
      },
    ],
  },
];

const editableThemeTokens = new Set(
  themeTokenGroups.flatMap((group) => group.controls.map((control) => control.token)),
);

// Presets are full token maps instead of partial overrides. Applying one should
// erase dependency on any previous custom theme, then the Theme Builder can
// refine individual values from that complete baseline.
export const themePresets: ThemePreset[] = [
  {
    id: "field-notes",
    name: "Field Notes",
    description: "Warm paper, green accents, quiet editorial contrast.",
    tokens: {
      "--glyphary-app-bg": "#f3f1eb",
      "--glyphary-surface": "#fffdfa",
      "--glyphary-surface-muted": "#faf8f2",
      "--glyphary-hover": "#eef1ea",
      "--glyphary-selection": "rgba(47, 104, 70, 0.16)",
      "--glyphary-text": "#17201a",
      "--glyphary-text-soft": "#405044",
      "--glyphary-editor-text": "#1d271f",
      "--glyphary-heading": "#213227",
      "--glyphary-muted": "#637167",
      "--glyphary-muted-strong": "#5f6d63",
      "--glyphary-mono-text": "#273329",
      "--glyphary-accent": "#2f6846",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#7d8f7f",
      "--glyphary-border": "#ded9ce",
      "--glyphary-border-soft": "#e7e2d8",
      "--glyphary-border-strong": "#d4d0c6",
      "--glyphary-table-border": "#d8d4ca",
      "--glyphary-code-bg": "#18231c",
      "--glyphary-code-text": "#f2f7ef",
      "--glyphary-quote-border": "#77977d",
      "--glyphary-quote-text": "#435547",
      "--glyphary-shadow": "rgba(45, 38, 27, 0.08)",
      "--glyphary-shadow-strong": "rgba(45, 38, 27, 0.12)",
      "--syntax-blue": "#8fd7ff",
      "--syntax-green": "#8fd18f",
      "--syntax-yellow": "#f5d08c",
      "--syntax-muted": "#8da092",
    },
  },
  {
    id: "ink-linen",
    name: "Ink & Linen",
    description: "Clean white surfaces with crisp ink and restrained blue.",
    tokens: {
      "--glyphary-app-bg": "#f6f7f7",
      "--glyphary-surface": "#ffffff",
      "--glyphary-surface-muted": "#eef2f3",
      "--glyphary-hover": "#e8eff2",
      "--glyphary-selection": "rgba(30, 95, 132, 0.16)",
      "--glyphary-text": "#11191d",
      "--glyphary-text-soft": "#38464d",
      "--glyphary-editor-text": "#182126",
      "--glyphary-heading": "#10242d",
      "--glyphary-muted": "#64727a",
      "--glyphary-muted-strong": "#52616a",
      "--glyphary-mono-text": "#273a42",
      "--glyphary-accent": "#1e5f84",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#6da5bd",
      "--glyphary-border": "#d8e0e4",
      "--glyphary-border-soft": "#e5ebee",
      "--glyphary-border-strong": "#c5d0d6",
      "--glyphary-table-border": "#ccd7dc",
      "--glyphary-code-bg": "#142026",
      "--glyphary-code-text": "#eef7fb",
      "--glyphary-quote-border": "#7ca7b7",
      "--glyphary-quote-text": "#425d68",
      "--glyphary-shadow": "rgba(26, 38, 45, 0.08)",
      "--glyphary-shadow-strong": "rgba(26, 38, 45, 0.13)",
      "--syntax-blue": "#8ed6ff",
      "--syntax-green": "#9bdba8",
      "--syntax-yellow": "#f1d28e",
      "--syntax-muted": "#93a5ad",
    },
  },
  {
    id: "harbor",
    name: "Harbor",
    description: "Cool gray-blue workspace with a calm maritime accent.",
    tokens: {
      "--glyphary-app-bg": "#edf2f4",
      "--glyphary-surface": "#f9fbfc",
      "--glyphary-surface-muted": "#e7eef2",
      "--glyphary-hover": "#dfe9ee",
      "--glyphary-selection": "rgba(49, 111, 132, 0.18)",
      "--glyphary-text": "#142126",
      "--glyphary-text-soft": "#3e5159",
      "--glyphary-editor-text": "#1c2e35",
      "--glyphary-heading": "#16313a",
      "--glyphary-muted": "#63777f",
      "--glyphary-muted-strong": "#546a73",
      "--glyphary-mono-text": "#263d45",
      "--glyphary-accent": "#316f84",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#7fa9b7",
      "--glyphary-border": "#d0dce2",
      "--glyphary-border-soft": "#dde6ea",
      "--glyphary-border-strong": "#bdccd3",
      "--glyphary-table-border": "#c4d2d8",
      "--glyphary-code-bg": "#13242c",
      "--glyphary-code-text": "#eff8fb",
      "--glyphary-quote-border": "#6f9aac",
      "--glyphary-quote-text": "#3f606b",
      "--glyphary-shadow": "rgba(17, 40, 51, 0.09)",
      "--glyphary-shadow-strong": "rgba(17, 40, 51, 0.14)",
      "--syntax-blue": "#8fd9ff",
      "--syntax-green": "#92d7bd",
      "--syntax-yellow": "#f0cf8a",
      "--syntax-muted": "#8fa6af",
    },
  },
  {
    id: "moss-glass",
    name: "Moss Glass",
    description: "Soft green-gray surfaces with low-noise reading tones.",
    tokens: {
      "--glyphary-app-bg": "#eef2ec",
      "--glyphary-surface": "#fbfdf8",
      "--glyphary-surface-muted": "#e8eee4",
      "--glyphary-hover": "#dfe8dc",
      "--glyphary-selection": "rgba(76, 122, 84, 0.18)",
      "--glyphary-text": "#172119",
      "--glyphary-text-soft": "#415344",
      "--glyphary-editor-text": "#1d2b20",
      "--glyphary-heading": "#203625",
      "--glyphary-muted": "#627164",
      "--glyphary-muted-strong": "#55665a",
      "--glyphary-mono-text": "#28392d",
      "--glyphary-accent": "#4c7a54",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#86a888",
      "--glyphary-border": "#d4ded0",
      "--glyphary-border-soft": "#e1e8dd",
      "--glyphary-border-strong": "#c1cfbd",
      "--glyphary-table-border": "#cad7c6",
      "--glyphary-code-bg": "#142318",
      "--glyphary-code-text": "#eef8ee",
      "--glyphary-quote-border": "#85a776",
      "--glyphary-quote-text": "#4d6446",
      "--glyphary-shadow": "rgba(32, 45, 29, 0.08)",
      "--glyphary-shadow-strong": "rgba(32, 45, 29, 0.13)",
      "--syntax-blue": "#92d9f3",
      "--syntax-green": "#9bdb9d",
      "--syntax-yellow": "#e8d589",
      "--syntax-muted": "#90a393",
    },
  },
  {
    id: "nordic-dawn",
    name: "Nordic Dawn",
    description: "Pale cool canvas, muted coral accent, clear document text.",
    tokens: {
      "--glyphary-app-bg": "#f2f4f1",
      "--glyphary-surface": "#fffefd",
      "--glyphary-surface-muted": "#edf0ed",
      "--glyphary-hover": "#e6ecea",
      "--glyphary-selection": "rgba(157, 91, 82, 0.17)",
      "--glyphary-text": "#18201f",
      "--glyphary-text-soft": "#45524f",
      "--glyphary-editor-text": "#202927",
      "--glyphary-heading": "#263330",
      "--glyphary-muted": "#6b7774",
      "--glyphary-muted-strong": "#5c6966",
      "--glyphary-mono-text": "#2f3a38",
      "--glyphary-accent": "#9d5b52",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#b7928a",
      "--glyphary-border": "#d9dfdc",
      "--glyphary-border-soft": "#e6ebe8",
      "--glyphary-border-strong": "#cbd4d0",
      "--glyphary-table-border": "#d0d8d5",
      "--glyphary-code-bg": "#202928",
      "--glyphary-code-text": "#f3f8f6",
      "--glyphary-quote-border": "#a79f76",
      "--glyphary-quote-text": "#5e5b47",
      "--glyphary-shadow": "rgba(32, 39, 37, 0.08)",
      "--glyphary-shadow-strong": "rgba(32, 39, 37, 0.13)",
      "--syntax-blue": "#9dd7f5",
      "--syntax-green": "#a6d99a",
      "--syntax-yellow": "#ead38e",
      "--syntax-muted": "#95a4a1",
    },
  },
  {
    id: "sepia-study",
    name: "Sepia Study",
    description: "Library paper, subdued umber accent, comfortable long-form writing.",
    tokens: {
      "--glyphary-app-bg": "#f0ece2",
      "--glyphary-surface": "#fffaf0",
      "--glyphary-surface-muted": "#f5efe2",
      "--glyphary-hover": "#ece4d5",
      "--glyphary-selection": "rgba(129, 91, 47, 0.18)",
      "--glyphary-text": "#211a12",
      "--glyphary-text-soft": "#55483a",
      "--glyphary-editor-text": "#2b2116",
      "--glyphary-heading": "#3a2a18",
      "--glyphary-muted": "#786b5c",
      "--glyphary-muted-strong": "#6d5f4e",
      "--glyphary-mono-text": "#463827",
      "--glyphary-accent": "#815b2f",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#a88d68",
      "--glyphary-border": "#ded2bd",
      "--glyphary-border-soft": "#e9dfcc",
      "--glyphary-border-strong": "#d1c0a6",
      "--glyphary-table-border": "#d7c8b0",
      "--glyphary-code-bg": "#221a12",
      "--glyphary-code-text": "#fbf4e8",
      "--glyphary-quote-border": "#a78c5b",
      "--glyphary-quote-text": "#604c2e",
      "--glyphary-shadow": "rgba(49, 37, 21, 0.08)",
      "--glyphary-shadow-strong": "rgba(49, 37, 21, 0.13)",
      "--syntax-blue": "#9dccdd",
      "--syntax-green": "#accb8f",
      "--syntax-yellow": "#f0ce82",
      "--syntax-muted": "#a0917e",
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral dark graphite with sharp text and restrained amber.",
    tokens: {
      "--glyphary-app-bg": "#17191a",
      "--glyphary-surface": "#202324",
      "--glyphary-surface-muted": "#25292a",
      "--glyphary-hover": "#2e3435",
      "--glyphary-selection": "rgba(205, 151, 82, 0.2)",
      "--glyphary-text": "#edf0ed",
      "--glyphary-text-soft": "#c4cbc6",
      "--glyphary-editor-text": "#edf1ed",
      "--glyphary-heading": "#f5f2e9",
      "--glyphary-muted": "#9aa29d",
      "--glyphary-muted-strong": "#b0b8b3",
      "--glyphary-mono-text": "#d8ded9",
      "--glyphary-accent": "#cd9752",
      "--glyphary-accent-text": "#1a1208",
      "--glyphary-focus": "#d6b17d",
      "--glyphary-border": "#383e3f",
      "--glyphary-border-soft": "#303536",
      "--glyphary-border-strong": "#4b5253",
      "--glyphary-table-border": "#454c4d",
      "--glyphary-code-bg": "#101314",
      "--glyphary-code-text": "#f2f4ef",
      "--glyphary-quote-border": "#a88755",
      "--glyphary-quote-text": "#d0c2aa",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.32)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.42)",
      "--syntax-blue": "#8dcdf4",
      "--syntax-green": "#a7d79c",
      "--syntax-yellow": "#e8c87f",
      "--syntax-muted": "#8f9a95",
    },
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Deep teal-black writing surface with luminous syntax colors.",
    tokens: {
      "--glyphary-app-bg": "#11191a",
      "--glyphary-surface": "#172223",
      "--glyphary-surface-muted": "#1c292b",
      "--glyphary-hover": "#243436",
      "--glyphary-selection": "rgba(95, 161, 154, 0.22)",
      "--glyphary-text": "#e9f1ef",
      "--glyphary-text-soft": "#bed0cc",
      "--glyphary-editor-text": "#e7f2ef",
      "--glyphary-heading": "#f1f6f3",
      "--glyphary-muted": "#95aaa6",
      "--glyphary-muted-strong": "#abc0bc",
      "--glyphary-mono-text": "#d5e3df",
      "--glyphary-accent": "#5fa19a",
      "--glyphary-accent-text": "#071615",
      "--glyphary-focus": "#86c1b9",
      "--glyphary-border": "#2b3a3c",
      "--glyphary-border-soft": "#243234",
      "--glyphary-border-strong": "#415255",
      "--glyphary-table-border": "#394a4c",
      "--glyphary-code-bg": "#0b1213",
      "--glyphary-code-text": "#eff9f6",
      "--glyphary-quote-border": "#78aaa0",
      "--glyphary-quote-text": "#c1d7d2",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.34)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.46)",
      "--syntax-blue": "#86d5ff",
      "--syntax-green": "#9ce0b4",
      "--syntax-yellow": "#f0d783",
      "--syntax-muted": "#8fa5a2",
    },
  },
  {
    id: "alpine-dark",
    name: "Alpine Dark",
    description: "Cool dark mountain palette with green-blue emphasis.",
    tokens: {
      "--glyphary-app-bg": "#14191d",
      "--glyphary-surface": "#1b2227",
      "--glyphary-surface-muted": "#202a30",
      "--glyphary-hover": "#29363d",
      "--glyphary-selection": "rgba(113, 158, 139, 0.22)",
      "--glyphary-text": "#edf2f0",
      "--glyphary-text-soft": "#c2ceca",
      "--glyphary-editor-text": "#e7efec",
      "--glyphary-heading": "#f0f6f3",
      "--glyphary-muted": "#98a9a4",
      "--glyphary-muted-strong": "#adbbb7",
      "--glyphary-mono-text": "#d8e2df",
      "--glyphary-accent": "#719e8b",
      "--glyphary-accent-text": "#071310",
      "--glyphary-focus": "#95bba9",
      "--glyphary-border": "#313d43",
      "--glyphary-border-soft": "#2a353b",
      "--glyphary-border-strong": "#47545a",
      "--glyphary-table-border": "#3d4a50",
      "--glyphary-code-bg": "#0e1417",
      "--glyphary-code-text": "#f0f7f4",
      "--glyphary-quote-border": "#89a871",
      "--glyphary-quote-text": "#cdd8c5",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.33)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.45)",
      "--syntax-blue": "#8dcfff",
      "--syntax-green": "#a8d99e",
      "--syntax-yellow": "#ead17e",
      "--syntax-muted": "#93a4a0",
    },
  },
  {
    id: "plum-ledger",
    name: "Plum Ledger",
    description: "Charcoal base with plum accent and accountant-clean contrast.",
    tokens: {
      "--glyphary-app-bg": "#19181d",
      "--glyphary-surface": "#222128",
      "--glyphary-surface-muted": "#282631",
      "--glyphary-hover": "#332f3d",
      "--glyphary-selection": "rgba(153, 113, 142, 0.22)",
      "--glyphary-text": "#f0edf1",
      "--glyphary-text-soft": "#cec6d0",
      "--glyphary-editor-text": "#f0edf2",
      "--glyphary-heading": "#f8f1f5",
      "--glyphary-muted": "#a49aa6",
      "--glyphary-muted-strong": "#b9afbb",
      "--glyphary-mono-text": "#ded6e0",
      "--glyphary-accent": "#99718e",
      "--glyphary-accent-text": "#160d13",
      "--glyphary-focus": "#b797ad",
      "--glyphary-border": "#3b3842",
      "--glyphary-border-soft": "#332f39",
      "--glyphary-border-strong": "#514c59",
      "--glyphary-table-border": "#48434f",
      "--glyphary-code-bg": "#121116",
      "--glyphary-code-text": "#f6f1f5",
      "--glyphary-quote-border": "#9d8bba",
      "--glyphary-quote-text": "#d4c8db",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.34)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.46)",
      "--syntax-blue": "#9bcfff",
      "--syntax-green": "#a9d7a3",
      "--syntax-yellow": "#ead08a",
      "--syntax-muted": "#9f96a2",
    },
  },
  {
    id: "slate-rose",
    name: "Slate Rose",
    description: "Pale slate UI with a dried-rose accent and soft borders.",
    tokens: {
      "--glyphary-app-bg": "#f1f2f3",
      "--glyphary-surface": "#fffdfd",
      "--glyphary-surface-muted": "#ebeef0",
      "--glyphary-hover": "#e4e9eb",
      "--glyphary-selection": "rgba(154, 87, 96, 0.16)",
      "--glyphary-text": "#1d2022",
      "--glyphary-text-soft": "#4b5357",
      "--glyphary-editor-text": "#252a2d",
      "--glyphary-heading": "#2c3134",
      "--glyphary-muted": "#6c7478",
      "--glyphary-muted-strong": "#5e666b",
      "--glyphary-mono-text": "#343d41",
      "--glyphary-accent": "#9a5760",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#b98d93",
      "--glyphary-border": "#d9dee1",
      "--glyphary-border-soft": "#e6eaec",
      "--glyphary-border-strong": "#cbd2d6",
      "--glyphary-table-border": "#d1d7da",
      "--glyphary-code-bg": "#202326",
      "--glyphary-code-text": "#f4f6f6",
      "--glyphary-quote-border": "#9b9a72",
      "--glyphary-quote-text": "#5b5b45",
      "--glyphary-shadow": "rgba(32, 38, 42, 0.08)",
      "--glyphary-shadow-strong": "rgba(32, 38, 42, 0.13)",
      "--syntax-blue": "#8ed2f4",
      "--syntax-green": "#a4d69c",
      "--syntax-yellow": "#e9d084",
      "--syntax-muted": "#96a0a4",
    },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    description: "Technical blue-gray dark mode with diagram-clean contrast.",
    tokens: {
      "--glyphary-app-bg": "#121821",
      "--glyphary-surface": "#182231",
      "--glyphary-surface-muted": "#1d2b3c",
      "--glyphary-hover": "#26384d",
      "--glyphary-selection": "rgba(86, 142, 186, 0.24)",
      "--glyphary-text": "#edf3f8",
      "--glyphary-text-soft": "#c2cfda",
      "--glyphary-editor-text": "#eaf2f8",
      "--glyphary-heading": "#f5f9fc",
      "--glyphary-muted": "#96a8b7",
      "--glyphary-muted-strong": "#adbdca",
      "--glyphary-mono-text": "#d8e4ee",
      "--glyphary-accent": "#568eba",
      "--glyphary-accent-text": "#07121a",
      "--glyphary-focus": "#83b0d1",
      "--glyphary-border": "#2d3d50",
      "--glyphary-border-soft": "#263548",
      "--glyphary-border-strong": "#43566d",
      "--glyphary-table-border": "#394d63",
      "--glyphary-code-bg": "#0c1118",
      "--glyphary-code-text": "#eff7fd",
      "--glyphary-quote-border": "#75a2c6",
      "--glyphary-quote-text": "#c8d8e4",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.34)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.46)",
      "--syntax-blue": "#8ed5ff",
      "--syntax-green": "#9edaa7",
      "--syntax-yellow": "#efd17e",
      "--syntax-muted": "#8ea2b1",
    },
  },
];

for (const preset of themePresets) {
  preset.tokens = {
    ...defaultThemeLevelOneTokens,
    ...preset.tokens,
  };
}

export function normalizeThemeTokens(tokens: Record<string, string> | undefined | null) {
  const normalized: Record<string, string> = {};

  for (const [token, value] of Object.entries(tokens ?? {})) {
    const cleanValue = value.trim();

    // Ignore unknown CSS variables from .glyphary so imported or hand-edited
    // settings cannot unexpectedly restyle arbitrary parts of the app.
    if (editableThemeTokens.has(token) && cleanValue) {
      normalized[token] = cleanValue;
    }
  }

  return normalized;
}

export function normalizeThemePresetId(presetId: string | undefined | null) {
  const cleanPresetId = presetId?.trim() ?? "";

  return themePresets.some((preset) => preset.id === cleanPresetId) ? cleanPresetId : null;
}

export function normalizeCalloutStyle(style: string | undefined | null): CalloutStyle {
  return calloutStyleOptions.find((option) => option.value === style)?.value ?? "plain";
}

export function normalizeCalloutIcon(
  icon: string | undefined | null,
  fallback: CalloutIconName,
): CalloutIconName {
  return calloutIconOptions.find((option) => option.value === icon)?.value ?? fallback;
}

export function normalizeThemeCalloutSettings(
  callouts: VaultThemeCalloutSettings | undefined | null,
) {
  return {
    style: normalizeCalloutStyle(callouts?.style),
    icons: {
      note: normalizeCalloutIcon(callouts?.icons?.note, defaultThemeCalloutSettings.icons.note),
      info: normalizeCalloutIcon(callouts?.icons?.info, defaultThemeCalloutSettings.icons.info),
      tip: normalizeCalloutIcon(callouts?.icons?.tip, defaultThemeCalloutSettings.icons.tip),
      warning: normalizeCalloutIcon(
        callouts?.icons?.warning,
        defaultThemeCalloutSettings.icons.warning,
      ),
    },
  };
}

export function sameThemeCalloutSettings(
  left: VaultThemeCalloutSettings | undefined | null,
  right: VaultThemeCalloutSettings | undefined | null,
) {
  const normalizedLeft = normalizeThemeCalloutSettings(left);
  const normalizedRight = normalizeThemeCalloutSettings(right);

  return (
    normalizedLeft.style === normalizedRight.style &&
    calloutKinds.every(
      ({ value }) => normalizedLeft.icons[value] === normalizedRight.icons[value],
    )
  );
}

export function calloutIconGlyph(icon: CalloutIconName) {
  return calloutIconOptions.find((option) => option.value === icon)?.glyph ?? "";
}

export function normalizeThemeOptions(options: VaultThemeOptions | undefined | null) {
  return {
    colorfulHeadings: options?.colorfulHeadings ?? defaultThemeOptions.colorfulHeadings,
    headingUnderlines: options?.headingUnderlines ?? defaultThemeOptions.headingUnderlines,
    headingAnchors: options?.headingAnchors ?? defaultThemeOptions.headingAnchors,
    richCallouts: options?.richCallouts ?? defaultThemeOptions.richCallouts,
  };
}

export function sameThemeOptions(
  left: VaultThemeOptions | undefined | null,
  right: VaultThemeOptions | undefined | null,
) {
  const normalizedLeft = normalizeThemeOptions(left);
  const normalizedRight = normalizeThemeOptions(right);

  return (
    normalizedLeft.colorfulHeadings === normalizedRight.colorfulHeadings &&
    normalizedLeft.headingUnderlines === normalizedRight.headingUnderlines &&
    normalizedLeft.headingAnchors === normalizedRight.headingAnchors &&
    normalizedLeft.richCallouts === normalizedRight.richCallouts
  );
}

export function sameThemeTokens(
  left: Record<string, string> | undefined | null,
  right: Record<string, string> | undefined | null,
) {
  const normalizedLeft = normalizeThemeTokens(left);
  const normalizedRight = normalizeThemeTokens(right);
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && normalizedLeft[key] === normalizedRight[key])
  );
}
