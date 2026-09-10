'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(email?: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    if (email && (socket.auth as Record<string, string>).email !== email) {
      socket.disconnect();
      socket = null;
    } else {
      return socket;
    }
  }
  socket = io({
    path: '/api/socketio',
    auth: { email },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 20000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
