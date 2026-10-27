import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./markdown.module.css";

const plugins = [remarkGfm];
const components: Components = {
  table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
  // Model-supplied images remain explicit links instead of fetching automatically.
  img: ({ src, alt }) => <a href={src}>{alt || "Image"}</a>,
};

export const ChatMarkdown = memo(function ChatMarkdown({ children }: { children: string }) {
  return <div className={styles.content}>
    <Markdown remarkPlugins={plugins} components={components} skipHtml>{children}</Markdown>
  </div>;
});
