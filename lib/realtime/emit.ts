import { getIO } from './io';
import { WS_EVENTS } from './events';

let ioReady = false;

function ensureIO() {
  if (ioReady) return;
  const io = getIO();
  if (io) {
    ioReady = true;
  }
  return io;
}

export const ws = {
  post: {
    created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_CREATED, data); },
    updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_UPDATED, data); },
    deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_DELETED, data); },
    like: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_LIKE, data); },
    unlike: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_UNLIKE, data); },
    comment: {
      created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_COMMENT_CREATED, data); },
      updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_COMMENT_UPDATED, data); },
      deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_COMMENT_DELETED, data); },
    },
    share: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.POST_SHARE, data); },
  },
  activity: {
    created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_CREATED, data); },
    updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_UPDATED, data); },
    deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_DELETED, data); },
    like: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_LIKE, data); },
    unlike: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_UNLIKE, data); },
    comment: {
      created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_COMMENT_CREATED, data); },
      updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_COMMENT_UPDATED, data); },
      deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_COMMENT_DELETED, data); },
    },
    share: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.ACTIVITY_SHARE, data); },
  },
  conversation: {
    created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.CONVERSATION_CREATED, data); },
    updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.CONVERSATION_UPDATED, data); },
  },
  message: {
    created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.MESSAGE_CREATED, data); },
    updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.MESSAGE_UPDATED, data); },
    deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.MESSAGE_DELETED, data); },
    read: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.MESSAGE_READ, data); },
  },
  notification: {
    created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.NOTIFICATION_CREATED, data); },
    updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.NOTIFICATION_UPDATED, data); },
    deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.NOTIFICATION_DELETED, data); },
  },
  event: {
    created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EVENT_CREATED, data); },
    updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EVENT_UPDATED, data); },
    deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EVENT_DELETED, data); },
    registered: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EVENT_REGISTRATION, data); },
    unregistered: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EVENT_UNREGISTRATION, data); },
  },
  exam: {
    batch: {
      created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EXAM_RESULT_BATCH_CREATED, data); },
      updated: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EXAM_RESULT_BATCH_UPDATED, data); },
      deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EXAM_RESULT_BATCH_DELETED, data); },
      published: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EXAM_RESULT_BATCH_PUBLISHED, data); },
    },
    result: {
      created: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EXAM_RESULT_CREATED, data); },
      deleted: (data: unknown) => { ensureIO()?.emit(WS_EVENTS.EXAM_RESULT_DELETED, data); },
    },
  },
};
