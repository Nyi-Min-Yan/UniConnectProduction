'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from './context';
import { WS_EVENTS } from './events';

type WsCallback<T = unknown> = (data: T) => void;

interface WsEventMap {
  [WS_EVENTS.POST_CREATED]: WsCallback;
  [WS_EVENTS.POST_UPDATED]: WsCallback;
  [WS_EVENTS.POST_DELETED]: WsCallback<{ id: string }>;
  [WS_EVENTS.POST_LIKE]: WsCallback<{ post_id: string; user_email: string }>;
  [WS_EVENTS.POST_UNLIKE]: WsCallback<{ post_id: string; user_email: string }>;
  [WS_EVENTS.POST_COMMENT_CREATED]: WsCallback;
  [WS_EVENTS.POST_COMMENT_UPDATED]: WsCallback;
  [WS_EVENTS.POST_COMMENT_DELETED]: WsCallback;
  [WS_EVENTS.POST_SHARE]: WsCallback;
  [WS_EVENTS.ACTIVITY_CREATED]: WsCallback;
  [WS_EVENTS.ACTIVITY_UPDATED]: WsCallback;
  [WS_EVENTS.ACTIVITY_DELETED]: WsCallback<{ id: string }>;
  [WS_EVENTS.ACTIVITY_LIKE]: WsCallback;
  [WS_EVENTS.ACTIVITY_UNLIKE]: WsCallback;
  [WS_EVENTS.ACTIVITY_COMMENT_CREATED]: WsCallback;
  [WS_EVENTS.ACTIVITY_COMMENT_UPDATED]: WsCallback;
  [WS_EVENTS.ACTIVITY_COMMENT_DELETED]: WsCallback;
  [WS_EVENTS.ACTIVITY_SHARE]: WsCallback;
  [WS_EVENTS.CONVERSATION_CREATED]: WsCallback;
  [WS_EVENTS.CONVERSATION_UPDATED]: WsCallback;
  [WS_EVENTS.MESSAGE_CREATED]: WsCallback;
  [WS_EVENTS.MESSAGE_UPDATED]: WsCallback;
  [WS_EVENTS.MESSAGE_DELETED]: WsCallback;
  [WS_EVENTS.MESSAGE_READ]: WsCallback;
  [WS_EVENTS.NOTIFICATION_CREATED]: WsCallback;
  [WS_EVENTS.NOTIFICATION_UPDATED]: WsCallback;
  [WS_EVENTS.NOTIFICATION_DELETED]: WsCallback;
  [WS_EVENTS.EVENT_CREATED]: WsCallback;
  [WS_EVENTS.EVENT_UPDATED]: WsCallback;
  [WS_EVENTS.EVENT_DELETED]: WsCallback;
  [WS_EVENTS.EVENT_REGISTRATION]: WsCallback;
  [WS_EVENTS.EVENT_UNREGISTRATION]: WsCallback;
  [WS_EVENTS.EXAM_RESULT_BATCH_CREATED]: WsCallback;
  [WS_EVENTS.EXAM_RESULT_BATCH_UPDATED]: WsCallback;
  [WS_EVENTS.EXAM_RESULT_BATCH_DELETED]: WsCallback;
  [WS_EVENTS.EXAM_RESULT_BATCH_PUBLISHED]: WsCallback;
  [WS_EVENTS.EXAM_RESULT_CREATED]: WsCallback;
  [WS_EVENTS.EXAM_RESULT_DELETED]: WsCallback;
}

export function useWsEvents(handlers: Partial<WsEventMap>) {
  const socket = useSocket();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!socket) return;

    const cleanups: (() => void)[] = [];

    for (const event of Object.values(WS_EVENTS)) {
      const handler = handlersRef.current[event as keyof WsEventMap];
      if (!handler) continue;
      const listener = (data: unknown) => handler(data as any);
      socket.on(event, listener);
      cleanups.push(() => socket.off(event, listener));
    }

    return () => { cleanups.forEach((fn) => fn()); };
  }, [socket]);
}

export function useWsListener<T>(event: string, callback: WsCallback<T>) {
  const socket = useSocket();
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!socket) return;
    const listener = (data: unknown) => cbRef.current(data as T);
    socket.on(event, listener);
    return () => { socket.off(event, listener); };
  }, [socket, event]);
}
