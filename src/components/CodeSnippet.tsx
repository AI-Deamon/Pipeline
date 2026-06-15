import { memo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ExternalLink, Loader2, AlertCircle, FileCode } from 'lucide-react';

type CodeSnippetProps = {
  snippet?: string | null;
  language?: string;
  highlightLine?: number | null;
  startLine?: number;
  file?: string;
  gitUrl?: string | null;
  isLoading?: boolean;
  error?: string | null;
};

const CodeSnippet = memo(function CodeSnippet({
  snippet,
  language = 'text',
  highlightLine,
  startLine = 1,
  file,
  gitUrl,
  isLoading,
  error,
}: CodeSnippetProps) {
  if (isLoading) {
    return (
      <div className="border border-slate-200 rounded-lg p-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Loading code...
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 flex items-center gap-2 text-sm text-red-700">
        <AlertCircle size={14} /> Failed to load code: {error}
      </div>
    );
  }
  if (!snippet) {
    return (
      <div className="border border-dashed border-slate-200 rounded-lg p-4 flex items-center gap-2 text-sm text-slate-400">
        <FileCode size={14} /> No code snippet available
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {file && (
        <div className="bg-slate-100 px-3 py-2 flex items-center justify-between text-xs">
          <span className="font-mono text-slate-600 truncate">{file}</span>
          {gitUrl && (
            <a
              href={gitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline shrink-0 ml-2"
            >
              View on GitHub <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        showLineNumbers
        startingLineNumber={startLine}
        wrapLines
        lineNumberStyle={{ color: '#64748b', minWidth: '2.5em' }}
        lineProps={(lineNumber: number) => ({
          style: {
            background:
              lineNumber === highlightLine ? 'rgba(239, 68, 68, 0.2)' : undefined,
            borderLeft:
              lineNumber === highlightLine ? '3px solid #ef4444' : undefined,
          },
        })}
        customStyle={{ margin: 0, fontSize: '12px' }}
      >
        {snippet}
      </SyntaxHighlighter>
    </div>
  );
});

export default CodeSnippet;
