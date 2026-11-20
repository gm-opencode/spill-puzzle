/**
 * The only game API the UI uses (architecture §3). It owns the Pixi app, the board
 * state and the input machine. React never touches Pixi objects; it calls these
 * methods and listens to events.
 */
import {
  Graphics,
  ImageSource,
  Sprite,
  Texture,
  type Container,
  type FederatedPointerEvent,
} from 'pixi.js';
import { bakeAtlases, disposeBakeResult, type BakeOutcome } from './bake/bakeClient';
import { makeGrid, type Grid } from './geometry/grid';
import { generatePieceShapes } from './geometry/outline';
import type { Point, Rect } from './geometry/types';
import {
  bringToFront,
  createInitialState,
  drop,
  getGroup,
  groupOfPiece,
  groupRect,
  isComplete,
  moveGroup,
  rotateVec,
} from './model/groups';
import { boardProgress, connectedPieces } from './model/progress';
import { fromSavedState, toSavedState, type PuzzleMeta, type PuzzleState } from './model/save';
import { scatter } from './model/scatter';
import type { BoardState, QuarterTurns } from './model/types';
import {
  cameraLimits,
  clampCamera,
  fitRect,
  lerpCamera,
  unionRects,
  type Camera,
  type CameraLimits,
} from './render/camera';
import {
  createShadow,
  destroyShadow,
  highlight,
  LIFT_SCALE,
  prefersReducedMotion,
  SHADOW_OFFSET_PX,
  SNAP_MS,
  Tweens,
} from './render/effects';
import { createEngine, type Engine } from './render/engine';
import { InputMachine, type DragStart, type InputHost } from './render/input';
import { PieceLayer } from './render/pieceSprites';

/** Zoom-to-fit animation length in ms (spec §10: ≤ 200 ms). */
export const ZOOM_TO_FIT_MS = 200;

export interface SnapEvent {
  /** Group that now holds the merged pieces. */
  groupId: number;
  /** Pieces in that group. */
  pieces: number;
}

export interface GameProgress {
  /** Pieces joined to at least one other piece (the "23 / 48" display). */
  connected: number;
  total: number;
  /** `(pieces − groups) / (pieces − 1)` (spec §7). */
  fraction: number;
  complete: boolean;
}

interface GameEvents {
  /** The board changed (after every drop). Debounce saves on this. */
  change: [state: PuzzleState];
  /** Groups snapped together (FR-3.5: sound and haptics hook in here). */
  snap: [event: SnapEvent];
  /** All pieces form one group (FR-3.9). */
  complete: [];
}

type Listener<K extends keyof GameEvents> = (...args: GameEvents[K]) => void;

interface ActiveDrag {
  groupId: number;
  /** Grab point in group-local px; the container is lifted around it. */
  pivot: Point;
  rot: QuarterTurns;
  shadow: Container;
  /** Group origin as last shown on screen, in world px. */
  origin: Point;
}

export class GameController {
  private readonly tweens = new Tweens();
  private readonly input: InputMachine;
  private readonly listeners: { [K in keyof GameEvents]: Set<Listener<K>> } = {
    change: new Set(),
    snap: new Set(),
    complete: new Set(),
  };
  private readonly spriteTweens = new Map<Sprite, () => void>();
  /** Running "return to start" tweens of cancelled drags, by group id. */
  private readonly groupTweens = new Map<number, () => void>();
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private limits: CameraLimits;
  private cancelCameraTween: (() => void) | null = null;
  private drag: ActiveDrag | null = null;
  private preview: Container | null = null;
  private previewTexture: Texture | null = null;
  private destroyed = false;
  private readonly detach: Array<() => void> = [];

  private constructor(
    private readonly meta: PuzzleMeta,
    private readonly grid: Grid,
    private readonly engine: Engine,
    private readonly layer: PieceLayer,
    private readonly bake: BakeOutcome,
    private readonly image: ImageBitmap,
    private board: BoardState,
    private readonly scatterArea: Rect,
  ) {
    this.limits = this.computeLimits();
    this.input = new InputMachine(this.inputHost());
    this.bindEvents();
  }

  /**
   * Build a playable puzzle in `canvasHost` (which must have a size).
   * @param meta Puzzle definition; `rows`, `cols` and `seed` fix the cut.
   * @param image The stored, normalised image (1 px = 1 world px).
   * @param state Saved progress to resume, if any.
   * @param onProgress Generation progress in `[0, 1]` (FR-2.5).
   */
  static async create(
    canvasHost: HTMLElement,
    meta: PuzzleMeta,
    image: Blob,
    state?: PuzzleState,
    onProgress?: (p: number) => void,
  ): Promise<GameController> {
    onProgress?.(0);
    const bitmap = await createImageBitmap(image);
    let bake: BakeOutcome | null = null;
    let engine: Engine | null = null;
    try {
      const grid = makeGrid(bitmap.width, bitmap.height, meta.rows, meta.cols);
      const shapes = generatePieceShapes(grid, meta.seed);
      onProgress?.(0.05);
      bake = await bakeAtlases(bitmap, shapes, {
        onProgress: (p) => onProgress?.(0.05 + p * 0.9),
      });
      const portrait = canvasHost.clientHeight > canvasHost.clientWidth;
      const scattered = scatter(grid, meta.seed, { portrait });
      const board = state
        ? fromSavedState(grid, state)
        : createInitialState(grid, scattered.positions);

      engine = await createEngine(canvasHost);
      const layer = new PieceLayer(engine.world, shapes, bake, board);
      const controller = new GameController(
        meta,
        grid,
        engine,
        layer,
        bake,
        bitmap,
        board,
        scattered.area,
      );
      if (state) controller.applyCamera(state.camera);
      else controller.zoomToFit(false);
      onProgress?.(1);
      return controller;
    } catch (error) {
      engine?.destroy();
      if (bake) disposeBakeResult(bake);
      bitmap.close();
      throw error;
    }
  }

  /** Animate the camera to show the board and every piece (spec §6.5). */
  zoomToFit(animate = true): void {
    const target = clampCamera(
      fitRect(this.contentRect(), this.engine.viewport()),
      this.engine.viewport(),
      this.limits,
    );
    this.cancelCameraTween?.();
    const from = { ...this.camera };
    const duration = animate && !prefersReducedMotion() ? ZOOM_TO_FIT_MS : 0;
    this.cancelCameraTween = this.tweens.add(
      duration,
      (t) => this.applyCamera(lerpCamera(from, target, t)),
      () => (this.cancelCameraTween = null),
    );
  }

  /** Show or hide the original image over the play area (FR-3.7). Any tap hides it. */
  togglePreview(): void {
    if (this.preview) this.hidePreview();
    else this.showPreview();
  }

  get previewVisible(): boolean {
    return this.preview !== null;
  }

  /** Snapshot for saving (spec §7). */
  getState(): PuzzleState {
    return toSavedState(this.meta.id, this.board, this.camera);
  }

  getProgress(): GameProgress {
    return {
      connected: connectedPieces(this.board),
      total: this.board.pieceGroup.length,
      fraction: boardProgress(this.board),
      complete: isComplete(this.board),
    };
  }

  on<K extends keyof GameEvents>(event: K, cb: Listener<K>): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  /** Free all GPU textures, bitmaps and listeners (NFR-6). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.detach) off();
    this.tweens.clear();
    this.spriteTweens.clear();
    this.groupTweens.clear();
    this.hidePreview();
    this.previewTexture?.destroy(true);
    this.layer.destroy();
    disposeBakeResult(this.bake);
    this.image.close();
    this.engine.destroy();
    for (const set of Object.values(this.listeners)) set.clear();
  }

  // ---------------------------------------------------------------------------
  // Camera

  private applyCamera(camera: Camera): void {
    this.camera = clampCamera(camera, this.engine.viewport(), this.limits);
    this.engine.world.position.set(this.camera.x, this.camera.y);
    this.engine.world.scale.set(this.camera.scale);
  }

  private boardRect(): Rect {
    return { x: 0, y: 0, width: this.grid.width, height: this.grid.height };
  }

  /** Board plus every group. */
  private contentRect(): Rect {
    const rects = [this.boardRect()];
    for (const g of this.board.groups.values()) rects.push(groupRect(this.grid, g));
    return unionRects(rects);
  }

  private computeLimits(): CameraLimits {
    const playArea = unionRects([this.scatterArea, this.contentRect()]);
    return cameraLimits(this.boardRect(), playArea, this.engine.viewport());
  }

  private refreshLimits(): void {
    this.limits = this.computeLimits();
    this.applyCamera(this.camera);
  }

  // ---------------------------------------------------------------------------
  // Input

  private inputHost(): InputHost {
    return {
      getCamera: () => this.camera,
      setCamera: (c) => this.applyCamera(c),
      getViewport: () => this.engine.viewport(),
      beginDrag: (pieceId, grab) => this.beginDrag(pieceId, grab),
      moveDrag: (_groupId, origin) => this.moveDrag(origin),
      endDrag: (groupId, origin) => this.endDrag(groupId, origin),
      cancelDrag: (groupId, origin) => this.cancelDrag(groupId, origin),
      tap: () => {
        // Rotation on tap is P1 (FR-3.10). The group was already brought to the front.
      },
    };
  }

  private bindEvents(): void {
    const { app } = this.engine;
    const point = (e: FederatedPointerEvent): Point => ({ x: e.global.x, y: e.global.y });

    const down = (e: FederatedPointerEvent) => {
      if (this.preview) {
        this.hidePreview();
        return;
      }
      this.cancelCameraTween?.();
      this.cancelCameraTween = null;
      this.input.pointerDown(
        e.pointerId,
        point(e),
        this.layer.pieceOf(e.target),
        performance.now(),
      );
    };
    const move = (e: FederatedPointerEvent) => this.input.pointerMove(e.pointerId, point(e));
    const up = (e: FederatedPointerEvent) =>
      this.input.pointerUp(e.pointerId, point(e), performance.now());

    app.stage.on('pointerdown', down);
    app.stage.on('globalpointermove', move);
    app.stage.on('pointerup', up);
    app.stage.on('pointerupoutside', up);
    app.stage.on('pointercancel', up);
    this.detach.push(() => app.stage.removeAllListeners());

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.cancelCameraTween?.();
      this.input.wheel({ x: e.offsetX, y: e.offsetY }, e.deltaY, e.deltaMode);
    };
    app.canvas.addEventListener('wheel', wheel, { passive: false });
    this.detach.push(() => app.canvas.removeEventListener('wheel', wheel));

    const tick = () => {
      const dt = app.ticker.deltaMS;
      this.tweens.tick(dt);
      this.input.tick(dt);
    };
    app.ticker.add(tick);
    this.detach.push(() => app.ticker.remove(tick));

    this.detach.push(
      this.engine.onResize(() => {
        this.refreshLimits();
        if (this.preview) this.showPreview();
      }),
    );
  }

  private beginDrag(pieceId: number, grab: Point): DragStart | null {
    const group = groupOfPiece(this.board, pieceId);
    if (group.locked) return null;
    this.groupTweens.get(group.id)?.();
    this.groupTweens.delete(group.id);
    this.board = bringToFront(this.board, group.id);
    const g = getGroup(this.board, group.id);
    this.layer.sync(g);

    // Lift around the grab point: pivot = grab point in group-local px.
    const local = rotateVec(
      { x: grab.x - g.x, y: grab.y - g.y },
      ((4 - g.rot) % 4) as QuarterTurns,
    );
    const c = this.layer.container(g.id);
    const shadow = createShadow(this.layer.spritesOf(g), SHADOW_OFFSET_PX / this.camera.scale);
    c.addChildAt(shadow, 0);
    c.pivot.set(local.x, local.y);
    c.scale.set(LIFT_SCALE);
    this.drag = { groupId: g.id, pivot: local, rot: g.rot, shadow, origin: { x: g.x, y: g.y } };
    this.moveDrag({ x: g.x, y: g.y });
    return { groupId: g.id, origin: { x: g.x, y: g.y } };
  }

  private moveDrag(origin: Point): void {
    const d = this.drag;
    if (!d) return;
    d.origin = { ...origin };
    // Container position = where the grab point is in the world.
    const p = rotateVec(d.pivot, d.rot);
    this.layer.container(d.groupId).position.set(origin.x + p.x, origin.y + p.y);
  }

  /** Remove lift and shadow; the container goes back to plain origin positioning. */
  private settleDrag(): void {
    const d = this.drag;
    if (!d) return;
    destroyShadow(d.shadow);
    this.drag = null;
  }

  private cancelDrag(groupId: number, startOrigin: Point): void {
    const shownAt = this.drag?.origin ?? startOrigin;
    this.settleDrag();
    const group = getGroup(this.board, groupId);
    this.layer.sync(group);
    const c = this.layer.container(groupId);
    const duration = prefersReducedMotion() ? 0 : SNAP_MS;
    const cancel = this.tweens.add(
      duration,
      (t) =>
        c.position.set(
          shownAt.x + (startOrigin.x - shownAt.x) * t,
          shownAt.y + (startOrigin.y - shownAt.y) * t,
        ),
      () => this.groupTweens.delete(groupId),
    );
    this.groupTweens.set(groupId, () => {
      cancel();
      c.position.set(startOrigin.x, startOrigin.y);
    });
  }

  private endDrag(groupId: number, origin: Point): void {
    this.settleDrag();
    const moved = moveGroup(this.board, groupId, origin.x, origin.y);
    const result = drop(moved, groupId);
    this.board = result.state;

    if (!result.snapped) {
      this.layer.sync(getGroup(this.board, groupId));
      this.afterBoardChange();
      return;
    }

    const winner = getGroup(this.board, result.groupId);
    // Groups that jump to the winner's origin, with where they were before.
    const jumped = result.absorbed.map((id) => getGroup(moved, id));
    this.layer.merge(winner, result.absorbed);
    this.animateSnap(winner.x, winner.y, winner.rot, jumped);
    highlight(this.tweens, this.layer.container(winner.id), this.layer.spritesOf(winner));

    this.emit('snap', { groupId: winner.id, pieces: winner.pieces.length });
    this.afterBoardChange();
    if (result.completed) this.emit('complete');
  }

  /**
   * Slide the sprites of groups that changed origin from where they were to their
   * new place, over {@link SNAP_MS} (spec §6.1 step 4).
   */
  private animateSnap(
    x: number,
    y: number,
    rot: QuarterTurns,
    jumped: ReadonlyArray<{ x: number; y: number; pieces: readonly number[] }>,
  ): void {
    if (prefersReducedMotion()) return;
    const inverse = ((4 - rot) % 4) as QuarterTurns;
    for (const g of jumped) {
      const delta = rotateVec({ x: g.x - x, y: g.y - y }, inverse);
      if (delta.x === 0 && delta.y === 0) continue;
      for (const id of g.pieces) {
        const sprite = this.layer.sprites[id]!;
        const frame = this.bake.frames[id]!;
        this.spriteTweens.get(sprite)?.();
        const cancel = this.tweens.add(
          SNAP_MS,
          (t) =>
            sprite.position.set(frame.worldX + delta.x * (1 - t), frame.worldY + delta.y * (1 - t)),
          () => this.spriteTweens.delete(sprite),
        );
        this.spriteTweens.set(sprite, () => {
          cancel();
          sprite.position.set(frame.worldX, frame.worldY);
        });
      }
    }
  }

  private afterBoardChange(): void {
    this.refreshLimits();
    this.emit('change', this.getState());
  }

  private emit<K extends keyof GameEvents>(event: K, ...args: GameEvents[K]): void {
    for (const cb of [...this.listeners[event]]) (cb as (...a: GameEvents[K]) => void)(...args);
  }

  // ---------------------------------------------------------------------------
  // Preview (FR-3.7)

  private showPreview(): void {
    this.hidePreview();
    const { width, height } = this.engine.viewport();
    this.previewTexture ??= new Texture({ source: new ImageSource({ resource: this.image }) });
    const backdrop = new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.8 });
    backdrop.label = 'preview';
    const sprite = new Sprite(this.previewTexture);
    const pad = 24;
    const scale = Math.min(
      (width - 2 * pad) / this.grid.width,
      (height - 2 * pad) / this.grid.height,
    );
    sprite.scale.set(Math.max(0.01, scale));
    sprite.position.set(
      (width - this.grid.width * sprite.scale.x) / 2,
      (height - this.grid.height * sprite.scale.y) / 2,
    );
    backdrop.addChild(sprite);
    this.engine.overlay.addChild(backdrop);
    this.preview = backdrop;
  }

  private hidePreview(): void {
    this.preview?.destroy({ children: true });
    this.preview = null;
  }
}
