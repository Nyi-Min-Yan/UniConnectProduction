import Dexie, { Table } from 'dexie';

export interface OfflineUser {
  id?: number;
  userId: string;
  email: string;
  name: string;
  role: string;
  departmentId?: string;
  avatar?: string;
  synced: boolean;
  updatedAt: number;
}

export interface OfflinePost {
  id?: number;
  postId: string;
  authorId: string;
  content: string;
  image?: string;
  tags: string[];
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  timestamp: number;
  synced: boolean;
  createdAt: number;
}

export interface OfflineConversation {
  id?: number;
  conversationId: string;
  participantIds: string[];
  lastMessage?: string;
  lastMessageAt: number;
  unreadCount: number;
  synced: boolean;
}

export interface OfflineMessage {
  id?: number;
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: number;
  read: boolean;
  synced: boolean;
}

export interface OfflineEvent {
  id?: number;
  eventId: string;
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  location: string;
  departmentId: string;
  organizerId: string;
  attendees: string[];
  synced: boolean;
}

export interface OfflineExamResult {
  id?: number;
  resultId: string;
  studentId: string;
  termId: string;
  subjectCode: string;
  subjectName: string;
  grade: string;
  marks: number;
  publishedAt: number;
  synced: boolean;
}

export interface OfflineAttendance {
  id?: number;
  attendanceId: string;
  studentId: string;
  sessionId: string;
  subjectCode: string;
  status: 'PRESENT' | 'ABSENT';
  remark?: string;
  markedAt: number;
  synced: boolean;
}

export interface SyncQueueItem {
  id?: number;
  endpoint: string;
  method: string;
  body: Record<string, unknown>;
  timestamp: number;
  retries: number;
  priority: 'high' | 'normal' | 'low';
}

export interface OfflinePresence {
  id?: number;
  email: string;
  online: boolean;
  lastSeen: number;
  updatedAt: number;
}

export class OfflineDB extends Dexie {
  users!: Table<OfflineUser>;
  posts!: Table<OfflinePost>;
  conversations!: Table<OfflineConversation>;
  messages!: Table<OfflineMessage>;
  events!: Table<OfflineEvent>;
  examResults!: Table<OfflineExamResult>;
  attendance!: Table<OfflineAttendance>;
  syncQueue!: Table<SyncQueueItem>;
  presence!: Table<OfflinePresence>;

  constructor() {
    super('UniConnectOffline');
    this.version(1).stores({
      users: '++id, userId, email, role, departmentId, synced, updatedAt',
      posts: '++id, postId, authorId, timestamp, synced, createdAt',
      conversations: '++id, conversationId, lastMessageAt, synced',
      messages: '++id, messageId, conversationId, timestamp, synced',
      events: '++id, eventId, departmentId, startTime, synced',
      examResults: '++id, resultId, studentId, termId, synced',
      attendance: '++id, attendanceId, studentId, sessionId, synced',
      syncQueue: '++id, endpoint, method, timestamp, retries, priority',
      presence: '++id, email, online, lastSeen, updatedAt',
    });
  }
}

export const offlineDB = new OfflineDB();

offlineDB.open().catch((err) => {
  console.error('Failed to open offline database:', err);
});