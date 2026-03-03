export type SshAccessOption = {
  id: 'guided_link' | 'direct_terminal';
  label: string;
  summary: string;
  tradeoff: string;
  recommended: boolean;
};

export const SSH_ACCESS_OPTIONS: SshAccessOption[] = [
  {
    id: 'guided_link',
    label: 'Guided Link',
    summary: 'Issue a short-lived command from ARIS with audit trail and expiry.',
    tradeoff: 'Safer default. Slightly slower because it requires issuance per session.',
    recommended: true,
  },
  {
    id: 'direct_terminal',
    label: 'Direct Terminal',
    summary: 'Use your own SSH client directly for exceptional troubleshooting.',
    tradeoff: 'Faster for experts, but requires stricter manual discipline.',
    recommended: false,
  },
];
