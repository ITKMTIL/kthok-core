import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const MAX_QUEUE_LENGTH = 50;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const VIDEO_ID = /^[\w-]{11}$/;
const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];

export interface Track {
  id: string;
  videoId: string;
  title: string;
  addedBy: string;
}

interface RoomMusic {
  current: Track | null;
  queue: Track[];
  playing: boolean;
  positionSec: number;
  updatedAt: number;
}

export interface MusicSnapshot {
  current: Track | null;
  queue: Track[];
  playing: boolean;
  positionSec: number;
}

export function parseVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
    id = prefix
      ? url.pathname.slice(prefix.length).split('/')[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

@Injectable()
export class MusicService {
  private readonly rooms = new Map<string, RoomMusic>();

  snapshot(roomId: string, now = Date.now()): MusicSnapshot {
    const music = this.rooms.get(roomId);
    if (!music) {
      return { current: null, queue: [], playing: false, positionSec: 0 };
    }
    return {
      current: music.current,
      queue: music.queue,
      playing: music.playing,
      positionSec: this.positionAt(music, now),
    };
  }

  add(
    roomId: string,
    track: Omit<Track, 'id'>,
    now = Date.now(),
  ): Track | null {
    const music = this.rooms.get(roomId) ?? this.create(roomId, now);
    if (music.queue.length >= MAX_QUEUE_LENGTH) return null;

    const added: Track = { id: randomUUID(), ...track };
    if (music.current) {
      music.queue.push(added);
    } else {
      this.start(music, added, now);
    }
    return added;
  }

  play(roomId: string, now = Date.now()): boolean {
    const music = this.rooms.get(roomId);
    if (!music?.current || music.playing) return false;
    music.playing = true;
    music.updatedAt = now;
    return true;
  }

  pause(roomId: string, now = Date.now()): boolean {
    const music = this.rooms.get(roomId);
    if (!music?.current || !music.playing) return false;
    music.positionSec = this.positionAt(music, now);
    music.playing = false;
    music.updatedAt = now;
    return true;
  }

  skip(roomId: string, trackId: string, now = Date.now()): boolean {
    const music = this.rooms.get(roomId);
    if (!music?.current || music.current.id !== trackId) return false;
    this.start(music, music.queue.shift() ?? null, now);
    return true;
  }

  remove(roomId: string, trackId: string): boolean {
    const music = this.rooms.get(roomId);
    const index = music?.queue.findIndex((track) => track.id === trackId) ?? -1;
    if (!music || index < 0) return false;
    music.queue.splice(index, 1);
    return true;
  }

  clear(roomId: string) {
    this.rooms.delete(roomId);
  }

  private create(roomId: string, now: number): RoomMusic {
    const music: RoomMusic = {
      current: null,
      queue: [],
      playing: false,
      positionSec: 0,
      updatedAt: now,
    };
    this.rooms.set(roomId, music);
    return music;
  }

  private start(music: RoomMusic, track: Track | null, now: number) {
    music.current = track;
    music.playing = track !== null;
    music.positionSec = 0;
    music.updatedAt = now;
  }

  private positionAt(music: RoomMusic, now: number): number {
    return music.playing
      ? music.positionSec + (now - music.updatedAt) / 1000
      : music.positionSec;
  }
}
