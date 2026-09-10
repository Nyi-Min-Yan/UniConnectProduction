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

    socket.on('join', (room: string) => {
      socket.join(room);
    });

    socket.on('leave', (room: string) => {
      socket.leave(room);
    });

    socket.on('presence:update', (data: { online: boolean; last_seen: number }) => {
      if (email) {
        io.to('presence:subscribers').emit(WS_EVENTS.PRESENCE_UPDATE, { email, ...data });
      }
    });

    socket.on('typing:start', (data: { conversationId: string }) => {
      if (email) {
        socket.to(`conversation:${data.conversationId}`).emit('typing:start', { conversationId: data.conversationId, userEmail: email });
      }
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      if (email) {
        socket.to(`conversation:${data.conversationId}`).emit('typing:stop', { conversationId: data.conversationId, userEmail: email });
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
