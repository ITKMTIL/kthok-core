import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const MAX_QUEUE_LENGTH = 50;

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
