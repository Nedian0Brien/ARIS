import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireBearerToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token !== expectedToken) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
