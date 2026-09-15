import { Model, UpdateQuery } from 'mongoose';

/**
 * Standard Repository Interface
 */
export interface IBaseRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findOne(filter: Record<string, unknown>): Promise<T | null>;
  findAll(filter?: Record<string, unknown>): Promise<T[]>;
  create(entity: Partial<T>, options?: { session?: import('mongoose').ClientSession }): Promise<T>;
  update(id: ID, entity: UpdateQuery<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
}

/**
 * Generic Mongoose Repository Implementation
 * Implements standard CRUD operations delegating to Mongoose model.
 */
export abstract class BaseRepository<T, ID = string> implements IBaseRepository<T, ID> {
  protected constructor(protected readonly model: Model<T>) {}

  public async findById(id: ID): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  public async findOne(filter: Record<string, unknown>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  public async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
    return this.model.find(filter).exec();
  }

  public async create(entity: Partial<T>, options?: { session?: import('mongoose').ClientSession }): Promise<T> {
    const created = new this.model(entity);
    const saved = await created.save(options);
    return saved as unknown as T;
  }

  public async update(id: ID, entity: UpdateQuery<T>): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, entity, { returnDocument: 'after' }).exec();
  }

  public async delete(id: ID): Promise<boolean> {
    const res = await this.model.findByIdAndDelete(id).exec();
    return res !== null;
  }
}
