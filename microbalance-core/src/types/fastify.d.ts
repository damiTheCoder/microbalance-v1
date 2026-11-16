import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Active Better Auth organization (= Company) for this request. */
    companyId?: string;
    /** Better Auth user for this request (audit actor). */
    userId?: string;
  }
}
