export type SessionJwtPayload = {
  sub: string;
  email: string;
  role: 'operator' | 'viewer';
  jti: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: 'operator' | 'viewer';
};
