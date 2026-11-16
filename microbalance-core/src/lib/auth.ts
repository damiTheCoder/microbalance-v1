import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';
import { prisma } from './prisma.js'
import { provisionCompany } from './provision.js';

/**
 * Self-hosted Better Auth.
 *
 * Google is the only sign-in method: `emailAndPassword` is intentionally never
 * configured, so no password hashes are ever stored.
 *
 * Multi-tenancy: the organization plugin is pointed at our existing `Company`
 * table so an organization *is* a company. `Member` and `Invitation` reuse the
 * same `companyId` foreign key convention as the rest of the ERP schema.
 */
export const auth = betterAuth({
  // Dynamic base URL: the UI may be opened on localhost or 127.0.0.1, and the
  // OAuth redirect_uri must match the host the browser is actually using.
  baseURL: {
    allowedHosts: ['localhost:3001', '127.0.0.1:3001', 'localhost:3080', '127.0.0.1:3080'],
    protocol: 'http',
    fallback: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  },
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'sqlite' }),

  account: {
    modelName: 'authAccount',
    // OAuth state lives in the Verification table, not a cookie: avoids
    // host/port cookie mismatches between the UI and the core API.
    storeStateStrategy: 'database',
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  trustedOrigins: [
    'http://localhost:3080',
    'http://127.0.0.1:3080',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ],

  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      schema: {
        // The ERP already has a `Company` table: an organization *is* a company.
        organization: { modelName: 'company' },
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization }) => {
          await provisionCompany(organization.id)
        },
      },
    }),
  ],
});

export type Auth = typeof auth;
