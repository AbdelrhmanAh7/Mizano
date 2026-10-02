import { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';
import { createTokenRefresher, type RefreshedTokens } from './auth-refresh';

// Server-side API URL: prefer internal Docker network URL, fallback to public URL
// API_INTERNAL_URL is NOT a NEXT_PUBLIC_ var, so it's always read at runtime (not inlined at build)
const API_BASE_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

// Access token refresh buffer: refresh 1 minute before expiry
const REFRESH_BUFFER_MS = 60_000;
// Access token lifetime (should be slightly less than backend JWT_EXPIRATION of 15m)
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000;

// Cooldown after a failed refresh to prevent immediate retry storms (per session)
const REFRESH_COOLDOWN_MS = 30_000;

/** Secret-free description of an auth API failure, safe to log. */
function describeAuthError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response ? `HTTP ${error.response.status}` : (error.code ?? 'network error');
  }
  return error instanceof Error ? error.name : 'unknown error';
}

export async function requestTokenRefresh(refreshToken: string): Promise<RefreshedTokens | null> {
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

    const tokens = (response.data as { tokens?: Partial<RefreshedTokens> } | undefined)?.tokens;
    if (!tokens?.accessToken || !tokens.refreshToken) {
      console.error('Failed to refresh access token: malformed response');
      return null;
    }
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  } catch (error) {
    // Never log the raw error: axios errors carry the request config, including
    // the Authorization header and the body containing the refresh token.
    console.error(`Failed to refresh access token: ${describeAuthError(error)}`);
    return null;
  }
}

// Single-flight and cooldown state is keyed per session (SHA-256 of that
// session's refresh token), so concurrent users never share results or failures.
export const tokenRefresher = createTokenRefresher({
  refresh: requestTokenRefresh,
  cooldownMs: REFRESH_COOLDOWN_MS,
});

export async function refreshAccessToken(token: JWT): Promise<JWT> {
  const result = await tokenRefresher.refresh(token.refreshToken);
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
          const response = await axios.post(`${API_BASE_URL}/auth/login`, {
            email: credentials.email,
            password: credentials.password,
          });
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
          // Raw axios errors include the request body (credentials); log a safe summary.
          console.error(`Login error: ${describeAuthError(error)}`);
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
      session.user.role = token.role as string;
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;

      if (token.error) {
        session.error = token.error as string;
      }

      return session;
    },
  },
  events: {
    // Revoke API refresh tokens best-effort, then clear this session's local state.
    async signOut({ token }) {
      try {
        let accessToken = token?.accessToken;
        // signOut receives the raw JWT without running the jwt callback first.
        if (
          token &&
          (!token.accessTokenExpires || Date.now() >= token.accessTokenExpires - REFRESH_BUFFER_MS)
        ) {
          const refreshed = await tokenRefresher.refresh(token.refreshToken);
          if (!refreshed) return;
          accessToken = refreshed.accessToken;
        }
        if (accessToken) {
          await axios.post(`${API_BASE_URL}/auth/logout`, undefined, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 3_000,
          });
        }
      } catch (error) {
        console.error(`Logout error: ${describeAuthError(error)}`);
      } finally {
        tokenRefresher.forget(token?.refreshToken);
      }
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
      role: string;
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
    role: string;
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
    role: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires?: number;
    error?: string;
  }
}
