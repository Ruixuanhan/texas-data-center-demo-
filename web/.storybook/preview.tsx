import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: { disable: true },
  },
  decorators: [
    (Story) => (
      <div style={{ background: "var(--bg)", padding: "2rem", minWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
