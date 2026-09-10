'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from './client';
import { useSession } from '@/components/shared/session';

const SocketContext = createContext<Socket | null>(null);

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user?.email) {
      disconnectSocket();
      setSocket(null);
      return;
    }
    const s = getSocket(user.email);
    s.connect();
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.email]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
