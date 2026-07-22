export interface AudioBlobRecord {
  id: string;
  voice: string;
  text: string;
  blob: Blob;
  createdAt: number;
}

export function audioId(voice: string, text: string): string {
  return `${voice}:${text.slice(0, 64)}`;
}