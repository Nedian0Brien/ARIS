'use client';

import React from 'react';
import styles from '../../../ChatInterface.module.css';
import { MarkdownContent } from './MarkdownContent';

export function TextReply({ body, isUser }: { body: string; isUser: boolean }) {
  const normalized = body.trim();
  if (!normalized) {
    return null;
  }

  return (
    <div className={isUser ? styles.userText : styles.agentText}>
      <MarkdownContent body={normalized} />
    </div>
  );
}
