import type { IntelligenceBucket, ModelCatalog, ModelQuotaRecord, ModelSortKey, ModelsResponse, ProviderId, QuotaAxiResponse } from "./types.js";
export declare const MODEL_CATALOG_PROVIDER_IDS: readonly ProviderId[];
export declare const MODEL_SORT_KEYS: readonly ["runway"];
export type ModelComparator = {
    compare: (left: ModelQuotaRecord, right: ModelQuotaRecord) => number;
    tieKey: (model: ModelQuotaRecord) => string;
};
/**
 * Registry for explicit, evidence-only ordering. New comparators (such as a
 * future cost comparator) belong here with their data dependency and docs.
 */
export declare const MODEL_COMPARATORS: Readonly<Record<ModelSortKey, ModelComparator>>;
export declare function createModelsResponse(quota: QuotaAxiResponse, options?: {
    intelligence?: IntelligenceBucket;
    sort?: ModelSortKey;
    catalog?: ModelCatalog;
}): ModelsResponse;
/**
 * Sort by observable usable runway only. It does not assess model capability,
 * task fit, credentials, prices, or a route. Unknown evidence remains last.
 */
export declare function compareModelsByRunway(left: ModelQuotaRecord, right: ModelQuotaRecord): number;
export declare function validateModelCatalog(catalog: ModelCatalog): void;
