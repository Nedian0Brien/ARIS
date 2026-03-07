'use client';

import PrismLight from 'react-syntax-highlighter/dist/cjs/prism-light';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import tsx from 'react-syntax-highlighter/dist/cjs/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/cjs/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/cjs/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json';
import css from 'react-syntax-highlighter/dist/cjs/languages/prism/css';
import yaml from 'react-syntax-highlighter/dist/cjs/languages/prism/yaml';
import markdown from 'react-syntax-highlighter/dist/cjs/languages/prism/markdown';

PrismLight.registerLanguage('tsx', tsx);
PrismLight.registerLanguage('typescript', typescript);
PrismLight.registerLanguage('ts', typescript);
PrismLight.registerLanguage('javascript', javascript);
PrismLight.registerLanguage('js', javascript);
PrismLight.registerLanguage('jsx', javascript);
PrismLight.registerLanguage('python', python);
PrismLight.registerLanguage('py', python);
PrismLight.registerLanguage('bash', bash);
PrismLight.registerLanguage('sh', bash);
PrismLight.registerLanguage('json', json);
PrismLight.registerLanguage('css', css);
PrismLight.registerLanguage('yaml', yaml);
PrismLight.registerLanguage('yml', yaml);
PrismLight.registerLanguage('markdown', markdown);
PrismLight.registerLanguage('md', markdown);

interface Props {
  language: string;
  children: string;
  customStyle?: React.CSSProperties;
  wrapLongLines?: boolean;
  PreTag?: React.ElementType;
}

export function CodeHighlighter({ language, children, customStyle, wrapLongLines, PreTag }: Props) {
  return (
    <PrismLight
      language={language}
      style={oneDark}
      customStyle={customStyle}
      wrapLongLines={wrapLongLines}
      PreTag={PreTag}
    >
      {children}
    </PrismLight>
  );
}
