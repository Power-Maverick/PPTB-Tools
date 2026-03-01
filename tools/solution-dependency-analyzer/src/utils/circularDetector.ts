import { Asset } from '../models/interfaces';

// Graph cycle finder using Tarjan's variant
export class LoopFinder {
  private registry: Map<string, Asset>;
  private visitRecord: Map<string, number>;
  private pathStack: string[];
  private discoveredLoops: string[][];
  private timestamp: number;

  constructor(assetList: Asset[]) {
    this.registry = new Map();
    this.visitRecord = new Map();
    this.pathStack = [];
    this.discoveredLoops = [];
    this.timestamp = 0;

    assetList.forEach(asset => {
      this.registry.set(asset.assetId, asset);
    });
  }

  findAllLoops(): string[][] {
    this.registry.forEach((_, assetId) => {
      if (!this.visitRecord.has(assetId)) {
        this.explorePath(assetId, new Set());
      }
    });

    return this.discoveredLoops;
  }

  private explorePath(currentId: string, activeSet: Set<string>): void {
    const asset = this.registry.get(currentId);
    if (!asset) return;

    if (activeSet.has(currentId)) {
      // Found a loop - extract it
      const loopStart = this.pathStack.indexOf(currentId);
      if (loopStart >= 0) {
        const loop = this.pathStack.slice(loopStart);
        loop.push(currentId); // Complete the cycle
        this.discoveredLoops.push(loop);
      }
      return;
    }

    if (this.visitRecord.has(currentId)) {
      return; // Already fully explored
    }

    // Mark as being explored
    activeSet.add(currentId);
    this.pathStack.push(currentId);

    // Explore all neighbors
    asset.linksTo.forEach(neighborId => {
      this.explorePath(neighborId, activeSet);
    });

    // Mark as fully explored
    this.visitRecord.set(currentId, this.timestamp++);
    activeSet.delete(currentId);
    this.pathStack.pop();
  }

  static markLoopAssets(assets: Asset[], loops: string[][]): void {
    const loopAssetSet = new Set<string>();
    
    loops.forEach(loop => {
      loop.forEach(assetId => loopAssetSet.add(assetId));
    });

    assets.forEach(asset => {
      if (loopAssetSet.has(asset.assetId)) {
        asset.hasLoop = true;
        // Find which loop this asset is part of
        const relevantLoop = loops.find(loop => loop.includes(asset.assetId));
        if (relevantLoop) {
          asset.loopChain = relevantLoop;
        }
      }
    });
  }
}
