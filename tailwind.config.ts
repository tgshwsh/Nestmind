import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "calendar-dot": "hsl(var(--calendar-dot))",
        "detail-bg": "hsl(var(--resource-detail-bg))",
        "detail-card": "hsl(var(--resource-detail-card))",
        "detail-primary": "hsl(var(--resource-detail-primary))",
        "detail-primary-foreground": "hsl(var(--resource-detail-primary-foreground))",
        "detail-border": "hsl(var(--resource-detail-border))",
        "detail-muted": "hsl(var(--resource-detail-muted))",
        "detail-muted-foreground": "hsl(var(--resource-detail-muted-foreground))",
      },
      fontFamily: {
        sans: "var(--font-geist-sans), system-ui, -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Helvetica Neue\", Arial, sans-serif",
        mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        display: "var(--font-display), \"Playfair Display\", \"Times New Roman\", serif",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 0.25rem)",
        sm: "calc(var(--radius) - 0.5rem)",
      },
    },
  },
  plugins: [],
};

export default config;

