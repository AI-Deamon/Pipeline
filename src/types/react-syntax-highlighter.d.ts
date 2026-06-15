declare module 'react-syntax-highlighter' {
  import type { ComponentType, ReactNode } from 'react';

  export type SyntaxHighlighterProps = {
    language?: string;
    style?: Record<string, React.CSSProperties>;
    showLineNumbers?: boolean;
    startingLineNumber?: number;
    wrapLines?: boolean;
    lineNumberStyle?: React.CSSProperties;
    lineProps?: ((lineNumber: number) => React.HTMLAttributes<HTMLElement>) | React.HTMLAttributes<HTMLElement>;
    customStyle?: React.CSSProperties;
    children?: ReactNode;
  };

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>;
  export { SyntaxHighlighter as Prism };
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  const vscDarkPlus: Record<string, React.CSSProperties>;
  export { vscDarkPlus };
  export default vscDarkPlus;
}
