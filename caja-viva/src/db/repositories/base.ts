import { getDB } from '../schema';
import type { UUID } from '../types';

export interface Repository<T extends { id: UUID }> {
  getAll(): Promise<T[]>;
  getById(id: UUID): Promise<T | undefined>;
  create(entity: T): Promise<T>;
  update(entity: T): Promise<T>;
  delete(id: UUID): Promise<void>;
  clear(): Promise<void>;
}

export function createBaseRepository<T extends { id: UUID }>(storeName: string): Repository<T> {
  return {
    async getAll(): Promise<T[]> {
      const db = await getDB();
      return db.getAll(storeName as any);
    },

    async getById(id: UUID): Promise<T | undefined> {
      const db = await getDB();
      return db.get(storeName as any, id);
    },

    async create(entity: T): Promise<T> {
      const db = await getDB();
      await db.add(storeName as any, entity);
      return entity;
    },

    async update(entity: T): Promise<T> {
      const db = await getDB();
      await db.put(storeName as any, entity);
      return entity;
    },

    async delete(id: UUID): Promise<void> {
      const db = await getDB();
      await db.delete(storeName as any, id);
    },

    async clear(): Promise<void> {
      const db = await getDB();
      await db.clear(storeName as any);
    },
  };
}