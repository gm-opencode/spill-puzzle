/**
 * Piece sprites (architecture §6): one `Container` per group holding that group's
 * piece `Sprite`s, cut from the baked atlases, each with a shared polygon `hitArea`
 * (spec §4.5, FR-3.3). Sprites are positioned in puzzle coordinates inside their group
 * container, whose transform is the group's origin and rotation.
 *
 * This layer never decides game truth: it mirrors the {@link BoardState} it is given.
 */
import { Container, ImageSource, Polygon, Rectangle, Sprite, Texture } from 'pixi.js';
import type { BakeResult } from '../bake/bakePieces';
import { pieceHitPolygon, toFlatArray } from '../geometry/flatten';
import type { PieceShape } from '../geometry/outline';
import type { BoardState, Group } from '../model/types';

/** zIndex offset that keeps locked groups below unlocked ones (spec §6.3). */
const LOCKED_Z_OFFSET = -1e6;

export class PieceLayer {
  private readonly sources: ImageSource[];
  private readonly textures: Texture[];
  /** By piece id. */
  readonly sprites: Sprite[];
  private readonly containers = new Map<number, Container>();
  private readonly pieceOfSprite = new WeakMap<Container, number>();

  constructor(
    private readonly world: Container,
    shapes: readonly PieceShape[],
    bake: BakeResult,
    board: BoardState,
  ) {
    this.sources = bake.atlases.map((bitmap) => new ImageSource({ resource: bitmap }));
    this.textures = bake.frames.map(
      (f) =>
        new Texture({
          source: this.sources[f.atlas]!,
          frame: new Rectangle(f.x, f.y, f.width, f.height),
        }),
    );
    this.sprites = shapes.map((shape, id) => {
      const frame = bake.frames[id]!;
      const sprite = new Sprite(this.textures[id]!);
      sprite.position.set(frame.worldX, frame.worldY);
      sprite.eventMode = 'static';
      sprite.cursor = 'grab';
      sprite.hitArea = new Polygon(
        toFlatArray(pieceHitPolygon(shape.outline, { x: frame.worldX, y: frame.worldY })),
      );
      sprite.label = `piece:${id}`;
      this.pieceOfSprite.set(sprite, id);
      return sprite;
    });
    for (const group of board.groups.values()) this.addGroup(group);
  }

  /** Piece id of a hit display object, or `null` for anything else. */
  pieceOf(target: unknown): number | null {
    return target instanceof Container ? (this.pieceOfSprite.get(target) ?? null) : null;
  }

  container(groupId: number): Container {
    const c = this.containers.get(groupId);
    if (!c) throw new RangeError(`No container for group ${groupId}`);
    return c;
  }

  /** Sprites of a group's pieces. */
  spritesOf(group: Pick<Group, 'pieces'>): Sprite[] {
    return group.pieces.map((id) => this.sprites[id]!);
  }

  /** Apply a group's position, rotation and z-order to its container. */
  sync(group: Group): void {
    const c = this.container(group.id);
    c.pivot.set(0, 0);
    c.scale.set(1);
    c.position.set(group.x, group.y);
    c.rotation = (group.rot * Math.PI) / 2;
    c.zIndex = group.locked ? group.z + LOCKED_Z_OFFSET : group.z;
  }

  /**
   * After a merge: move the absorbed groups' sprites into the winner's container
   * and destroy the empty containers. Sprite positions are in puzzle coordinates,
   * so they stay valid in the new parent.
   */
  merge(winner: Group, absorbed: readonly number[]): void {
    const target = this.container(winner.id);
    for (const id of absorbed) {
      const c = this.container(id);
      for (const child of [...c.children]) {
        if (child instanceof Sprite && this.pieceOfSprite.has(child)) target.addChild(child);
      }
      this.containers.delete(id);
      c.destroy({ children: true }); // only leftover effects remain in it
    }
    this.sync(winner);
  }

  /** Rebuild every container from a board (e.g. after loading a save). */
  reset(board: BoardState): void {
    for (const c of this.containers.values()) {
      c.removeChildren();
      c.destroy();
    }
    this.containers.clear();
    for (const group of board.groups.values()) this.addGroup(group);
  }

  /** Free sprites, textures and GPU memory (NFR-6). The atlas bitmaps are closed by the caller. */
  destroy(): void {
    for (const c of this.containers.values()) c.destroy({ children: true });
    this.containers.clear();
    for (const t of this.textures) t.destroy(false);
    for (const s of this.sources) s.destroy();
  }

  private addGroup(group: Group): void {
    const c = new Container({ label: `group:${group.id}` });
    for (const id of group.pieces) c.addChild(this.sprites[id]!);
    this.containers.set(group.id, c);
    this.world.addChild(c);
    this.sync(group);
  }
}
