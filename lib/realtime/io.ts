import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { WS_EVENTS } from './events';

const globalForIO = globalThis as unknown as { __uniconnectIO?: Server };

export function getIO(): Server | null {
  return globalForIO.__uniconnectIO ?? null;
}

export function initIO(httpServer: HTTPServer): Server {
  if (globalForIO.__uniconnectIO) return globalForIO.__uniconnectIO;
  const io = new Server(httpServer, {
    path: '/api/socketio',
    cors: { origin: '*', methods: ['GET', 'POST'] },
    addTrailingSlash: false,
  });
  globalForIO.__uniconnectIO = io;

  io.on('connection', (socket) => {
    const email = socket.handshake.auth?.email as string | undefined;
    if (email) {
      socket.join(`user:${email}`);
      socket.join('presence:subscribers');
    }

    const isValidConversationId = (id: unknown): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);

    socket.on('join', (room: unknown) => {
      if (typeof room === 'string' && /^conversation:[a-zA-Z0-9_-]{1,128}$/.test(room)) {
        socket.join(room);
      }
    });

    socket.on('leave', (room: unknown) => {
      if (typeof room === 'string' && /^conversation:[a-zA-Z0-9_-]{1,128}$/.test(room)) {
        socket.leave(room);
      }
    });

    socket.on('presence:update', (data: unknown) => {
      if (email && typeof data === 'object' && data !== null) {
        const { online, last_seen } = data as Record<string, unknown>;
        if (typeof online === 'boolean' && typeof last_seen === 'number') {
          io.to('presence:subscribers').emit(WS_EVENTS.PRESENCE_UPDATE, { email, online, last_seen });
        }
      }
    });

    socket.on('typing:start', (data: unknown) => {
      if (email && typeof data === 'object' && data !== null && isValidConversationId((data as Record<string, unknown>).conversationId)) {
        const { conversationId } = data as { conversationId: string };
        socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userEmail: email });
      }
    });

    socket.on('typing:stop', (data: unknown) => {
      if (email && typeof data === 'object' && data !== null && isValidConversationId((data as Record<string, unknown>).conversationId)) {
        const { conversationId } = data as { conversationId: string };
        socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userEmail: email });
      }
    });

    socket.on('disconnect', () => {
      if (email) {
        const now = Math.floor(Date.now() / 1000);
        io.to('presence:subscribers').emit(WS_EVENTS.PRESENCE_UPDATE, { email, online: false, last_seen: now });
      }
    });
  });

  return io;
}

export function emitToRoom(room: string, event: string, data: unknown) {
  globalForIO.__uniconnectIO?.to(room).emit(event, data);
}

export function emitToUser(email: string, event: string, data: unknown) {
  globalForIO.__uniconnectIO?.to(`user:${email}`).emit(event, data);
}

export function broadcast(event: string, data: unknown) {
  globalForIO.__uniconnectIO?.emit(event, data);
}
