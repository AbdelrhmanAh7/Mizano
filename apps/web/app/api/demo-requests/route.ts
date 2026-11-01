import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIp = request.ip;
    const incomingForwarded = request.headers.get('x-forwarded-for');
    const forwarded = clientIp
      ? incomingForwarded
        ? `${incomingForwarded}, ${clientIp}`
        : clientIp
      : incomingForwarded || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (forwarded) {
      headers['x-forwarded-for'] = forwarded;
    }

    const res = await fetch(`${API_BASE_URL}/demo-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Failed to connect to backend' },
      { status: 500 },
    );
  }
}
