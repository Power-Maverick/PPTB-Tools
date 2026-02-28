import { AnalysisOutput, Asset, AssetKind, Link } from "../models/interfaces";
import { LoopFinder } from "./circularDetector";

export class DependencyScanner {
    private assetMap: Map<string, Asset>;
    private linkList: Link[];

    constructor() {
        this.assetMap = new Map();
        this.linkList = [];
    }

    registerAsset(id: string, name: string, fullName: string, kind: AssetKind, logicalName: string, dependencies: string[], warningMessage?: string, typeCode?: number, isManaged?: boolean): void;
    registerAsset(asset: Asset): void;
    registerAsset(
        idOrAsset: string | Asset,
        name?: string,
        fullName?: string,
        kind?: AssetKind,
        logicalName?: string,
        dependencies?: string[],
        warningMessage?: string,
        typeCode?: number,
        isManaged?: boolean,
    ): void {
        let asset: Asset;

        if (typeof idOrAsset === "string") {
            // Old signature
            asset = {
                assetId: idOrAsset,
                label: name!,
                fullName: fullName!,
                kind: kind!,
                logicalName: logicalName!,
                typeCode,
                isManaged,
                linksTo: dependencies || [],
                linkedBy: [],
                hasLoop: false,
                notFound: false,
                hasWarning: !!warningMessage,
                warningMessage: warningMessage,
            };
        } else {
            // New signature - Asset object
            asset = {
                ...idOrAsset,
                linkedBy: idOrAsset.linkedBy || [],
                hasLoop: idOrAsset.hasLoop || false,
                notFound: idOrAsset.notFound || false,
            };
        }

        this.assetMap.set(asset.assetId, asset);

        // Create link records
        asset.linksTo.forEach((depId) => {
            this.linkList.push({
                sourceId: asset.assetId,
                targetId: depId,
                linkKind: "direct",
            });
        });
    }

    computeReverseLinks(): void {
        this.assetMap.forEach((asset) => {
            asset.linkedBy = [];
        });

        this.linkList.forEach((link) => {
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

        this.linkList.forEach((link) => {
            if (!knownIds.has(link.targetId)) {
                // Check if we already marked this as missing
                if (!this.assetMap.has(link.targetId)) {
                    const missingAsset: Asset = {
                        assetId: link.targetId,
                        label: "Unknown Asset",
                        fullName: link.targetId,
                        kind: "other",
                        logicalName: link.targetId,
                        linksTo: [],
                        linkedBy: [],
                        hasLoop: false,
                        notFound: true,
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
        this.nestAttributes();
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
            stats,
        };
    }

    private nestAttributes(): void {
        const attributes: Asset[] = [];

        // Collect all attributes
        this.assetMap.forEach((asset) => {
            if (asset.kind === "attribute" && asset.parentEntityId) {
                attributes.push(asset);
            }
        });

        // Nest attributes under their parent entities
        attributes.forEach((attr) => {
            const parentEntity = this.assetMap.get(attr.parentEntityId!);
            if (parentEntity) {
                if (!parentEntity.children) {
                    parentEntity.children = [];
                }
                parentEntity.children.push(attr);
            }
        });
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
            canvasapp: 0,
            report: 0,
            emailtemplate: 0,
            optionset: 0,
            connector: 0,
            sitemap: 0,
            role: 0,
            other: 0,
        };

        assets.forEach((asset) => {
            kindStats[asset.kind]++;
        });

        return {
            assetCount: assets.length,
            linkCount: this.linkList.length,
            loopCount: loops.length,
            kindStats,
        };
    }
}
