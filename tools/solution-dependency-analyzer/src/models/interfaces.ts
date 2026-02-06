// Core type definitions for solution dependency analysis

export type AssetKind = 
  | 'entity'
  | 'attribute'
  | 'relationship'
  | 'form'
  | 'view'
  | 'workflow'
  | 'plugin'
  | 'webresource'
  | 'app'
  | 'canvasapp'
  | 'report'
  | 'emailtemplate'
  | 'optionset'
  | 'connector'
  | 'sitemap'
  | 'role'
  | 'other';

export interface Asset {
  assetId: string;
  label: string;
  fullName: string;
  kind: AssetKind;
  logicalName: string;
  typeCode?: number;
  linksTo: string[];
  linkedBy?: string[];
  hasLoop: boolean;
  loopChain?: string[];
  notFound?: boolean;
}

export interface Link {
  sourceId: string;
  targetId: string;
  linkKind: 'direct' | 'indirect';
}

export interface SolutionRecord {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  version: string;
  publisherid: {
    friendlyname: string;
  };
  description?: string;
  ismanaged: boolean;
}

export interface AnalysisOutput {
  assets: Asset[];
  links: Link[];
  loops: string[][];
  notFoundAssets: Asset[];
  stats: {
    assetCount: number;
    linkCount: number;
    loopCount: number;
    kindStats: Record<AssetKind, number>;
  };
}
