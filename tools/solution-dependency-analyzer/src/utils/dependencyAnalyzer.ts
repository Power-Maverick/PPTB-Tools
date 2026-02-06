import { Asset, AssetKind, Link, AnalysisOutput } from '../models/interfaces';
import { LoopFinder } from './circularDetector';

export class DependencyScanner {
  private assetMap: Map<string, Asset>;
  private linkList: Link[];

  constructor() {
    this.assetMap = new Map();
    this.linkList = [];
  }

  registerAsset(
    id: string,
    name: string,
    fullName: string,
    kind: AssetKind,
    logicalName: string,
    dependencies: string[]
  ): void {
    const asset: Asset = {
      assetId: id,
      label: name,
      fullName: fullName,
      kind: kind,
      logicalName: logicalName,
      linksTo: dependencies,
      linkedBy: [],
      hasLoop: false,
      notFound: false
    };

    this.assetMap.set(id, asset);

    // Create link records
    dependencies.forEach(depId => {
      this.linkList.push({
        sourceId: id,
        targetId: depId,
        linkKind: 'direct'
      });
    });
  }

  computeReverseLinks(): void {
    this.assetMap.forEach(asset => {
      asset.linkedBy = [];
    });

    this.linkList.forEach(link => {
      const target = this.assetMap.get(link.targetId);
      if (target) {
        if (!target.linkedBy) {
          target.linkedBy = [];
        }
        target.linkedBy.push(link.sourceId);
      }
    });
  }

  identifyMissingAssets(): Asset[] {
    const missingList: Asset[] = [];
    const knownIds = new Set(this.assetMap.keys());

    this.linkList.forEach(link => {
      if (!knownIds.has(link.targetId)) {
        // Check if we already marked this as missing
        if (!this.assetMap.has(link.targetId)) {
          const missingAsset: Asset = {
            assetId: link.targetId,
            label: 'Unknown Asset',
            fullName: link.targetId,
            kind: 'other',
            logicalName: link.targetId,
            linksTo: [],
            linkedBy: [],
            hasLoop: false,
            notFound: true
          };
          this.assetMap.set(link.targetId, missingAsset);
          missingList.push(missingAsset);
        }
      }
    });

    return missingList;
  }

  performAnalysis(): AnalysisOutput {
    this.computeReverseLinks();
    const missingAssets = this.identifyMissingAssets();

    const assets = Array.from(this.assetMap.values());
    const loopFinder = new LoopFinder(assets);
    const loops = loopFinder.findAllLoops();

    LoopFinder.markLoopAssets(assets, loops);

    const stats = this.calculateStatistics(assets, loops);

    return {
      assets,
      links: this.linkList,
      loops,
      notFoundAssets: missingAssets,
      stats
    };
  }

  private calculateStatistics(assets: Asset[], loops: string[][]) {
    const kindStats: Record<AssetKind, number> = {
      entity: 0,
      attribute: 0,
      relationship: 0,
      form: 0,
      view: 0,
      workflow: 0,
      plugin: 0,
      webresource: 0,
      app: 0,
      other: 0
    };

    assets.forEach(asset => {
      kindStats[asset.kind]++;
    });

    return {
      assetCount: assets.length,
      linkCount: this.linkList.length,
      loopCount: loops.length,
      kindStats
    };
  }
}
