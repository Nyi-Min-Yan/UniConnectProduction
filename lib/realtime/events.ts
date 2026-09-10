export const WS_EVENTS = {
  // Posts
  POST_CREATED: 'post:created',
  POST_UPDATED: 'post:updated',
  POST_DELETED: 'post:deleted',
  POST_LIKE: 'post:like',
  POST_UNLIKE: 'post:unlike',
  POST_COMMENT_CREATED: 'post:comment:created',
  POST_COMMENT_UPDATED: 'post:comment:updated',
  POST_COMMENT_DELETED: 'post:comment:deleted',
  POST_SHARE: 'post:share',

  // Activities
  ACTIVITY_CREATED: 'activity:created',
  ACTIVITY_UPDATED: 'activity:updated',
  ACTIVITY_DELETED: 'activity:deleted',
  ACTIVITY_LIKE: 'activity:like',
  ACTIVITY_UNLIKE: 'activity:unlike',
  ACTIVITY_COMMENT_CREATED: 'activity:comment:created',
  ACTIVITY_COMMENT_UPDATED: 'activity:comment:updated',
  ACTIVITY_COMMENT_DELETED: 'activity:comment:deleted',
  ACTIVITY_SHARE: 'activity:share',

  // Messaging
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_READ: 'message:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Notifications
  NOTIFICATION_CREATED: 'notification:created',
  NOTIFICATION_UPDATED: 'notification:updated',
  NOTIFICATION_DELETED: 'notification:deleted',

  // Events
  EVENT_CREATED: 'event:created',
  EVENT_UPDATED: 'event:updated',
  EVENT_DELETED: 'event:deleted',
  EVENT_REGISTRATION: 'event:registration',
  EVENT_UNREGISTRATION: 'event:unregistration',

  // Exam Results
  EXAM_RESULT_BATCH_CREATED: 'exam:batch:created',
  EXAM_RESULT_BATCH_UPDATED: 'exam:batch:updated',
  EXAM_RESULT_BATCH_DELETED: 'exam:batch:deleted',
  EXAM_RESULT_BATCH_PUBLISHED: 'exam:batch:published',
  EXAM_RESULT_CREATED: 'exam:result:created',
  EXAM_RESULT_DELETED: 'exam:result:deleted',

  // Presence
  PRESENCE_UPDATE: 'presence:update',

  // Block/Unblock
  CONVERSATION_BLOCKED: 'conversation:blocked',
  CONVERSATION_UNBLOCKED: 'conversation:unblocked',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
