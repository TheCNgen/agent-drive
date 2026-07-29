'use client';
import { useState } from 'react';
import { MdContentCopy, MdCheck } from 'react-icons/md';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export default function CopyButton({ text, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback is handled in higher level components if needed, or silently fails
      // Note: A toast might be better, but keeping it simple for now
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1 \${className}`}
      title="Copy to clipboard"
    >
      {copied ? <MdCheck className="text-green-600" /> : <MdContentCopy />}
      {copied && <span className="text-xs text-green-600 font-freeman">Copied</span>}
    </button>
  );
}
