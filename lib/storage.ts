import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export type UploadCategory = 'posts' | 'activities' | 'chat' | 'events' | 'exam-results';

const SUBDIR_MAP: Record<string, string> = {
  jpg: 'images', jpeg: 'images', png: 'images', gif: 'images', webp: 'images',
  mp4: 'videos', mov: 'videos', avi: 'videos',
  pdf: 'pdfs',
  doc: 'documents', docx: 'documents', xls: 'documents', xlsx: 'documents',
  ppt: 'documents', pptx: 'documents',
  zip: 'archives', txt: 'documents', csv: 'documents',
};

function getSubdir(filename: string): string {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return SUBDIR_MAP[ext] || 'misc';
}

function getCategoryDir(category: UploadCategory, subdir: string): string {
  switch (category) {
    case 'posts':
      return subdir === 'images' ? 'posts/images' : 'posts/videos';
    case 'activities':
      return 'activities/media';
    case 'chat':
      return 'chat/attachments';
    case 'events':
      return 'events/images';
    case 'exam-results':
      return 'exam-results/pdfs';
  }
}

export async function saveFile(
  category: UploadCategory,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string; publicUrl: string }> {
  const ext = path.extname(filename);
  const uniqueName = `${uuidv4()}${ext}`;
  const subdir = getSubdir(filename);
  const dirPath = path.join(UPLOADS_DIR, getCategoryDir(category, subdir));

  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, uniqueName);
  await fs.writeFile(filePath, buffer);

  const relativePath = path.relative(UPLOADS_DIR, filePath);
  const publicUrl = `/api/files/${encodeURIComponent(relativePath)}`;

  return { filePath: relativePath, publicUrl };
}

export async function getFilePath(relativePath: string): Promise<string> {
  const fullPath = path.join(UPLOADS_DIR, relativePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(UPLOADS_DIR)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

export async function deleteFile(relativePath: string): Promise<void> {
  const fullPath = await getFilePath(relativePath);
  await fs.unlink(fullPath).catch(() => {});
}
