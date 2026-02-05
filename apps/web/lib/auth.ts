import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authApi } from './api';

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
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.organizationId = user.organizationId;
        token.role = user.role;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.organizationId = token.organizationId as string;
      session.user.role = token.role as any;
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
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
  }
}
