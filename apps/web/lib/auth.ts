import { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';
import { authApi } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

// Access token refresh buffer: refresh 1 minute before expiry
const REFRESH_BUFFER_MS = 60_000;
// Access token lifetime (should be slightly less than backend JWT_EXPIRATION of 15m)
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000;

// Server-side refresh deduplication: only one refresh request at a time
let refreshPromise: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;
// Cooldown after a failed refresh to prevent immediate retry storms
let refreshCooldownUntil = 0;
const REFRESH_COOLDOWN_MS = 30_000; // 30 seconds cooldown after failure

async function refreshAccessToken(token: JWT): Promise<JWT> {
  // If we're in cooldown after a failed refresh, don't retry
  if (Date.now() < refreshCooldownUntil) {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }

  // Deduplicate: if a refresh is already in flight, wait for it
  if (!refreshPromise) {
    refreshPromise = doRefresh(token.refreshToken);
  }

  try {
    const result = await refreshPromise;
    if (result) {
      return {
        ...token,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
        error: undefined,
      };
    }
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  } finally {
    refreshPromise = null;
  }
}

async function doRefresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const { tokens } = response.data;
    return tokens;
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    // Set cooldown to prevent immediate retry storm
    refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS;
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await authApi.login(credentials.email, credentials.password);
          const { user, organization, tokens } = response.data;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            firstName: user.name?.split(' ')[0] || '',
            lastName: user.name?.split(' ').slice(1).join(' ') || '',
            organizationId: user.organizationId,
            organizationName: organization.name,
            role: user.role,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          };
        } catch (error) {
          console.error('Login error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in: populate all fields
      if (user) {
        return {
          ...token,
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          organizationId: user.organizationId,
          role: user.role,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
          error: undefined,
        };
      }

      // Token is still valid (with buffer) — return as-is
      if (
        token.accessTokenExpires &&
        Date.now() < (token.accessTokenExpires as number) - REFRESH_BUFFER_MS
      ) {
        return token;
      }

      // Access token expired or about to expire — refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.organizationId = token.organizationId as string;
      session.user.role = token.role as any;
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;

      if (token.error) {
        session.error = token.error as string;
      }

      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      firstName: string;
      lastName: string;
      organizationId: string;
      role: any;
    };
    accessToken: string;
    refreshToken: string;
    error?: string;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    role: any;
    accessToken: string;
    refreshToken: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    role: any;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires?: number;
    error?: string;
  }
}
